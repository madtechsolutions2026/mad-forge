ALTER TABLE erp_purchase_orders
  ADD COLUMN order_date DATE,
  ADD COLUMN expected_date DATE,
  ADD COLUMN supplier_reference VARCHAR(100),
  ADD COLUMN payment_terms VARCHAR(200),
  ADD COLUMN delivery_address VARCHAR(1000),
  ADD COLUMN notes VARCHAR(2000);

UPDATE erp_purchase_orders SET order_date = created_at::date;
ALTER TABLE erp_purchase_orders
  ALTER COLUMN order_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN order_date SET NOT NULL,
  ADD CONSTRAINT erp_purchase_expected_date_check
    CHECK (expected_date IS NULL OR expected_date >= order_date);
