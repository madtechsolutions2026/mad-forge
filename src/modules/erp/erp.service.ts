import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { AppError } from "../../shared/app-error.js";
import {
  audit,
  code,
  first,
  id,
  text,
  decimal,
  list,
  unique,
  choice,
  date,
  stock,
  type Body,
  type Workspace,
} from "./erp.core.js";

export async function createItem(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const itemId = randomUUID();
  const name = text(input.name, "Name")!;
  await client.query(
    `INSERT INTO erp_items(id,company_id,sku,name,kind,unit,reorder_level,unit_cost,selling_price)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      itemId,
      w.companyId,
      text(input.sku, "SKU", 40)!.toUpperCase(),
      name,
      choice(input.kind, ["raw", "finished"], "Kind"),
      choice(input.unit, ["kg", "pcs", "litre", "metre", "pack"], "Unit"),
      decimal(input.reorderLevel, "Reorder level", { zero: true, fallback: "0" }),
      decimal(input.unitCost, "Unit cost", { zero: true, places: 4, fallback: "0" }),
      decimal(input.sellingPrice, "Selling price", { zero: true, places: 4, fallback: "0" }),
    ],
  );
  await audit(client, w, "item.created", "item", itemId, `Added ${name} to the item catalogue`);
  return { id: itemId };
}

export async function createWarehouse(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const warehouseId = randomUUID();
  const warehouseCode = text(input.code, "Code", 32)!.toUpperCase();
  const name = text(input.name, "Name")!;
  await client.query("INSERT INTO erp_warehouses(id,company_id,code,name) VALUES($1,$2,$3,$4)", [
    warehouseId,
    w.companyId,
    warehouseCode,
    name,
  ]);
  await audit(client, w, "warehouse.created", "warehouse", warehouseId, `Created ${name}`);
  return { id: warehouseId, code: warehouseCode };
}

export async function createParty(
  client: PoolClient,
  w: Workspace,
  input: Body,
  kind: "supplier" | "customer",
): Promise<Body> {
  const partyId = randomUUID();
  const partyCode = text(input.code, "Code", 32)!.toUpperCase();
  const name = text(input.name, "Name")!;
  const email = text(input.email, "Email", 254, true);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, "Enter a valid email address");
  await client.query(
    `INSERT INTO erp_parties(id,company_id,kind,code,name,email,phone,address) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      partyId,
      w.companyId,
      kind,
      partyCode,
      name,
      email,
      text(input.phone, "Phone", 32, true),
      text(input.address, "Address", 500, true),
    ],
  );
  await audit(client, w, `${kind}.created`, kind, partyId, `Added ${name}`);
  return { id: partyId, code: partyCode };
}

export async function adjustStock(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const itemId = id(input.itemId, "Item");
  const warehouseId = id(input.warehouseId, "Warehouse");
  const quantity = decimal(input.quantity, "Quantity", { signed: true });
  const note = text(input.note, "Adjustment reason", 500)!;
  const item = await first(client, "SELECT unit_cost FROM erp_items WHERE company_id=$1 AND id=$2", [
    w.companyId,
    itemId,
  ]);
  await first(client, "SELECT id FROM erp_warehouses WHERE company_id=$1 AND id=$2", [w.companyId, warehouseId]);
  const adjustmentId = randomUUID();
  const adjustmentCode = await code(client, w.companyId, "ADJ");
  await stock(client, w, {
    itemId,
    warehouseId,
    quantity,
    unitCost: item.unit_cost,
    movement: "adjustment",
    referenceId: adjustmentId,
    referenceCode: adjustmentCode,
    note,
  });
  await audit(client, w, "inventory.adjusted", "adjustment", adjustmentId, `${adjustmentCode}: ${note}`);
  return { id: adjustmentId, code: adjustmentCode };
}

