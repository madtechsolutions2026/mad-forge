import { Router, type Request } from "express";
import { id, workspace, write } from "./erp.core.js";
import { getWorkspace } from "./erp.workspace.js";
import * as service from "./erp.service.js";

export const erpRouter = Router();
const routeId = (req: Request) => id(req.params.id);

erpRouter.get("/workspace", async (req, res) => {
  res.json(await getWorkspace(workspace(req)));
});
erpRouter.post("/items", async (req, res) => {
  res.status(201).json(await write(req, "masters", service.createItem, "Item added to the catalogue"));
});
erpRouter.post("/warehouses", async (req, res) => {
  res.status(201).json(await write(req, "masters", service.createWarehouse, "Warehouse created"));
});
erpRouter.post("/suppliers", async (req, res) => {
  res
    .status(201)
    .json(
      await write(
        req,
        "masters",
        (client, w, input) => service.createParty(client, w, input, "supplier"),
        "Supplier added",
      ),
    );
});
erpRouter.post("/customers", async (req, res) => {
  res
    .status(201)
    .json(
      await write(
        req,
        "masters",
        (client, w, input) => service.createParty(client, w, input, "customer"),
        "Customer added",
      ),
    );
});
erpRouter.post("/inventory/adjustments", async (req, res) => {
  res.status(201).json(await write(req, "warehouse", service.adjustStock, "Stock adjustment posted"));
});
erpRouter.post("/purchase-orders", async (req, res) => {
  res.status(201).json(await write(req, "purchasing", service.createPurchaseOrder, "Purchase order created"));
});
erpRouter.post("/purchase-orders/:id/receive", async (req, res) => {
  const orderId = routeId(req);
  res
    .status(201)
    .json(
      await write(
        req,
        "warehouse",
        (client, w, input) => service.receivePurchaseOrder(client, w, input, orderId),
        "Goods received and stock updated",
      ),
    );
});
erpRouter.post("/receipts/:id/bill", async (req, res) => {
  const receiptId = routeId(req);
  res
    .status(201)
    .json(
      await write(
        req,
        "finance",
        (client, w, input) => service.createBill(client, w, input, receiptId, "payable"),
        "Supplier bill posted",
      ),
    );
});
erpRouter.post("/payments", async (req, res) => {
  res.status(201).json(await write(req, "finance", service.recordPayment, "Payment recorded"));
});
erpRouter.post("/boms", async (req, res) => {
  res.status(201).json(await write(req, "production", service.createBom, "Bill of materials version created"));
});
erpRouter.post("/work-orders", async (req, res) => {
  res.status(201).json(await write(req, "production", service.createWorkOrder, "Work order planned"));
});
erpRouter.post("/work-orders/:id/start", async (req, res) => {
  const workOrderId = routeId(req);
  res.json(
    await write(
      req,
      "production",
      (client, w, input) => service.startWorkOrder(client, w, input, workOrderId),
      "Production started and material issued",
    ),
  );
});
erpRouter.post("/work-orders/:id/complete", async (req, res) => {
  const workOrderId = routeId(req);
  res.json(
    await write(
      req,
      "production",
      (client, w, input) => service.completeWorkOrder(client, w, input, workOrderId),
      "Production completed and accepted output stocked",
    ),
  );
});
erpRouter.post("/sales-orders", async (req, res) => {
  res.status(201).json(await write(req, "sales", service.createSalesOrder, "Sales order confirmed and stock reserved"));
});
erpRouter.post("/sales-orders/:id/dispatch", async (req, res) => {
  const orderId = routeId(req);
  res
    .status(201)
    .json(
      await write(
        req,
        "warehouse",
        (client, w, input) => service.dispatchSalesOrder(client, w, input, orderId),
        "Order dispatched and stock updated",
      ),
    );
});
erpRouter.post("/dispatches/:id/invoice", async (req, res) => {
  const dispatchId = routeId(req);
  res
    .status(201)
    .json(
      await write(
        req,
        "finance",
        (client, w, input) => service.createBill(client, w, input, dispatchId, "receivable"),
        "Customer invoice posted",
      ),
    );
});
erpRouter.post("/expenses", async (req, res) => {
  res.status(201).json(await write(req, "finance", service.createExpense, "Expense recorded"));
});
