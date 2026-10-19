-- Company-scoped operational subledgers. Quantities/money are exact NUMERIC.
CREATE TABLE erp_sequences (
 company_id UUID NOT NULL REFERENCES companies(id), prefix VARCHAR(12) NOT NULL,
 value BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(company_id,prefix)
);
CREATE TABLE erp_idempotency (
 company_id UUID NOT NULL REFERENCES companies(id), key VARCHAR(100) NOT NULL,
 fingerprint CHAR(64) NOT NULL, response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id,key)
);
CREATE TABLE erp_warehouses (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), code VARCHAR(32) NOT NULL,
 name VARCHAR(150) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code)
);
CREATE TABLE erp_items (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), sku VARCHAR(40) NOT NULL,
 name VARCHAR(150) NOT NULL, kind VARCHAR(12) NOT NULL CHECK(kind IN('raw','finished')),
 unit VARCHAR(12) NOT NULL CHECK(unit IN('kg','pcs','litre','metre','pack')),
 reorder_level NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(reorder_level>=0),
 unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 selling_price NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(selling_price>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,id), UNIQUE(company_id,sku)
);
CREATE TABLE erp_parties (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id),
 kind VARCHAR(12) NOT NULL CHECK(kind IN('supplier','customer')), code VARCHAR(32) NOT NULL,
 name VARCHAR(150) NOT NULL, email VARCHAR(254), phone VARCHAR(32), address VARCHAR(500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,id), UNIQUE(company_id,kind,code)
);
CREATE TABLE erp_stock_balances (
 company_id UUID NOT NULL REFERENCES companies(id), warehouse_id UUID NOT NULL, item_id UUID NOT NULL,
 on_hand NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(on_hand>=0),
 reserved NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),
 PRIMARY KEY(company_id,warehouse_id,item_id),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES erp_warehouses(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_stock_ledger (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), warehouse_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity<>0), unit_cost NUMERIC(18,4) NOT NULL CHECK(unit_cost>=0),
 movement VARCHAR(32) NOT NULL CHECK(movement IN('opening','adjustment','purchase_receipt','production_issue','production_return','production_output','sales_dispatch')),
 reference_id UUID NOT NULL, reference_code VARCHAR(40) NOT NULL, note VARCHAR(500), actor_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES erp_warehouses(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE INDEX erp_ledger_company_created ON erp_stock_ledger(company_id,created_at DESC);
CREATE FUNCTION erp_reject_ledger_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM companies WHERE id=OLD.company_id) THEN
  RETURN OLD;
 END IF;
 RAISE EXCEPTION 'Posted stock ledger entries are immutable; use a new reversal or adjustment entry';
END;
$$;
CREATE TRIGGER erp_stock_ledger_immutable BEFORE UPDATE OR DELETE ON erp_stock_ledger
 FOR EACH ROW EXECUTE FUNCTION erp_reject_ledger_change();