export async function createPurchaseOrder(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const supplierId = id(input.supplierId, "Supplier");
  const warehouseId = id(input.warehouseId, "Warehouse");
  const orderDate = date(input.orderDate, "Order date", true);
  const expectedDate = date(input.expectedDate, "Expected delivery date", true);
  const effectiveDate = orderDate ?? (await client.query("SELECT CURRENT_DATE::text AS today")).rows[0].today;
  if (expectedDate && expectedDate < effectiveDate)
    throw new AppError(400, "Expected delivery cannot be before the order date");
  await first(client, "SELECT id FROM erp_parties WHERE company_id=$1 AND id=$2 AND kind='supplier'", [
    w.companyId,
    supplierId,
  ]);
  await first(client, "SELECT id FROM erp_warehouses WHERE company_id=$1 AND id=$2", [w.companyId, warehouseId]);
  const lines = list(input.lines).map((line) => ({
    itemId: id(line.itemId, "Item"),
    quantity: decimal(line.quantity, "Quantity"),
    unitPrice: decimal(line.unitPrice, "Unit price", { zero: true, places: 4 }),
  }));
  unique(lines.map((line) => line.itemId));
  const orderId = randomUUID();
  const orderCode = await code(client, w.companyId, "PO");
  await client.query(
    `INSERT INTO erp_purchase_orders(id,company_id,code,supplier_id,warehouse_id,order_date,expected_date,supplier_reference,payment_terms,delivery_address,notes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      orderId,
      w.companyId,
      orderCode,
      supplierId,
      warehouseId,
      effectiveDate,
      expectedDate,
      text(input.supplierReference, "Supplier reference", 100, true),
      text(input.paymentTerms, "Payment terms", 200, true),
      text(input.deliveryAddress, "Delivery address", 1000, true),
      text(input.notes, "Order notes", 2000, true),
    ],
  );
  for (const line of lines) {
    await first(client, "SELECT id FROM erp_items WHERE company_id=$1 AND id=$2", [w.companyId, line.itemId]);
    await client.query(
      "INSERT INTO erp_purchase_lines(id,company_id,purchase_order_id,item_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), w.companyId, orderId, line.itemId, line.quantity, line.unitPrice],
    );
  }
  await client.query(
    "UPDATE erp_purchase_orders SET total=(SELECT SUM(quantity*unit_price) FROM erp_purchase_lines WHERE company_id=$1 AND purchase_order_id=$2) WHERE company_id=$1 AND id=$2",
    [w.companyId, orderId],
  );
  await audit(client, w, "purchase_order.created", "purchase_order", orderId, `${orderCode} placed with supplier`);
  return { id: orderId, code: orderCode };
}

export async function receivePurchaseOrder(
  client: PoolClient,
  w: Workspace,
  input: Body,
  orderId: string,
): Promise<Body> {
  const order = await first(client, "SELECT * FROM erp_purchase_orders WHERE company_id=$1 AND id=$2 FOR UPDATE", [
    w.companyId,
    orderId,
  ]);
  const lines = list(input.lines).map((line) => ({
    lineId: id(line.lineId, "Purchase line"),
    quantity: decimal(line.quantity, "Received quantity"),
  }));
  unique(lines.map((line) => line.lineId));
  const receiptId = randomUUID();
  const receiptCode = await code(client, w.companyId, "GRN");
  const note = text(input.note, "Note", 500, true);
  await client.query("INSERT INTO erp_receipts(id,company_id,code,purchase_order_id,note) VALUES($1,$2,$3,$4,$5)", [
    receiptId,
    w.companyId,
    receiptCode,
    orderId,
    note,
  ]);
  for (const line of lines) {
    const purchased = await client.query(
      `UPDATE erp_purchase_lines SET received_quantity=received_quantity+$4::numeric
      WHERE company_id=$1 AND purchase_order_id=$2 AND id=$3 AND received_quantity+$4::numeric<=quantity RETURNING *`,
      [w.companyId, orderId, line.lineId, line.quantity],
    );
    if (!purchased.rows[0])
      throw new AppError(409, "Received quantity exceeds the open purchase quantity, or the line is not in this order");
    const current = purchased.rows[0];
    await client.query(
      "INSERT INTO erp_receipt_lines(id,company_id,receipt_id,purchase_line_id,item_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), w.companyId, receiptId, current.id, current.item_id, line.quantity, current.unit_price],
    );
    await stock(client, w, {
      warehouseId: order.warehouse_id,
      itemId: current.item_id,
      quantity: line.quantity,
      unitCost: current.unit_price,
      movement: "purchase_receipt",
      referenceId: receiptId,
      referenceCode: receiptCode,
      note,
    });
  }
  await client.query(
    "UPDATE erp_receipts SET total=(SELECT SUM(quantity*unit_price) FROM erp_receipt_lines WHERE company_id=$1 AND receipt_id=$2) WHERE company_id=$1 AND id=$2",
    [w.companyId, receiptId],
  );
  await client.query(
    `UPDATE erp_purchase_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM erp_purchase_lines WHERE company_id=$1 AND purchase_order_id=$2 AND received_quantity<quantity) THEN 'partial' ELSE 'received' END WHERE company_id=$1 AND id=$2`,
    [w.companyId, orderId],
  );
  await audit(client, w, "goods.received", "receipt", receiptId, `${receiptCode} received against ${order.code}`);
  return { id: receiptId, code: receiptCode };
}

export async function createBill(
  client: PoolClient,
  w: Workspace,
  input: Body,
  sourceId: string,
  direction: "payable" | "receivable",
): Promise<Body> {
  const payable = direction === "payable";
  const source = payable
    ? await first(
        client,
        `SELECT r.*,o.supplier_id AS party_id FROM erp_receipts r JOIN erp_purchase_orders o ON o.company_id=r.company_id AND o.id=r.purchase_order_id WHERE r.company_id=$1 AND r.id=$2`,
        [w.companyId, sourceId],
      )
    : await first(
        client,
        `SELECT d.*,o.customer_id AS party_id FROM erp_dispatches d JOIN erp_sales_orders o ON o.company_id=d.company_id AND o.id=d.sales_order_id WHERE d.company_id=$1 AND d.id=$2`,
        [w.companyId, sourceId],
      );
  const billId = randomUUID();
  const billCode = await code(client, w.companyId, payable ? "BILL" : "INV");
  await client.query(
    `INSERT INTO erp_bills(id,company_id,code,direction,party_id,receipt_id,dispatch_id,total,due_date)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::date,CURRENT_DATE+30))`,
    [
      billId,
      w.companyId,
      billCode,
      direction,
      source.party_id,
      payable ? sourceId : null,
      payable ? null : sourceId,
      source.total,
      date(input.dueDate, "Due date", true),
    ],
  );
  await audit(
    client,
    w,
    payable ? "bill.posted" : "invoice.posted",
    "bill",
    billId,
    `${billCode} posted for ${source.code}`,
  );
  return { id: billId, code: billCode };
}

export async function recordPayment(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const billId = id(input.billId, "Bill / invoice");
  const amount = decimal(input.amount, "Payment amount", { places: 4 });
  const method = choice(input.method, ["bank", "cash", "upi"], "Payment method");
  const result = await client.query(
    "UPDATE erp_bills SET paid=paid+$3::numeric WHERE company_id=$1 AND id=$2 AND paid+$3::numeric<=total RETURNING *",
    [w.companyId, billId, amount],
  );
  if (!result.rows[0])
    throw new AppError(409, "Payment exceeds the outstanding balance, or this invoice does not exist in the company");
  const bill = result.rows[0];
  const paymentId = randomUUID();
  const paymentCode = await code(client, w.companyId, bill.direction === "payable" ? "PAY" : "COL");
  await client.query(
    "INSERT INTO erp_payments(id,company_id,code,bill_id,amount,method,note) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [paymentId, w.companyId, paymentCode, billId, amount, method, text(input.note, "Note", 500, true)],
  );
  await audit(
    client,
    w,
    bill.direction === "payable" ? "supplier.paid" : "customer.collected",
    "payment",
    paymentId,
    `${paymentCode}: payment against ${bill.code}`,
  );
  return { id: paymentId, code: paymentCode };
}

export async function createBom(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const productId = id(input.productId, "Finished product");
  await first(client, "SELECT id FROM erp_items WHERE company_id=$1 AND id=$2 AND kind='finished'", [
    w.companyId,
    productId,
  ]);
  const lines = list(input.lines).map((line) => ({
    itemId: id(line.itemId, "Raw material"),
    quantity: decimal(line.quantity, "Material per finished unit"),
  }));
  unique(lines.map((line) => line.itemId));
  const bomId = randomUUID();
  const bomCode = await code(client, w.companyId, "BOM");
  const version = await first(
    client,
    "SELECT COALESCE(MAX(version),0)+1 AS version FROM erp_boms WHERE company_id=$1 AND product_id=$2",
    [w.companyId, productId],
  );
  await client.query("INSERT INTO erp_boms(id,company_id,code,product_id,name,version) VALUES($1,$2,$3,$4,$5,$6)", [
    bomId,
    w.companyId,
    bomCode,
    productId,
    text(input.name, "BOM name"),
    version.version,
  ]);
  for (const line of lines) {
    await first(client, "SELECT id FROM erp_items WHERE company_id=$1 AND id=$2 AND kind='raw'", [
      w.companyId,
      line.itemId,
    ]);
    await client.query("INSERT INTO erp_bom_lines(id,company_id,bom_id,item_id,quantity) VALUES($1,$2,$3,$4,$5)", [
      randomUUID(),
      w.companyId,
      bomId,
      line.itemId,
      line.quantity,
    ]);
  }
  await audit(client, w, "bom.created", "bom", bomId, `${bomCode} version ${version.version} created`);
  return { id: bomId, code: bomCode, version: version.version };
}

export async function createWorkOrder(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const bomId = id(input.bomId, "BOM");
  const warehouseId = id(input.warehouseId, "Warehouse");
  const plannedQuantity = decimal(input.plannedQuantity, "Planned quantity");
  const bom = await first(client, "SELECT * FROM erp_boms WHERE company_id=$1 AND id=$2", [w.companyId, bomId]);
  await first(client, "SELECT id FROM erp_warehouses WHERE company_id=$1 AND id=$2", [w.companyId, warehouseId]);
  const workOrderId = randomUUID();
  const workOrderCode = await code(client, w.companyId, "WO");
  await client.query(
    "INSERT INTO erp_work_orders(id,company_id,code,bom_id,product_id,warehouse_id,planned_quantity) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [workOrderId, w.companyId, workOrderCode, bomId, bom.product_id, warehouseId, plannedQuantity],
  );
  await client.query(
    `INSERT INTO erp_work_order_lines(id,company_id,work_order_id,item_id,planned_quantity,unit_cost)
    SELECT gen_random_uuid(),l.company_id,$3,l.item_id,l.quantity*$4::numeric,i.unit_cost FROM erp_bom_lines l
    JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=$1 AND l.bom_id=$2`,
    [w.companyId, bomId, workOrderId, plannedQuantity],
  );
  await audit(client, w, "work_order.created", "work_order", workOrderId, `${workOrderCode} planned from ${bom.code}`);
  return { id: workOrderId, code: workOrderCode };
}

export async function startWorkOrder(
  client: PoolClient,
  w: Workspace,
  _input: Body,
  workOrderId: string,
): Promise<Body> {
  const order = await first(client, "SELECT * FROM erp_work_orders WHERE company_id=$1 AND id=$2 FOR UPDATE", [
    w.companyId,
    workOrderId,
  ]);
  if (order.status !== "draft") throw new AppError(409, "Only a draft work order can be started");
  const lines = await client.query(
    "SELECT * FROM erp_work_order_lines WHERE company_id=$1 AND work_order_id=$2 ORDER BY item_id",
    [w.companyId, workOrderId],
  );
  if (!lines.rowCount) throw new AppError(409, "Work order has no material requirements");
  for (const line of lines.rows) {
    await stock(client, w, {
      warehouseId: order.warehouse_id,
      itemId: line.item_id,
      quantity: `-${line.planned_quantity}`,
      unitCost: line.unit_cost,
      movement: "production_issue",
      referenceId: workOrderId,
      referenceCode: order.code,
    });
  }
  await client.query(
    "UPDATE erp_work_order_lines SET issued_quantity=planned_quantity WHERE company_id=$1 AND work_order_id=$2",
    [w.companyId, workOrderId],
  );
  await client.query("UPDATE erp_work_orders SET status='in_progress',started_at=now() WHERE company_id=$1 AND id=$2", [
    w.companyId,
    workOrderId,
  ]);
  await audit(client, w, "production.started", "work_order", workOrderId, `${order.code} started; raw material issued`);
  return { id: workOrderId, code: order.code };
}

export async function completeWorkOrder(
  client: PoolClient,
  w: Workspace,
  input: Body,
  workOrderId: string,
): Promise<Body> {
  const order = await first(client, "SELECT * FROM erp_work_orders WHERE company_id=$1 AND id=$2 FOR UPDATE", [
    w.companyId,
    workOrderId,
  ]);
  if (order.status !== "in_progress") throw new AppError(409, "Start the work order before completing it");
  const goodQuantity = decimal(input.goodQuantity, "Accepted quantity");
  const rejectedQuantity = decimal(input.rejectedQuantity, "Rejected quantity", { zero: true, fallback: "0" });
  const labourCost = decimal(input.labourCost, "Labour cost", { zero: true, places: 4, fallback: "0" });
  const valid = await first(client, "SELECT $1::numeric+$2::numeric<=$3::numeric AS valid", [
    goodQuantity,
    rejectedQuantity,
    order.planned_quantity,
  ]);
  if (!valid.valid) throw new AppError(400, "Accepted plus rejected output cannot exceed the planned quantity");
  const returns =
    input.returns === undefined || (Array.isArray(input.returns) && input.returns.length === 0)
      ? []
      : list(input.returns, "Returns").map((line) => ({
          itemId: id(line.itemId, "Returned material"),
          quantity: decimal(line.quantity, "Unused return quantity"),
        }));
  unique(returns.map((line) => line.itemId));
  for (const returned of returns) {
    const result = await client.query(
      `UPDATE erp_work_order_lines SET returned_quantity=$4::numeric WHERE company_id=$1 AND work_order_id=$2 AND item_id=$3 AND $4::numeric<=issued_quantity RETURNING *`,
      [w.companyId, workOrderId, returned.itemId, returned.quantity],
    );
    if (!result.rows[0])
      throw new AppError(400, "Returned quantity exceeds issued material, or the item is not in this work order");
    await stock(client, w, {
      warehouseId: order.warehouse_id,
      itemId: returned.itemId,
      quantity: returned.quantity,
      unitCost: result.rows[0].unit_cost,
      movement: "production_return",
      referenceId: workOrderId,
      referenceCode: order.code,
      note: "Unused material returned from production",
    });
  }
  const cost = await first(
    client,
    `SELECT COALESCE(SUM((issued_quantity-returned_quantity)*unit_cost),0)::numeric(18,4) AS material_cost,
    ((COALESCE(SUM((issued_quantity-returned_quantity)*unit_cost),0)+$3::numeric)/$4::numeric)::numeric(18,4) AS unit_cost
    FROM erp_work_order_lines WHERE company_id=$1 AND work_order_id=$2`,
    [w.companyId, workOrderId, labourCost, goodQuantity],
  );
  await client.query(
    "UPDATE erp_work_orders SET status='completed',good_quantity=$3,rejected_quantity=$4,labour_cost=$5,material_cost=$6,unit_cost=$7,completed_at=now() WHERE company_id=$1 AND id=$2",
    [w.companyId, workOrderId, goodQuantity, rejectedQuantity, labourCost, cost.material_cost, cost.unit_cost],
  );
  await stock(client, w, {
    warehouseId: order.warehouse_id,
    itemId: order.product_id,
    quantity: goodQuantity,
    unitCost: cost.unit_cost,
    movement: "production_output",
    referenceId: workOrderId,
    referenceCode: order.code,
    note: "Accepted output; rejects are excluded from available stock",
  });
  // Latest completed batch becomes the product's indicative standard cost, not FIFO/financial inventory valuation.
  await client.query("UPDATE erp_items SET unit_cost=$3 WHERE company_id=$1 AND id=$2", [
    w.companyId,
    order.product_id,
    cost.unit_cost,
  ]);
  await audit(
    client,
    w,
    "production.completed",
    "work_order",
    workOrderId,
    `${order.code} completed: ${goodQuantity} accepted, ${rejectedQuantity} rejected`,
  );
  return { id: workOrderId, code: order.code, unitCost: cost.unit_cost };
}

export async function createSalesOrder(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const customerId = id(input.customerId, "Customer");
  const warehouseId = id(input.warehouseId, "Warehouse");
  await first(client, "SELECT id FROM erp_parties WHERE company_id=$1 AND id=$2 AND kind='customer'", [
    w.companyId,
    customerId,
  ]);
  await first(client, "SELECT id FROM erp_warehouses WHERE company_id=$1 AND id=$2", [w.companyId, warehouseId]);
  const lines = list(input.lines).map((line) => ({
    itemId: id(line.itemId, "Finished item"),
    quantity: decimal(line.quantity, "Quantity"),
    unitPrice: decimal(line.unitPrice, "Unit price", { zero: true, places: 4 }),
  }));
  unique(lines.map((line) => line.itemId));
  const orderId = randomUUID();
  const orderCode = await code(client, w.companyId, "SO");
  await client.query(
    "INSERT INTO erp_sales_orders(id,company_id,code,customer_id,warehouse_id) VALUES($1,$2,$3,$4,$5)",
    [orderId, w.companyId, orderCode, customerId, warehouseId],
  );
  for (const line of lines) {
    await first(client, "SELECT id FROM erp_items WHERE company_id=$1 AND id=$2 AND kind='finished'", [
      w.companyId,
      line.itemId,
    ]);
    const result = await client.query(
      "UPDATE erp_stock_balances SET reserved=reserved+$4::numeric WHERE company_id=$1 AND warehouse_id=$2 AND item_id=$3 AND on_hand-reserved>=$4::numeric RETURNING item_id",
      [w.companyId, warehouseId, line.itemId, line.quantity],
    );
    if (!result.rowCount)
      throw new AppError(
        409,
        "Insufficient available finished stock to reserve this order. Produce or receive stock first.",
      );
    await client.query(
      "INSERT INTO erp_sales_lines(id,company_id,sales_order_id,item_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6)",
      [randomUUID(), w.companyId, orderId, line.itemId, line.quantity, line.unitPrice],
    );
  }
  await client.query(
    "UPDATE erp_sales_orders SET total=(SELECT SUM(quantity*unit_price) FROM erp_sales_lines WHERE company_id=$1 AND sales_order_id=$2) WHERE company_id=$1 AND id=$2",
    [w.companyId, orderId],
  );
  await audit(
    client,
    w,
    "sales_order.confirmed",
    "sales_order",
    orderId,
    `${orderCode} confirmed; finished stock reserved`,
  );
  return { id: orderId, code: orderCode };
}

export async function dispatchSalesOrder(
  client: PoolClient,
  w: Workspace,
  input: Body,
  orderId: string,
): Promise<Body> {
  const order = await first(client, "SELECT * FROM erp_sales_orders WHERE company_id=$1 AND id=$2 FOR UPDATE", [
    w.companyId,
    orderId,
  ]);
  const lines = list(input.lines).map((line) => ({
    lineId: id(line.lineId, "Sales line"),
    quantity: decimal(line.quantity, "Dispatched quantity"),
  }));
  unique(lines.map((line) => line.lineId));
  const dispatchId = randomUUID();
  const dispatchCode = await code(client, w.companyId, "DSP");
  const note = text(input.note, "Note", 500, true);
  await client.query("INSERT INTO erp_dispatches(id,company_id,code,sales_order_id,note) VALUES($1,$2,$3,$4,$5)", [
    dispatchId,
    w.companyId,
    dispatchCode,
    orderId,
    note,
  ]);
  for (const line of lines) {
    const result = await client.query(
      `UPDATE erp_sales_lines SET dispatched_quantity=dispatched_quantity+$4::numeric
      WHERE company_id=$1 AND sales_order_id=$2 AND id=$3 AND dispatched_quantity+$4::numeric<=quantity RETURNING *`,
      [w.companyId, orderId, line.lineId, line.quantity],
    );
    if (!result.rows[0])
      throw new AppError(409, "Dispatched quantity exceeds the open order quantity, or this line is not in the order");
    const current = result.rows[0];
    const item = await first(client, "SELECT unit_cost FROM erp_items WHERE company_id=$1 AND id=$2", [
      w.companyId,
      current.item_id,
    ]);
    await client.query(
      "INSERT INTO erp_dispatch_lines(id,company_id,dispatch_id,sales_line_id,item_id,quantity,unit_price) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [randomUUID(), w.companyId, dispatchId, current.id, current.item_id, line.quantity, current.unit_price],
    );
    await stock(client, w, {
      warehouseId: order.warehouse_id,
      itemId: current.item_id,
      quantity: `-${line.quantity}`,
      releaseReservation: line.quantity,
      unitCost: item.unit_cost,
      movement: "sales_dispatch",
      referenceId: dispatchId,
      referenceCode: dispatchCode,
      note,
    });
  }
  await client.query(
    "UPDATE erp_dispatches SET total=(SELECT SUM(quantity*unit_price) FROM erp_dispatch_lines WHERE company_id=$1 AND dispatch_id=$2) WHERE company_id=$1 AND id=$2",
    [w.companyId, dispatchId],
  );
  await client.query(
    `UPDATE erp_sales_orders SET status=CASE WHEN EXISTS(SELECT 1 FROM erp_sales_lines WHERE company_id=$1 AND sales_order_id=$2 AND dispatched_quantity<quantity) THEN 'partial' ELSE 'dispatched' END WHERE company_id=$1 AND id=$2`,
    [w.companyId, orderId],
  );
  await audit(
    client,
    w,
    "goods.dispatched",
    "dispatch",
    dispatchId,
    `${dispatchCode} dispatched against ${order.code}`,
  );
  return { id: dispatchId, code: dispatchCode };
}

export async function createExpense(client: PoolClient, w: Workspace, input: Body): Promise<Body> {
  const expenseId = randomUUID();
  const expenseCode = await code(client, w.companyId, "EXP");
  const description = text(input.description, "Description", 250)!;
  await client.query(
    "INSERT INTO erp_expenses(id,company_id,code,category,description,amount,expense_date) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      expenseId,
      w.companyId,
      expenseCode,
      text(input.category, "Category", 60),
      description,
      decimal(input.amount, "Amount", { places: 4 }),
      date(input.expenseDate, "Expense date"),
    ],
  );
  await audit(client, w, "expense.recorded", "expense", expenseId, `${expenseCode}: ${description}`);
  return { id: expenseId, code: expenseCode };
}
