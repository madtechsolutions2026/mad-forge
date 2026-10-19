// Repeat-safe demonstration workspace. Uses the same posting services as the API.
// Run through the root seed command AFTER `npm run build` and database migrations.
const { randomUUID } = require("node:crypto");

async function seedOperations(pool, companyId, ownerId) {
  const service = require("../dist/modules/erp/erp.service.js");
  const { stock, code, audit } = require("../dist/modules/erp/erp.core.js");
  const client = await pool.connect();
  const w = { companyId, userId: ownerId, role: "owner" };
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(73103,hashtext($1))", [companyId]);
    const exists = await client.query("SELECT 1 FROM erp_demo_seeds WHERE company_id=$1", [companyId]);
    if (exists.rowCount) {
      await client.query("COMMIT");
      return { seeded: false, message: "Operations demonstration data already exists" };
    }
    const primary = await service.createWarehouse(client, w, { code: "CHN-01", name: "Chennai · Main factory" });
    const secondary = await service.createWarehouse(client, w, { code: "BLR-02", name: "Bengaluru · Distribution" });
    const itemInputs = [
      ["RM-BAM-01", "Bamboo fibre", "raw", "kg", "350", "78", "0"],
      ["RM-KRF-02", "Kraft packaging paper", "raw", "kg", "100", "56", "0"],
      ["RM-COAT-03", "Food-grade plant coating", "raw", "litre", "15", "165", "0"],
      ["RM-LBL-04", "Printed product labels", "raw", "pcs", "2500", "0.8", "0"],
      ["RM-SLV-05", "Kraft cup sleeves", "raw", "pcs", "1200", "1.25", "0"],
      ["RM-CTN-06", "Shipping cartons", "raw", "pcs", "100", "24", "0"],
      ["FG-PLT-10", "Everyday bamboo plate · 10 inch", "finished", "pcs", "2500", "9.8", "15"],
      ["FG-BWL-06", "Bamboo serving bowl · 6 inch", "finished", "pcs", "1800", "11.5", "18"],
      ["FG-CUP-250", "Bamboo cup · 250 ml", "finished", "pcs", "2000", "7.2", "12"],
      ["FG-SPN-16", "Bamboo spoon · 16 cm", "finished", "pcs", "3500", "1.8", "3.5"]
    ];
    const items = [];
    for (const [sku, name, kind, unit, reorderLevel, unitCost, sellingPrice] of itemInputs) {
      const item = await service.createItem(client, w, { sku, name, kind, unit, reorderLevel, unitCost, sellingPrice });
      items.push({ ...item, unitCost });
    }
    const suppliers = [];
    for (const input of [
      { code: "SUP-001", name: "Western Ghats Bamboo Co. (Demo)", email: "supply@example.com", phone: "+91 90000 10001", address: "Coimbatore, Tamil Nadu" },
      { code: "SUP-002", name: "EarthPack Materials (Demo)", email: "earthpack@example.com", address: "Hosur, Tamil Nadu" },
      { code: "SUP-003", name: "Evergreen Coatings (Demo)", email: "coatings@example.com", address: "Bengaluru, Karnataka" }
    ]) suppliers.push(await service.createParty(client, w, input, "supplier"));
    const customers = [];
    for (const input of [
      { code: "CUS-001", name: "The Green Table (Demo)", email: "greentable@example.com", address: "Chennai, Tamil Nadu" },
      { code: "CUS-002", name: "Sunday Social Catering (Demo)", email: "sundaysocial@example.com", address: "Bengaluru, Karnataka" },
      { code: "CUS-003", name: "Roots Hospitality (Demo)", email: "roots@example.com", address: "Hyderabad, Telangana" },
      { code: "CUS-004", name: "Terra Market (Demo)", email: "terra@example.com", address: "Pune, Maharashtra" }
    ]) customers.push(await service.createParty(client, w, input, "customer"));
    const openingId = randomUUID();
    const openingCode = await code(client, companyId, "OPEN");
    const opening = ["940", "120", "65", "12000", "650", "85", "6200", "3600", "4800", "9000"];
    for (let index = 0; index < items.length; index++) {
      await stock(client, w, { warehouseId: primary.id, itemId: items[index].id, quantity: opening[index], unitCost: items[index].unitCost, movement: "opening", referenceId: openingId, referenceCode: openingCode, note: "Demonstration opening stock; replace with verified opening balances before real use" });
    }
    await stock(client, w, { warehouseId: secondary.id, itemId: items[6].id, quantity: "1200", unitCost: items[6].unitCost, movement: "opening", referenceId: openingId, referenceCode: openingCode, note: "Demonstration distribution stock" });
    await stock(client, w, { warehouseId: secondary.id, itemId: items[8].id, quantity: "900", unitCost: items[8].unitCost, movement: "opening", referenceId: openingId, referenceCode: openingCode, note: "Demonstration distribution stock" });
    await audit(client, w, "demo.opening_stock", "opening", openingId, "Demonstration opening balances recorded with a stock ledger trail");

    const purchase1 = await service.createPurchaseOrder(client, w, { supplierId: suppliers[0].id, warehouseId: primary.id, lines: [{ itemId: items[0].id, quantity: "1200", unitPrice: "78" }] });
    const p1 = (await client.query("SELECT id FROM erp_purchase_lines WHERE company_id=$1 AND purchase_order_id=$2", [companyId, purchase1.id])).rows[0];
    const receipt1 = await service.receivePurchaseOrder(client, w, { lines: [{ lineId: p1.id, quantity: "800" }], note: "Demonstration partial delivery" }, purchase1.id);
    const bill1 = await service.createBill(client, w, {}, receipt1.id, "payable");
    await service.recordPayment(client, w, { billId: bill1.id, amount: "35000", method: "bank", note: "Demonstration supplier instalment" });
    const purchase2 = await service.createPurchaseOrder(client, w, { supplierId: suppliers[1].id, warehouseId: primary.id, lines: [{ itemId: items[4].id, quantity: "3000", unitPrice: "1.25" }, { itemId: items[5].id, quantity: "250", unitPrice: "24" }] });
    const p2 = (await client.query("SELECT id,quantity FROM erp_purchase_lines WHERE company_id=$1 AND purchase_order_id=$2", [companyId, purchase2.id])).rows;
    const receipt2 = await service.receivePurchaseOrder(client, w, { lines: p2.map((line) => ({ lineId: line.id, quantity: line.quantity })) }, purchase2.id);
    const bill2 = await service.createBill(client, w, {}, receipt2.id, "payable");
    await service.recordPayment(client, w, { billId: bill2.id, amount: "9750", method: "bank" });
    await service.createPurchaseOrder(client, w, { supplierId: suppliers[2].id, warehouseId: primary.id, lines: [{ itemId: items[2].id, quantity: "100", unitPrice: "165" }] });
    await service.createPurchaseOrder(client, w, { supplierId: suppliers[1].id, warehouseId: primary.id, lines: [{ itemId: items[1].id, quantity: "400", unitPrice: "56" }] });
    const bom1 = await service.createBom(client, w, { productId: items[6].id, name: "10-inch plate · standard recipe", lines: [{ itemId: items[0].id, quantity: "0.075" }, { itemId: items[2].id, quantity: "0.005" }, { itemId: items[3].id, quantity: "1" }] });
    const bom2 = await service.createBom(client, w, { productId: items[7].id, name: "6-inch bowl · standard recipe", lines: [{ itemId: items[0].id, quantity: "0.09" }, { itemId: items[2].id, quantity: "0.006" }, { itemId: items[3].id, quantity: "1" }] });
    const bom3 = await service.createBom(client, w, { productId: items[8].id, name: "250 ml cup · standard recipe", lines: [{ itemId: items[0].id, quantity: "0.04" }, { itemId: items[2].id, quantity: "0.002" }, { itemId: items[4].id, quantity: "1" }] });
    const wo1 = await service.createWorkOrder(client, w, { bomId: bom1.id, warehouseId: primary.id, plannedQuantity: "2400" });
    await service.startWorkOrder(client, w, {}, wo1.id);
    await service.completeWorkOrder(client, w, { goodQuantity: "2350", rejectedQuantity: "50", labourCost: "3600", returns: [{ itemId: items[0].id, quantity: "4" }, { itemId: items[2].id, quantity: "0.3" }, { itemId: items[3].id, quantity: "50" }] }, wo1.id);
    const wo2 = await service.createWorkOrder(client, w, { bomId: bom2.id, warehouseId: primary.id, plannedQuantity: "1600" });
    await service.startWorkOrder(client, w, {}, wo2.id);
    await service.createWorkOrder(client, w, { bomId: bom3.id, warehouseId: primary.id, plannedQuantity: "3000" });
    await service.createWorkOrder(client, w, { bomId: bom1.id, warehouseId: primary.id, plannedQuantity: "4200" });

    const order1 = await service.createSalesOrder(client, w, { customerId: customers[0].id, warehouseId: primary.id, lines: [{ itemId: items[6].id, quantity: "3000", unitPrice: "15" }, { itemId: items[9].id, quantity: "3000", unitPrice: "3.5" }] });
    const s1 = (await client.query("SELECT id,quantity FROM erp_sales_lines WHERE company_id=$1 AND sales_order_id=$2", [companyId, order1.id])).rows;
    const dispatch1 = await service.dispatchSalesOrder(client, w, { lines: s1.map((line) => ({ lineId: line.id, quantity: line.quantity })) }, order1.id);
    const invoice1 = await service.createBill(client, w, {}, dispatch1.id, "receivable");
    await service.recordPayment(client, w, { billId: invoice1.id, amount: "40000", method: "bank", note: "Demonstration advance collection" });
    const order2 = await service.createSalesOrder(client, w, { customerId: customers[1].id, warehouseId: primary.id, lines: [{ itemId: items[7].id, quantity: "1800", unitPrice: "18" }, { itemId: items[8].id, quantity: "2000", unitPrice: "12" }] });
    const s2 = (await client.query("SELECT id,item_id FROM erp_sales_lines WHERE company_id=$1 AND sales_order_id=$2 ORDER BY item_id", [companyId, order2.id])).rows;
    const dispatch2 = await service.dispatchSalesOrder(client, w, { lines: s2.map((line) => ({ lineId: line.id, quantity: "1000" })) }, order2.id);
    await service.createBill(client, w, {}, dispatch2.id, "receivable");
    await service.createSalesOrder(client, w, { customerId: customers[2].id, warehouseId: primary.id, lines: [{ itemId: items[6].id, quantity: "2500", unitPrice: "14.5" }] });
    await service.createSalesOrder(client, w, { customerId: customers[3].id, warehouseId: primary.id, lines: [{ itemId: items[8].id, quantity: "1800", unitPrice: "11.5" }] });
    const today = new Date().toISOString().slice(0, 10);
    for (const input of [
      { category: "Utilities", description: "Factory power · demonstration expense", amount: "12450" },
      { category: "Logistics", description: "Outbound freight · demonstration expense", amount: "4800" },
      { category: "Maintenance", description: "Press servicing · demonstration expense", amount: "3600" },
      { category: "Office", description: "Factory consumables · demonstration expense", amount: "1850" }
    ]) await service.createExpense(client, w, { ...input, expenseDate: today });
    await client.query("INSERT INTO erp_demo_seeds(company_id,version) VALUES($1,1)", [companyId]);
    await client.query("COMMIT");
    return { seeded: true, message: "Coherent demonstration operations created" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { seedOperations };
