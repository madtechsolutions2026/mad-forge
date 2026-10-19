import { pool } from "../../config/db.js";
import { type Workspace } from "./erp.core.js";

// Every query is company scoped. One read snapshot prevents half-posted dashboard views.
export async function getWorkspace(w: Workspace): Promise<Record<string, unknown>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const query = async (sql: string) => (await client.query(sql, [w.companyId])).rows;
    const company = (await query("SELECT id,name,address,phone FROM companies WHERE id=$1"))[0];
    const items = await query(
      `SELECT id,sku,name,kind,unit,reorder_level AS "reorderLevel",unit_cost AS "unitCost",selling_price AS "sellingPrice" FROM erp_items WHERE company_id=$1 ORDER BY kind,name`,
    );
    const warehouses = await query("SELECT id,code,name FROM erp_warehouses WHERE company_id=$1 ORDER BY name");
    const suppliers = await query(
      "SELECT id,code,name,email,phone,address FROM erp_parties WHERE company_id=$1 AND kind='supplier' ORDER BY name",
    );
    const customers = await query(
      "SELECT id,code,name,email,phone,address FROM erp_parties WHERE company_id=$1 AND kind='customer' ORDER BY name",
    );
    const inventory =
      await query(`SELECT i.id AS "itemId",w.id AS "warehouseId",i.name AS "itemName",i.sku,i.kind,i.unit,w.name AS "warehouseName",
      COALESCE(b.on_hand,0)::text AS "onHand",COALESCE(b.reserved,0)::text AS reserved,(COALESCE(b.on_hand,0)-COALESCE(b.reserved,0))::text AS available,
      i.unit_cost AS "unitCost",i.reorder_level AS "reorderLevel"
      FROM erp_items i JOIN erp_warehouses w ON w.company_id=i.company_id
      LEFT JOIN erp_stock_balances b ON b.company_id=i.company_id AND b.item_id=i.id AND b.warehouse_id=w.id
      WHERE i.company_id=$1 ORDER BY i.kind,i.name,w.name`);
    const stockLedger =
      await query(`SELECT l.id,l.item_id AS "itemId",i.name AS "itemName",l.warehouse_id AS "warehouseId",w.name AS "warehouseName",l.quantity,l.unit_cost AS "unitCost",l.movement,l.reference_code AS "referenceCode",l.note,l.created_at AS "createdAt"
      FROM erp_stock_ledger l JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id JOIN erp_warehouses w ON w.company_id=l.company_id AND w.id=l.warehouse_id
      WHERE l.company_id=$1 ORDER BY l.created_at DESC,l.id LIMIT 500`);
    const purchaseOrders =
      await query(`SELECT o.id,o.code,o.supplier_id AS "supplierId",p.name AS "supplierName",o.warehouse_id AS "warehouseId",w.name AS "warehouseName",o.status,o.total,o.created_at AS "createdAt",
      to_char(o.order_date,'YYYY-MM-DD') AS "orderDate",to_char(o.expected_date,'YYYY-MM-DD') AS "expectedDate",
      o.supplier_reference AS "supplierReference",o.payment_terms AS "paymentTerms",o.delivery_address AS "deliveryAddress",o.notes,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'itemId',l.item_id,'itemName',i.name,'unit',i.unit,'quantity',l.quantity::text,'receivedQuantity',l.received_quantity::text,'unitPrice',l.unit_price::text) ORDER BY i.name)
        FROM erp_purchase_lines l JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=o.company_id AND l.purchase_order_id=o.id),'[]') AS lines
      FROM erp_purchase_orders o JOIN erp_parties p ON p.company_id=o.company_id AND p.id=o.supplier_id JOIN erp_warehouses w ON w.company_id=o.company_id AND w.id=o.warehouse_id
      WHERE o.company_id=$1 ORDER BY o.created_at DESC,o.code DESC`);
    const receipts =
      await query(`SELECT r.id,r.code,r.purchase_order_id AS "purchaseOrderId",o.code AS "purchaseOrderCode",p.name AS "supplierName",r.total,r.created_at AS "createdAt",b.id AS "billId",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'itemId',l.item_id,'itemName',i.name,'unit',i.unit,'quantity',l.quantity::text,'unitPrice',l.unit_price::text) ORDER BY i.name)
        FROM erp_receipt_lines l JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=r.company_id AND l.receipt_id=r.id),'[]') AS lines
      FROM erp_receipts r JOIN erp_purchase_orders o ON o.company_id=r.company_id AND o.id=r.purchase_order_id JOIN erp_parties p ON p.company_id=o.company_id AND p.id=o.supplier_id
      LEFT JOIN erp_bills b ON b.company_id=r.company_id AND b.receipt_id=r.id WHERE r.company_id=$1 ORDER BY r.created_at DESC,r.code DESC`);
    const boms = await query(`SELECT b.id,b.code,b.name,b.product_id AS "productId",i.name AS "productName",b.version,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('itemId',l.item_id,'itemName',raw.name,'unit',raw.unit,'quantity',l.quantity::text) ORDER BY raw.name)
        FROM erp_bom_lines l JOIN erp_items raw ON raw.company_id=l.company_id AND raw.id=l.item_id WHERE l.company_id=b.company_id AND l.bom_id=b.id),'[]') AS lines
      FROM erp_boms b JOIN erp_items i ON i.company_id=b.company_id AND i.id=b.product_id WHERE b.company_id=$1 ORDER BY b.created_at DESC,b.version DESC`);
    const workOrders =
      await query(`SELECT o.id,o.code,o.bom_id AS "bomId",o.product_id AS "productId",i.name AS "productName",o.warehouse_id AS "warehouseId",w.name AS "warehouseName",o.status,
      o.planned_quantity AS "plannedQuantity",o.good_quantity AS "goodQuantity",o.rejected_quantity AS "rejectedQuantity",o.labour_cost AS "labourCost",o.material_cost AS "materialCost",o.unit_cost AS "unitCost",o.created_at AS "createdAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('itemId',l.item_id,'itemName',raw.name,'unit',raw.unit,'plannedQuantity',l.planned_quantity::text,'issuedQuantity',l.issued_quantity::text,'returnedQuantity',l.returned_quantity::text,'unitCost',l.unit_cost::text) ORDER BY raw.name)
        FROM erp_work_order_lines l JOIN erp_items raw ON raw.company_id=l.company_id AND raw.id=l.item_id WHERE l.company_id=o.company_id AND l.work_order_id=o.id),'[]') AS lines
      FROM erp_work_orders o JOIN erp_items i ON i.company_id=o.company_id AND i.id=o.product_id JOIN erp_warehouses w ON w.company_id=o.company_id AND w.id=o.warehouse_id
      WHERE o.company_id=$1 ORDER BY o.created_at DESC,o.code DESC`);
    const salesOrders =
      await query(`SELECT o.id,o.code,o.customer_id AS "customerId",p.name AS "customerName",o.warehouse_id AS "warehouseId",w.name AS "warehouseName",o.status,o.total,o.created_at AS "createdAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'itemId',l.item_id,'itemName',i.name,'unit',i.unit,'quantity',l.quantity::text,'dispatchedQuantity',l.dispatched_quantity::text,'unitPrice',l.unit_price::text) ORDER BY i.name)
        FROM erp_sales_lines l JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=o.company_id AND l.sales_order_id=o.id),'[]') AS lines
      FROM erp_sales_orders o JOIN erp_parties p ON p.company_id=o.company_id AND p.id=o.customer_id JOIN erp_warehouses w ON w.company_id=o.company_id AND w.id=o.warehouse_id
      WHERE o.company_id=$1 ORDER BY o.created_at DESC,o.code DESC`);
    const dispatches =
      await query(`SELECT d.id,d.code,d.sales_order_id AS "salesOrderId",o.code AS "salesOrderCode",p.name AS "customerName",d.total,d.created_at AS "createdAt",b.id AS "invoiceId",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'itemId',l.item_id,'itemName',i.name,'unit',i.unit,'quantity',l.quantity::text,'unitPrice',l.unit_price::text) ORDER BY i.name)
        FROM erp_dispatch_lines l JOIN erp_items i ON i.company_id=l.company_id AND i.id=l.item_id WHERE l.company_id=d.company_id AND l.dispatch_id=d.id),'[]') AS lines
      FROM erp_dispatches d JOIN erp_sales_orders o ON o.company_id=d.company_id AND o.id=d.sales_order_id JOIN erp_parties p ON p.company_id=o.company_id AND p.id=o.customer_id
      LEFT JOIN erp_bills b ON b.company_id=d.company_id AND b.dispatch_id=d.id WHERE d.company_id=$1 ORDER BY d.created_at DESC,d.code DESC`);
    const bills =
      await query(`SELECT b.id,b.code,b.direction,b.party_id AS "partyId",p.name AS "partyName",COALESCE(b.receipt_id,b.dispatch_id) AS "sourceId",COALESCE(r.code,d.code) AS "sourceCode",b.total,b.paid,(b.total-b.paid)::text AS balance,
      CASE WHEN b.paid=b.total THEN 'paid' WHEN b.paid>0 THEN 'partial' ELSE 'unpaid' END AS status,to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",b.created_at AS "createdAt"
      FROM erp_bills b JOIN erp_parties p ON p.company_id=b.company_id AND p.id=b.party_id LEFT JOIN erp_receipts r ON r.company_id=b.company_id AND r.id=b.receipt_id LEFT JOIN erp_dispatches d ON d.company_id=b.company_id AND d.id=b.dispatch_id
      WHERE b.company_id=$1 ORDER BY b.created_at DESC,b.code DESC`);
    const payments =
      await query(`SELECT p.id,p.code,p.bill_id AS "billId",b.code AS "billCode",b.direction,party.name AS "partyName",p.amount,p.method,p.note,p.created_at AS "createdAt"
      FROM erp_payments p JOIN erp_bills b ON b.company_id=p.company_id AND b.id=p.bill_id JOIN erp_parties party ON party.company_id=b.company_id AND party.id=b.party_id WHERE p.company_id=$1 ORDER BY p.created_at DESC,p.code DESC`);
    const expenses = await query(
      `SELECT id,code,category,description,amount,to_char(expense_date,'YYYY-MM-DD') AS "expenseDate",created_at AS "createdAt" FROM erp_expenses WHERE company_id=$1 ORDER BY expense_date DESC,created_at DESC`,
    );
    const activity = await query(
      `SELECT id,action,entity_type AS "entityType",entity_id AS "entityId",description,created_at AS "createdAt" FROM erp_audit WHERE company_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
    );
    const summary = (
      await query(`SELECT
      (SELECT COALESCE(SUM(total),0)::text FROM erp_bills WHERE company_id=$1 AND direction='receivable') AS revenue,
      (SELECT COALESCE(SUM(paid),0)::text FROM erp_bills WHERE company_id=$1 AND direction='receivable') AS collected,
      (SELECT COALESCE(SUM(total-paid),0)::text FROM erp_bills WHERE company_id=$1 AND direction='receivable') AS receivables,
      (SELECT COALESCE(SUM(total-paid),0)::text FROM erp_bills WHERE company_id=$1 AND direction='payable') AS payables,
      (SELECT COALESCE(SUM(amount),0)::text FROM erp_expenses WHERE company_id=$1) AS expenses,
      (SELECT COALESCE(SUM(b.on_hand*i.unit_cost),0)::numeric(24,4)::text FROM erp_stock_balances b JOIN erp_items i ON i.company_id=b.company_id AND i.id=b.item_id WHERE b.company_id=$1) AS "inventoryValue",
      (SELECT COUNT(*)::int FROM erp_purchase_orders WHERE company_id=$1 AND status<>'received') AS "openPurchases",
      (SELECT COUNT(*)::int FROM erp_work_orders WHERE company_id=$1 AND status<>'completed') AS "activeWorkOrders",
      (SELECT COUNT(*)::int FROM erp_sales_orders WHERE company_id=$1 AND status<>'dispatched') AS "openSales",
      (SELECT COUNT(*)::int FROM erp_items i WHERE i.company_id=$1 AND COALESCE((SELECT SUM(b.on_hand-b.reserved) FROM erp_stock_balances b WHERE b.company_id=i.company_id AND b.item_id=i.id),0)<i.reorder_level) AS "lowStockCount"`)
    )[0];
    await client.query("COMMIT");
    return {
      company,
      summary,
      items,
      warehouses,
      suppliers,
      customers,
      inventory,
      stockLedger,
      purchaseOrders,
      receipts,
      bills,
      payments,
      boms,
      workOrders,
      salesOrders,
      dispatches,
      expenses,
      activity,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