CREATE TABLE erp_purchase_orders (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), code VARCHAR(40) NOT NULL,
 supplier_id UUID NOT NULL, warehouse_id UUID NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'ordered' CHECK(status IN('ordered','partial','received')),
 total NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(total>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,supplier_id) REFERENCES erp_parties(company_id,id),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES erp_warehouses(company_id,id)
);
CREATE TABLE erp_purchase_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, purchase_order_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0), received_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(received_quantity>=0 AND received_quantity<=quantity),
 unit_price NUMERIC(18,4) NOT NULL CHECK(unit_price>=0), UNIQUE(company_id,id), UNIQUE(company_id,purchase_order_id,item_id),
 FOREIGN KEY(company_id,purchase_order_id) REFERENCES erp_purchase_orders(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_receipts (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, purchase_order_id UUID NOT NULL,
 total NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(total>=0), note VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,purchase_order_id) REFERENCES erp_purchase_orders(company_id,id)
);
CREATE TABLE erp_receipt_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, receipt_id UUID NOT NULL, purchase_line_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0), unit_price NUMERIC(18,4) NOT NULL CHECK(unit_price>=0),
 FOREIGN KEY(company_id,receipt_id) REFERENCES erp_receipts(company_id,id),
 FOREIGN KEY(company_id,purchase_line_id) REFERENCES erp_purchase_lines(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id), UNIQUE(company_id,receipt_id,purchase_line_id)
);
CREATE TABLE erp_boms (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, product_id UUID NOT NULL,
 name VARCHAR(150) NOT NULL, version INTEGER NOT NULL CHECK(version>0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,product_id,version),
 FOREIGN KEY(company_id,product_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_bom_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, bom_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0), UNIQUE(company_id,bom_id,item_id),
 FOREIGN KEY(company_id,bom_id) REFERENCES erp_boms(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_work_orders (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, bom_id UUID NOT NULL,
 product_id UUID NOT NULL, warehouse_id UUID NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(status IN('draft','in_progress','completed')),
 planned_quantity NUMERIC(18,6) NOT NULL CHECK(planned_quantity>0),
 good_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(good_quantity>=0),
 rejected_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(rejected_quantity>=0),
 labour_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(labour_cost>=0),
 material_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(material_cost>=0),
 unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(unit_cost>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
 CHECK(good_quantity+rejected_quantity<=planned_quantity), UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,bom_id) REFERENCES erp_boms(company_id,id),
 FOREIGN KEY(company_id,product_id) REFERENCES erp_items(company_id,id),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES erp_warehouses(company_id,id)
);
CREATE TABLE erp_work_order_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, work_order_id UUID NOT NULL, item_id UUID NOT NULL,
 planned_quantity NUMERIC(18,6) NOT NULL CHECK(planned_quantity>0),
 issued_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(issued_quantity>=0),
 returned_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(returned_quantity>=0 AND returned_quantity<=issued_quantity),
 unit_cost NUMERIC(18,4) NOT NULL CHECK(unit_cost>=0), UNIQUE(company_id,work_order_id,item_id),
 FOREIGN KEY(company_id,work_order_id) REFERENCES erp_work_orders(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_sales_orders (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, customer_id UUID NOT NULL, warehouse_id UUID NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'confirmed' CHECK(status IN('confirmed','partial','dispatched')),
 total NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(total>=0), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,customer_id) REFERENCES erp_parties(company_id,id),
 FOREIGN KEY(company_id,warehouse_id) REFERENCES erp_warehouses(company_id,id)
);
CREATE TABLE erp_sales_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, sales_order_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0),
 dispatched_quantity NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK(dispatched_quantity>=0 AND dispatched_quantity<=quantity),
 unit_price NUMERIC(18,4) NOT NULL CHECK(unit_price>=0), UNIQUE(company_id,id), UNIQUE(company_id,sales_order_id,item_id),
 FOREIGN KEY(company_id,sales_order_id) REFERENCES erp_sales_orders(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id)
);
CREATE TABLE erp_dispatches (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, sales_order_id UUID NOT NULL,
 total NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(total>=0), note VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(company_id,id), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,sales_order_id) REFERENCES erp_sales_orders(company_id,id)
);
CREATE TABLE erp_dispatch_lines (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, dispatch_id UUID NOT NULL, sales_line_id UUID NOT NULL, item_id UUID NOT NULL,
 quantity NUMERIC(18,6) NOT NULL CHECK(quantity>0), unit_price NUMERIC(18,4) NOT NULL CHECK(unit_price>=0),
 FOREIGN KEY(company_id,dispatch_id) REFERENCES erp_dispatches(company_id,id),
 FOREIGN KEY(company_id,sales_line_id) REFERENCES erp_sales_lines(company_id,id),
 FOREIGN KEY(company_id,item_id) REFERENCES erp_items(company_id,id), UNIQUE(company_id,dispatch_id,sales_line_id)
);
CREATE TABLE erp_bills (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL,
 direction VARCHAR(12) NOT NULL CHECK(direction IN('payable','receivable')), party_id UUID NOT NULL,
 receipt_id UUID, dispatch_id UUID,
 total NUMERIC(18,4) NOT NULL CHECK(total>=0), paid NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(paid>=0 AND paid<=total),
 due_date DATE NOT NULL DEFAULT(CURRENT_DATE+30), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((direction='payable' AND receipt_id IS NOT NULL AND dispatch_id IS NULL) OR(direction='receivable' AND dispatch_id IS NOT NULL AND receipt_id IS NULL)),
 UNIQUE(company_id,id), UNIQUE(company_id,code), UNIQUE(company_id,receipt_id), UNIQUE(company_id,dispatch_id),
 FOREIGN KEY(company_id,party_id) REFERENCES erp_parties(company_id,id),
 FOREIGN KEY(company_id,receipt_id) REFERENCES erp_receipts(company_id,id),
 FOREIGN KEY(company_id,dispatch_id) REFERENCES erp_dispatches(company_id,id)
);
CREATE TABLE erp_payments (
 id UUID PRIMARY KEY, company_id UUID NOT NULL, code VARCHAR(40) NOT NULL, bill_id UUID NOT NULL,
 amount NUMERIC(18,4) NOT NULL CHECK(amount>0), method VARCHAR(12) NOT NULL CHECK(method IN('bank','cash','upi')),
 note VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,code),
 FOREIGN KEY(company_id,bill_id) REFERENCES erp_bills(company_id,id)
);
CREATE TABLE erp_expenses (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), code VARCHAR(40) NOT NULL,
 category VARCHAR(60) NOT NULL, description VARCHAR(250) NOT NULL,
 amount NUMERIC(18,4) NOT NULL CHECK(amount>0), expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(company_id,code)
);
CREATE TABLE erp_audit (
 id UUID PRIMARY KEY, company_id UUID NOT NULL REFERENCES companies(id), actor_id UUID NOT NULL,
 action VARCHAR(60) NOT NULL, entity_type VARCHAR(40) NOT NULL, entity_id UUID NOT NULL,
 description VARCHAR(500) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX erp_audit_company_created ON erp_audit(company_id,created_at DESC);
CREATE TRIGGER erp_audit_immutable BEFORE UPDATE OR DELETE ON erp_audit
 FOR EACH ROW EXECUTE FUNCTION erp_reject_ledger_change();
CREATE TABLE erp_demo_seeds (
 company_id UUID PRIMARY KEY REFERENCES companies(id), version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company deletion is an administrative database-only operation (there is no API for it).
-- Direct ledger/audit deletion remains forbidden while its parent company exists.
DO $$
DECLARE t text; c record;
BEGIN
 FOREACH t IN ARRAY ARRAY['erp_sequences','erp_idempotency','erp_warehouses','erp_items','erp_parties',
 'erp_stock_balances','erp_stock_ledger','erp_purchase_orders','erp_purchase_lines','erp_receipts',
 'erp_receipt_lines','erp_boms','erp_bom_lines','erp_work_orders','erp_work_order_lines',
 'erp_sales_orders','erp_sales_lines','erp_dispatches','erp_dispatch_lines','erp_bills','erp_payments',
 'erp_expenses','erp_audit','erp_demo_seeds'] LOOP
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=t::regclass AND confrelid='companies'::regclass LOOP
   EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I',t,c.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE',t,t||'_company_fk');
 END LOOP;
END;
$$;
