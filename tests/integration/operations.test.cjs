const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const { once } = require("node:events");
const { Pool } = require("pg");

const projectRoot = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(projectRoot, ".env"), quiet: true });
process.env.NODE_ENV = "test";
process.env.APP_ORIGINS = "http://127.0.0.1:5176";
const { app } = require(path.join(projectRoot, "dist/app.js"));
const { pool: applicationPool } = require(path.join(projectRoot, "dist/config/db.js"));
const database = new Pool({ max: 2, connectionTimeoutMillis: 3000, query_timeout: 5000 });
const origin = "http://127.0.0.1:5176";

// Compare exact PostgreSQL decimal strings without converting money/quantity to JS floating point.
function exact(value) {
  const [whole, fractional = ""] = String(value).split(".");
  const tail = fractional.replace(/0+$/, "");
  return tail ? `${whole}.${tail}` : whole;
}

test(
  "real PostgreSQL manufacturing workflows preserve stock, balances, permissions and isolation",
  { timeout: 90000 },
  async (t) => {
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const createdCompanies = [];
    const createdUsers = [];
    let owner;
    let other;
    const state = {};

    async function send(session, endpoint, data, options = {}) {
      const headers = { Origin: origin, ...(options.headers ?? {}) };
      if (session) {
        headers.Cookie = session.cookie;
        headers["X-CSRF-Token"] = session.csrf;
        headers["X-Company-Id"] = options.companyId ?? session.companyId;
      }
      if (data !== undefined) {
        headers["Content-Type"] = "application/json";
        headers["X-Idempotency-Key"] = options.key ?? randomUUID();
      }
      if (options.noCsrf) delete headers["X-CSRF-Token"];
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: options.method ?? (data === undefined ? "GET" : "POST"),
        headers,
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      const json = response.status === 204 ? null : await response.json();
      return { status: response.status, json, response };
    }

    async function register(label) {
      const email = `erp-integration-${randomUUID()}@example.test`;
      const result = await send(null, "/api/auth/register", {
        name: `ERP test ${label}`,
        email,
        password: `Integration-${randomUUID()}`,
        companyName: `Integration fixture ${label} ${randomUUID()}`,
      });
      assert.equal(result.status, 201, JSON.stringify(result.json));
      const identity = result.json.data ?? result.json;
      createdCompanies.push(identity.companies[0].id);
      createdUsers.push(identity.user.id);
      const cookie = result.response.headers
        .getSetCookie()
        .map((entry) => entry.split(";")[0])
        .join("; ");
      assert.ok(cookie.includes("madtech_session="));
      return { cookie, csrf: identity.csrfToken, companyId: identity.companies[0].id, userId: identity.user.id };
    }

    async function create(endpoint, input, options = {}) {
      const result = await send(owner, `/api/erp${endpoint}`, input, options);
      assert.ok([200, 201].includes(result.status), `${endpoint}: ${result.status} ${JSON.stringify(result.json)}`);
      return result.json.data;
    }

    async function snapshot(session = owner) {
      const result = await send(session, "/api/erp/workspace");
      assert.equal(result.status, 200, JSON.stringify(result.json));
      return result.json.data ?? result.json;
    }

    function balance(workspace, itemId) {
      const row = workspace.inventory.find(
        (entry) => entry.itemId === itemId && entry.warehouseId === state.warehouse.id,
      );
      assert.ok(row, "Expected the item's warehouse stock row");
      return row;
    }

    async function billBalance(billId, total, paid, outstanding) {
      const workspace = await snapshot();
      const bill = workspace.bills.find((entry) => entry.id === billId);
      assert.ok(bill);
      assert.equal(exact(bill.total), total);
      assert.equal(exact(bill.paid), paid);
      assert.equal(exact(bill.balance), outstanding);
    }

    try {
      owner = await register("primary");
      other = await register("foreign");

      await t.test("session, CSRF and role checks protect all posting actions", async () => {
        assert.equal((await send(null, "/api/erp/workspace")).status, 401);
        assert.equal(
          (await send(owner, "/api/erp/warehouses", { code: "NO-CSRF", name: "Must not save" }, { noCsrf: true }))
            .status,
          403,
        );
        await database.query("UPDATE company_memberships SET role='viewer' WHERE company_id=$1 AND user_id=$2", [
          owner.companyId,
          owner.userId,
        ]);
        try {
          assert.equal(
            (await send(owner, "/api/erp/warehouses", { code: "NO-ROLE", name: "Must not save" })).status,
            403,
          );
          assert.equal((await send(owner, "/api/erp/workspace")).status, 200);
        } finally {
          await database.query("UPDATE company_memberships SET role='owner' WHERE company_id=$1 AND user_id=$2", [
            owner.companyId,
            owner.userId,
          ]);
        }
        const workspace = await snapshot();
        assert.equal(workspace.warehouses.length, 0);
      });

      await t.test("create masters and post opening balances with ledger records", async () => {
        state.warehouse = await create("/warehouses", { code: "MAIN", name: "Integration factory" });
        state.raw = await create("/items", {
          sku: "RAW-TEST",
          name: "Integration bamboo fibre",
          kind: "raw",
          unit: "kg",
          reorderLevel: "5",
          unitCost: "100",
          sellingPrice: "0",
        });
        state.finished = await create("/items", {
          sku: "FG-TEST",
          name: "Integration bamboo plate",
          kind: "finished",
          unit: "pcs",
          reorderLevel: "100",
          unitCost: "2",
          sellingPrice: "10",
        });
        state.supplier = await create("/suppliers", {
          code: "SUP-TEST",
          name: "Integration supplier",
          email: "supplier@example.test",
        });
        state.customer = await create("/customers", {
          code: "CUS-TEST",
          name: "Integration customer",
          phone: "   ",
          address: "  ",
        });
        assert.equal(
          (
            await send(owner, "/api/erp/items", {
              sku: "INVALID-NULL",
              name: "Invalid\u0000name",
              kind: "raw",
              unit: "kg",
            })
          ).status,
          400,
        );
        await create("/inventory/adjustments", {
          itemId: state.raw.id,
          warehouseId: state.warehouse.id,
          quantity: "100",
          note: "Isolated integration opening balance",
        });
        await create("/inventory/adjustments", {
          itemId: state.finished.id,
          warehouseId: state.warehouse.id,
          quantity: "1000",
          note: "Isolated integration opening balance",
        });
        const workspace = await snapshot();
        assert.equal(workspace.items.length, 2);
        assert.equal(workspace.customers.find((entry) => entry.id === state.customer.id).phone, null);
        assert.equal(workspace.customers.find((entry) => entry.id === state.customer.id).address, null);
        assert.equal(exact(balance(workspace, state.raw.id).onHand), "100");
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "1000");
        assert.equal(workspace.stockLedger.length, 2);
        assert.equal(
          (
            await send(owner, "/api/erp/inventory/adjustments", {
              itemId: state.raw.id,
              warehouseId: state.warehouse.id,
              quantity: "-101",
              note: "Must not allow negative stock",
            })
          ).status,
          409,
        );
        assert.equal(exact(balance(await snapshot(), state.raw.id).onHand), "100");
      });

      await t.test("partial purchase receipts are exact, idempotent and cannot exceed the order", async () => {
        const purchaseBody = {
          supplierId: state.supplier.id,
          warehouseId: state.warehouse.id,
          orderDate: "2026-10-19",
          expectedDate: "2026-10-26",
          supplierReference: "QT-204",
          paymentTerms: "Net 30 days",
          deliveryAddress: "Factory receiving bay 2",
          notes: "Deliver dry material.\nCall before arrival.",
          lines: [{ itemId: state.raw.id, quantity: "50", unitPrice: "100" }],
        };
        const before = (await snapshot()).purchaseOrders.length;
        assert.equal(
          (await send(owner, "/api/erp/purchase-orders", { ...purchaseBody, expectedDate: "2026-10-18" })).status,
          400,
        );
        assert.equal(
          (await send(owner, "/api/erp/purchase-orders", { ...purchaseBody, orderDate: "2026-02-30" })).status,
          400,
        );
        assert.equal(
          (await send(owner, "/api/erp/purchase-orders", { ...purchaseBody, notes: "x".repeat(2001) })).status,
          400,
        );
        assert.equal((await snapshot()).purchaseOrders.length, before, "invalid details must not create orders");
        const orderKey = randomUUID();
        state.purchase = await create("/purchase-orders", purchaseBody, { key: orderKey });
        const repeatedOrder = await create("/purchase-orders", purchaseBody, { key: orderKey });
        assert.equal(repeatedOrder.id, state.purchase.id);
        const order = (await snapshot()).purchaseOrders.find((entry) => entry.id === state.purchase.id);
        for (const field of [
          "orderDate",
          "expectedDate",
          "supplierReference",
          "paymentTerms",
          "deliveryAddress",
          "notes",
        ])
          assert.equal(order[field], purchaseBody[field], `${field} must persist in the workspace`);
        state.purchaseLine = order.lines[0].id;
        const key = randomUUID();
        const payload = { lines: [{ lineId: state.purchaseLine, quantity: "20" }] };
        state.receipt = await create(`/purchase-orders/${state.purchase.id}/receive`, payload, { key });
        const replay = await create(`/purchase-orders/${state.purchase.id}/receive`, payload, { key });
        assert.equal(replay.id, state.receipt.id);
        assert.equal(
          (
            await send(
              owner,
              `/api/erp/purchase-orders/${state.purchase.id}/receive`,
              { lines: [{ lineId: state.purchaseLine, quantity: "21" }] },
              { key },
            )
          ).status,
          409,
        );
        assert.equal(
          (
            await send(owner, `/api/erp/purchase-orders/${state.purchase.id}/receive`, {
              lines: [{ lineId: state.purchaseLine, quantity: "31" }],
            })
          ).status,
          409,
        );
        let workspace = await snapshot();
        assert.equal(workspace.receipts.length, 1);
        assert.equal(exact(balance(workspace, state.raw.id).onHand), "120");
        assert.equal(workspace.purchaseOrders.find((entry) => entry.id === state.purchase.id).status, "partial");
        await create(`/purchase-orders/${state.purchase.id}/receive`, {
          lines: [{ lineId: state.purchaseLine, quantity: "30" }],
        });
        workspace = await snapshot();
        assert.equal(exact(balance(workspace, state.raw.id).onHand), "150");
        assert.equal(workspace.purchaseOrders.find((entry) => entry.id === state.purchase.id).status, "received");
        assert.equal(
          (
            await send(owner, `/api/erp/purchase-orders/${state.purchase.id}/receive`, {
              lines: [{ lineId: state.purchaseLine, quantity: "1" }],
            })
          ).status,
          409,
        );
      });

      await t.test("supplier bills and partial payments maintain exact outstanding balances", async () => {
        state.supplierBill = await create(`/receipts/${state.receipt.id}/bill`, {});
        await billBalance(state.supplierBill.id, "2000", "0", "2000");
        await create("/payments", { billId: state.supplierBill.id, amount: "500", method: "bank" });
        await billBalance(state.supplierBill.id, "2000", "500", "1500");
        assert.equal(
          (
            await send(owner, "/api/erp/payments", {
              billId: state.supplierBill.id,
              amount: "1500.0001",
              method: "bank",
            })
          ).status,
          409,
        );
        await create("/payments", { billId: state.supplierBill.id, amount: "1500", method: "bank" });
        await billBalance(state.supplierBill.id, "2000", "2000", "0");
        assert.equal((await send(owner, `/api/erp/receipts/${state.receipt.id}/bill`, {})).status, 409);
      });

      await t.test("production issues material, returns unused material and stocks accepted output only", async () => {
        state.bom = await create("/boms", {
          productId: state.finished.id,
          name: "Integration standard plate",
          lines: [{ itemId: state.raw.id, quantity: "0.01" }],
        });
        state.workOrder = await create("/work-orders", {
          bomId: state.bom.id,
          warehouseId: state.warehouse.id,
          plannedQuantity: "1000",
        });
        const startKey = randomUUID();
        await create(`/work-orders/${state.workOrder.id}/start`, {}, { key: startKey });
        await create(`/work-orders/${state.workOrder.id}/start`, {}, { key: startKey });
        assert.equal((await send(owner, `/api/erp/work-orders/${state.workOrder.id}/start`, {})).status, 409);
        assert.equal(exact(balance(await snapshot(), state.raw.id).onHand), "140");
        const completion = {
          goodQuantity: "990",
          rejectedQuantity: "10",
          labourCost: "100",
          returns: [{ itemId: state.raw.id, quantity: "1" }],
        };
        assert.equal(
          (
            await send(owner, `/api/erp/work-orders/${state.workOrder.id}/complete`, {
              ...completion,
              goodQuantity: "1000",
            })
          ).status,
          400,
        );
        const completeKey = randomUUID();
        await create(`/work-orders/${state.workOrder.id}/complete`, completion, { key: completeKey });
        await create(`/work-orders/${state.workOrder.id}/complete`, completion, { key: completeKey });
        assert.equal(
          (await send(owner, `/api/erp/work-orders/${state.workOrder.id}/complete`, completion)).status,
          409,
        );
        const workspace = await snapshot();
        assert.equal(exact(balance(workspace, state.raw.id).onHand), "141");
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "1990");
        const order = workspace.workOrders.find((entry) => entry.id === state.workOrder.id);
        assert.equal(order.status, "completed");
        assert.equal(exact(order.materialCost), "900");
        assert.equal(exact(order.labourCost), "100");
        assert.equal(exact(order.goodQuantity), "990");
        assert.equal(exact(order.rejectedQuantity), "10");
        assert.equal(exact(order.lines[0].issuedQuantity), "10");
        assert.equal(exact(order.lines[0].returnedQuantity), "1");
      });

      await t.test("failed production start rolls back all material issues and order state", async () => {
        const order = await create("/work-orders", {
          bomId: state.bom.id,
          warehouseId: state.warehouse.id,
          plannedQuantity: "20000",
        });
        const before = await snapshot();
        assert.equal((await send(owner, `/api/erp/work-orders/${order.id}/start`, {})).status, 409);
        const after = await snapshot();
        assert.equal(exact(balance(after, state.raw.id).onHand), "141");
        assert.equal(after.stockLedger.length, before.stockLedger.length);
        assert.equal(after.workOrders.find((entry) => entry.id === order.id).status, "draft");
      });

      await t.test("sales reserves stock and partial dispatch reduces both stock and reservation", async () => {
        state.sale = await create("/sales-orders", {
          customerId: state.customer.id,
          warehouseId: state.warehouse.id,
          lines: [{ itemId: state.finished.id, quantity: "1200", unitPrice: "10" }],
        });
        let workspace = await snapshot();
        state.salesLine = workspace.salesOrders.find((entry) => entry.id === state.sale.id).lines[0].id;
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "1990");
        assert.equal(exact(balance(workspace, state.finished.id).reserved), "1200");
        assert.equal(exact(balance(workspace, state.finished.id).available), "790");
        assert.equal(
          (
            await send(owner, "/api/erp/inventory/adjustments", {
              itemId: state.finished.id,
              warehouseId: state.warehouse.id,
              quantity: "-791",
              note: "Reserved stock must be protected",
            })
          ).status,
          409,
        );
        const dispatchKey = randomUUID();
        const payload = { lines: [{ lineId: state.salesLine, quantity: "500" }] };
        state.dispatch = await create(`/sales-orders/${state.sale.id}/dispatch`, payload, { key: dispatchKey });
        const replay = await create(`/sales-orders/${state.sale.id}/dispatch`, payload, { key: dispatchKey });
        assert.equal(replay.id, state.dispatch.id);
        workspace = await snapshot();
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "1490");
        assert.equal(exact(balance(workspace, state.finished.id).reserved), "700");
        assert.equal(workspace.salesOrders.find((entry) => entry.id === state.sale.id).status, "partial");
        assert.equal(
          (
            await send(owner, `/api/erp/sales-orders/${state.sale.id}/dispatch`, {
              lines: [{ lineId: state.salesLine, quantity: "701" }],
            })
          ).status,
          409,
        );
        await create(`/sales-orders/${state.sale.id}/dispatch`, {
          lines: [{ lineId: state.salesLine, quantity: "700" }],
        });
        workspace = await snapshot();
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "790");
        assert.equal(exact(balance(workspace, state.finished.id).reserved), "0");
        assert.equal(workspace.salesOrders.find((entry) => entry.id === state.sale.id).status, "dispatched");
      });

      await t.test("customer invoices, collections and expenses persist their real amounts", async () => {
        state.customerInvoice = await create(`/dispatches/${state.dispatch.id}/invoice`, {});
        await billBalance(state.customerInvoice.id, "5000", "0", "5000");
        await create("/payments", { billId: state.customerInvoice.id, amount: "2500", method: "upi" });
        await billBalance(state.customerInvoice.id, "5000", "2500", "2500");
        assert.equal(
          (
            await send(owner, "/api/erp/payments", {
              billId: state.customerInvoice.id,
              amount: "2500.0001",
              method: "cash",
            })
          ).status,
          409,
        );
        await create("/payments", { billId: state.customerInvoice.id, amount: "2500", method: "bank" });
        await billBalance(state.customerInvoice.id, "5000", "5000", "0");
        await create("/expenses", {
          category: "Utilities",
          description: "Integration test electricity",
          amount: "250",
          expenseDate: new Date().toISOString().slice(0, 10),
        });
        const workspace = await snapshot();
        assert.equal(exact(workspace.summary.revenue), "5000");
        assert.equal(exact(workspace.summary.collected), "5000");
        assert.equal(exact(workspace.summary.receivables), "0");
        assert.equal(exact(workspace.summary.payables), "0");
        assert.equal(exact(workspace.summary.expenses), "250");
        assert.equal(workspace.payments.length, 4);
        assert.equal(workspace.expenses.length, 1);
      });

      await t.test("competing orders cannot reserve the same available finished stock", async () => {
        const payload = {
          customerId: state.customer.id,
          warehouseId: state.warehouse.id,
          lines: [{ itemId: state.finished.id, quantity: "600", unitPrice: "10" }],
        };
        const results = await Promise.all([
          send(owner, "/api/erp/sales-orders", payload),
          send(owner, "/api/erp/sales-orders", payload),
        ]);
        assert.deepEqual(results.map((entry) => entry.status).sort(), [201, 409]);
        const workspace = await snapshot();
        assert.equal(exact(balance(workspace, state.finished.id).onHand), "790");
        assert.equal(exact(balance(workspace, state.finished.id).reserved), "600");
        assert.equal(exact(balance(workspace, state.finished.id).available), "190");
      });

      await t.test("foreign company IDs cannot read or mutate another company's records", async () => {
        const foreign = await snapshot(other);
        assert.equal(foreign.items.length, 0);
        assert.equal(foreign.purchaseOrders.length, 0);
        assert.equal(foreign.company.id, other.companyId);
        assert.equal((await send(other, "/api/erp/workspace", undefined, { companyId: owner.companyId })).status, 403);
        assert.equal((await send(other, `/api/companies/${owner.companyId}`)).status, 404);
        const denied = await send(other, `/api/erp/purchase-orders/${state.purchase.id}/receive`, {
          lines: [{ lineId: state.purchaseLine, quantity: "1" }],
        });
        assert.equal(denied.status, 404);
        assert.ok(!JSON.stringify(denied.json).includes("Integration supplier"));
        assert.equal(
          (
            await send(other, "/api/erp/inventory/adjustments", {
              itemId: state.raw.id,
              warehouseId: state.warehouse.id,
              quantity: "1",
              note: "Must reject foreign records",
            })
          ).status,
          404,
        );
        assert.equal(exact(balance(await snapshot(), state.raw.id).onHand), "141");
      });

      await t.test("stock ledger is immutable and sums exactly to every on-hand balance", async () => {
        const ledger = await database.query("SELECT id FROM erp_stock_ledger WHERE company_id=$1 ORDER BY id LIMIT 1", [
          owner.companyId,
        ]);
        assert.ok(ledger.rows[0]);
        await assert.rejects(
          database.query("UPDATE erp_stock_ledger SET quantity=quantity WHERE company_id=$1 AND id=$2", [
            owner.companyId,
            ledger.rows[0].id,
          ]),
          /immutable/,
        );
        await assert.rejects(
          database.query("DELETE FROM erp_stock_ledger WHERE company_id=$1 AND id=$2", [
            owner.companyId,
            ledger.rows[0].id,
          ]),
          /immutable/,
        );
        const mismatch = await database.query(
          `SELECT b.item_id,b.warehouse_id FROM erp_stock_balances b
        LEFT JOIN (SELECT company_id,item_id,warehouse_id,SUM(quantity) AS quantity FROM erp_stock_ledger WHERE company_id=$1 GROUP BY company_id,item_id,warehouse_id) l
        ON l.company_id=b.company_id AND l.item_id=b.item_id AND l.warehouse_id=b.warehouse_id
        WHERE b.company_id=$1 AND b.on_hand<>COALESCE(l.quantity,0)`,
          [owner.companyId],
        );
        assert.equal(mismatch.rowCount, 0, "Every on-hand balance must reconcile to the immutable ledger");
        const bad = await database.query(
          "SELECT 1 FROM erp_stock_balances WHERE company_id=$1 AND (on_hand<0 OR reserved<0 OR reserved>on_hand)",
          [owner.companyId],
        );
        assert.equal(bad.rowCount, 0);
      });
    } finally {
      // Only fixture company/user UUIDs returned by our own registrations are removed.
      // There is deliberately no broad TRUNCATE, table cleanup, or demo-data deletion.
      try {
        if (createdCompanies.length) {
          await database.query("DELETE FROM companies WHERE id=ANY($1::uuid[])", [createdCompanies]);
          const left = await database.query("SELECT id FROM companies WHERE id=ANY($1::uuid[])", [createdCompanies]);
          assert.equal(
            left.rowCount,
            0,
            "Administrative company purge should cascade cleanly through immutable operational history",
          );
          for (const table of [
            "erp_items",
            "erp_stock_ledger",
            "erp_stock_balances",
            "erp_purchase_orders",
            "erp_work_orders",
            "erp_sales_orders",
            "erp_bills",
            "erp_payments",
            "erp_audit",
            "erp_idempotency",
          ]) {
            const rows = await database.query(`SELECT 1 FROM ${table} WHERE company_id=ANY($1::uuid[])`, [
              createdCompanies,
            ]);
            assert.equal(rows.rowCount, 0, `${table} fixture records must be removed with the fixture company`);
          }
        }
        if (createdUsers.length) await database.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [createdUsers]);
      } finally {
        await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        await Promise.all([database.end(), applicationPool.end()]);
      }
    }
  },
);
