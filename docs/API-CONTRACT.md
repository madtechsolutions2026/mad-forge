# FORGE operations API

## Phase 0 tooling note

Phase 0 changes formatting, development tooling, static frontend types, CI and
container packaging only. Existing endpoints, request/response JSON, roles,
idempotency handling, decimal strings and transaction behavior are unchanged.
Migrations 001-004 remain byte-for-byte unchanged. Container startup invokes the
existing migration runner before starting the existing server; local startup
and its loopback default are unchanged.

All endpoints are under `/api/erp`, require the authenticated company session, and return JSON. GET `/workspace` returns the complete current company workspace. All POSTs require a fresh `X-Idempotency-Key` (UUID is convenient); retry the same request with the same key. Reusing a key for different input returns 409. Successful mutations return `{ data: { id, code?, ... }, message }`; refresh `/workspace` after a mutation. Errors return `{status:"error",message}`. Monetary and quantity values are decimal strings, not cents. Currency is INR. IDs are UUID strings. Company is always taken from the authenticated session, never from request bodies.

## Workspace shape

```
{
 company: {id,name,address,phone},
 summary: {revenue,collected,receivables,payables,expenses,inventoryValue,openPurchases,activeWorkOrders,openSales,lowStockCount},
 items: [{id,sku,name,kind,unit,reorderLevel,unitCost,sellingPrice}],
 warehouses: [{id,code,name}],
 suppliers/customers: [{id,code,name,email,phone,address}],
 inventory: [{itemId,warehouseId,itemName,sku,kind,unit,warehouseName,onHand,reserved,available,unitCost,reorderLevel}],
 stockLedger: [{id,itemId,itemName,warehouseId,warehouseName,quantity,unitCost,movement,referenceCode,note,createdAt}],
 purchaseOrders: [{id,code,supplierId,supplierName,warehouseId,warehouseName,status,total,createdAt,lines:[{id,itemId,itemName,unit,quantity,receivedQuantity,unitPrice}]}],
 receipts: [{id,code,purchaseOrderId,purchaseOrderCode,supplierName,total,createdAt,billId,lines:[{id,itemId,itemName,unit,quantity,unitPrice}]}],
 bills: [{id,code,direction,partyId,partyName,sourceId,sourceCode,total,paid,balance,status,dueDate,createdAt}],
 payments: [{id,code,billId,billCode,direction,partyName,amount,method,note,createdAt}],
 boms: [{id,code,name,productId,productName,version,lines:[{itemId,itemName,unit,quantity}]}],
 workOrders: [{id,code,bomId,productId,productName,warehouseId,warehouseName,status,plannedQuantity,goodQuantity,rejectedQuantity,labourCost,materialCost,unitCost,createdAt,lines:[{itemId,itemName,unit,plannedQuantity,issuedQuantity,returnedQuantity,unitCost}]}],
 salesOrders: [{id,code,customerId,customerName,warehouseId,warehouseName,status,total,createdAt,lines:[{id,itemId,itemName,unit,quantity,dispatchedQuantity,unitPrice}]}],
 dispatches: [{id,code,salesOrderId,salesOrderCode,customerName,total,createdAt,invoiceId,lines:[{id,itemId,itemName,unit,quantity,unitPrice}]}],
 expenses: [{id,code,category,description,amount,expenseDate,createdAt}],
 activity: [{id,action,entityType,entityId,description,createdAt}]
}
```

`summary.revenue` = posted customer invoices, not profit. `inventoryValue` is indicative on-hand x current standard item cost. Bills includes both supplier bills (`payable`) and customer invoices (`receivable`). Document statuses are server-calculated.

## POST bodies

- `/items`: `{sku,name,kind:"raw"|"finished",unit:"kg"|"pcs"|"litre"|"metre"|"pack",reorderLevel?,unitCost?,sellingPrice?}`.
- `/warehouses`: `{code,name}`.
- `/suppliers`, `/customers`: `{code,name,email?,phone?,address?}`.
- `/inventory/adjustments`: `{itemId,warehouseId,quantity:"positive or negative decimal",note:"reason"}`. Cannot consume reserved stock. Owner/admin/warehouse only.
- `/purchase-orders`: `{supplierId,warehouseId,orderDate?,expectedDate?,supplierReference?,paymentTerms?,deliveryAddress?,notes?,lines:[{itemId,quantity,unitPrice}]}`. Dates use YYYY-MM-DD; expected delivery cannot precede the order date. Optional text limits: supplierReference 100, paymentTerms 200, deliveryAddress 1000, notes 2000. Existing clients may omit these fields.
- `/purchase-orders/:id/receive`: `{lines:[{lineId,quantity}],note?}`. Partial receipt; no over-receipts. Receipt increases stock immediately. Response contains receipt `id`, `code`.
- `/receipts/:id/bill`: `{dueDate?:"YYYY-MM-DD"}`. One supplier bill for the receipt total.
- `/payments`: `{billId,amount,method:"bank"|"cash"|"upi",note?}`. Works for supplier payments and customer collections; no overpayment. Finance/owner/admin only.
- `/boms`: `{productId,name,lines:[{itemId,quantity}]}`. Quantity = raw material per ONE finished unit. Creates next immutable version for this product. Finished product and raw input kinds enforced.
- `/work-orders`: `{bomId,warehouseId,plannedQuantity}`. Snapshots BOM lines and costs. Draft initially.
- `/work-orders/:id/start`: `{}`. Issues all planned raw material atomically; no negative/over-reserved stock.
- `/work-orders/:id/complete`: `{goodQuantity,rejectedQuantity,labourCost?,returns?:[{itemId,quantity}]}`. One completion; total output <= planned; good output >0. Optional unused-material returns. Accepted output increases finished stock, rejected output does not. Actual unit cost = (consumed material cost + labour) / accepted output. Work order records cost; not a general ledger posting.
- `/sales-orders`: `{customerId,warehouseId,lines:[{itemId,quantity,unitPrice}]}`. Reserves available finished goods immediately. No overselling. Partial dispatch supported.
- `/sales-orders/:id/dispatch`: `{lines:[{lineId,quantity}],note?}`. Consumes stock and releases matching reservation atomically. No over-dispatch. Response contains dispatch `id`, `code`.
- `/dispatches/:id/invoice`: `{dueDate?:"YYYY-MM-DD"}`. One customer invoice for the dispatch.
- `/expenses`: `{category,description,amount,expenseDate:"YYYY-MM-DD"}`. Finance/owner/admin only.

## Scope and limitations

Professional development MVP, not a certified accounting or tax system. No taxes/GST/e-invoicing, statutory financial statements, payroll, multi-currency, returns/credit notes, document cancellation, inter-warehouse transfer, or backdated stock valuation in this iteration. Do not suggest those actions in UI. Production is single-stage, one warehouse, one completion per work order, with partial good/reject yield. Demo records must be labelled as demonstration data. Existing document values are immutable; correction workflows require future reversal documents.

Purchase-order workspace records additionally return orderDate, expectedDate, supplierReference, paymentTerms, deliveryAddress and notes. Dates are formatted YYYY-MM-DD, with null for omitted optional values. Migration 004 is required.
