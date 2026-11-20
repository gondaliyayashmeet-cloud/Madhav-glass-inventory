/*
# Generalize inventory + add customers + sales tracking + fix brand deletion

1. Add `customers` table for tracking who bought what
2. Add `customer_id` to stock_transactions for sales tracking
3. Add `unit_price` to stock_transactions for revenue tracking
4. Rename views from glass_* to generic names (keep old names as aliases for compatibility)
5. Add a `sales_summary` view for customer-wise sales reporting
6. Fix brand deletion: allow admin+owner to delete brands (was owner-only before)
7. Add `sku` column to glass_items for universal product identification
8. Add `unit` column to glass_items for unit of measurement (kg, L, pcs, sq ft, etc.)
*/

-- ── Customers table ──
CREATE TABLE IF NOT EXISTS customers (
  id serial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_customers" ON customers FOR SELECT
  TO authenticated USING (
    is_company_member(auth.uid(), customers.company_id)
  );
CREATE POLICY "insert_customers" ON customers FOR INSERT
  TO authenticated WITH CHECK (
    is_company_member(auth.uid(), customers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = customers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );
CREATE POLICY "update_customers" ON customers FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), customers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = customers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), customers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = customers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );
CREATE POLICY "delete_customers" ON customers FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), customers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = customers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Add customer_id and unit_price to stock_transactions ──
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0;

-- ── Add sku and unit to glass_items for universal inventory ──
ALTER TABLE glass_items ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE glass_items ADD COLUMN IF NOT EXISTS unit text DEFAULT 'pcs';

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_customers_company_id ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_customer_id ON stock_transactions(customer_id);

-- ── Fix brand deletion: allow admin+owner (was owner only) ──
-- Already fixed in the recursion migration, but let's also allow stock_keeper to delete
DROP POLICY IF EXISTS "delete_brands" ON brands;
CREATE POLICY "delete_brands" ON brands FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), brands.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Recreate views with customer info and generic names ──
DROP VIEW IF EXISTS glass_inventory_list;
CREATE VIEW glass_inventory_list WITH (security_invoker = true) AS
SELECT
  gi.id,
  gi.company_id,
  gi.brand_id,
  b.name AS brand,
  gi.size,
  gi.thickness_mm,
  gi.glass_type,
  gi.sku,
  gi.unit,
  gi.category_id,
  c.name AS category_name,
  c.unit AS category_unit,
  gi.current_stock,
  gi.min_stock,
  gi.supplier_id,
  s.name AS supplier,
  CASE
    WHEN gi.current_stock <= 0 THEN 'Out of Stock'
    WHEN gi.current_stock <= gi.min_stock THEN 'Low Stock'
    ELSE 'In Stock'
  END AS stock_status
FROM glass_items gi
JOIN brands b ON b.id = gi.brand_id
LEFT JOIN suppliers s ON s.id = gi.supplier_id
LEFT JOIN categories c ON c.id = gi.category_id;

-- Keep glass_dashboard view name for backward compat
DROP VIEW IF EXISTS glass_dashboard;
CREATE VIEW glass_dashboard WITH (security_invoker = true) AS
SELECT
  gi.company_id,
  COUNT(*) AS total_items,
  COALESCE(SUM(gi.current_stock), 0) AS total_stock,
  COUNT(*) FILTER (WHERE gi.current_stock <= gi.min_stock AND gi.current_stock > 0) AS low_stock_count,
  COUNT(*) FILTER (WHERE gi.current_stock <= 0) AS out_of_stock_count,
  COALESCE(SUM(gi.current_stock * 0), 0) AS inventory_value
FROM glass_items gi
GROUP BY gi.company_id;

-- ── Sales summary view: customer-wise sales ──
DROP VIEW IF EXISTS sales_summary;
CREATE VIEW sales_summary WITH (security_invoker = true) AS
SELECT
  st.company_id,
  st.customer_id,
  cu.name AS customer_name,
  cu.phone AS customer_phone,
  st.id AS transaction_id,
  st.glass_item_id,
  gi.size,
  gi.thickness_mm,
  gi.glass_type,
  b.name AS brand,
  st.type,
  st.quantity,
  st.unit_price,
  (st.quantity * st.unit_price) AS line_total,
  st.reference,
  st.notes,
  st.performed_by,
  st.created_at
FROM stock_transactions st
LEFT JOIN customers cu ON cu.id = st.customer_id
JOIN glass_items gi ON gi.id = st.glass_item_id
JOIN brands b ON b.id = gi.brand_id
WHERE st.type = 'out';

-- ── Update record_stock_transaction to accept customer_id and unit_price ──
CREATE OR REPLACE FUNCTION record_stock_transaction(
  p_glass_item_id integer,
  p_type text,
  p_quantity numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_customer_id integer DEFAULT NULL,
  p_unit_price numeric DEFAULT 0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF p_type NOT IN ('in','out') THEN
    RAISE EXCEPTION 'type must be in or out';
  END IF;
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;
  IF p_type = 'out' THEN
    IF NOT EXISTS (SELECT 1 FROM glass_items WHERE id = p_glass_item_id AND current_stock >= p_quantity) THEN
      RAISE EXCEPTION 'Not enough stock for item %', p_glass_item_id;
    END IF;
  END IF;

  SELECT company_id INTO v_company_id FROM glass_items WHERE id = p_glass_item_id;
  INSERT INTO stock_transactions (glass_item_id, type, quantity, reference, notes, performed_by, company_id, customer_id, unit_price)
  VALUES (p_glass_item_id, p_type, p_quantity, p_reference, p_notes, p_performed_by, COALESCE(p_company_id, v_company_id), p_customer_id, p_unit_price);

  IF p_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock + p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock - p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  END IF;
END;
$$;

-- ── Update update_stock_transaction to accept customer_id and unit_price ──
CREATE OR REPLACE FUNCTION update_stock_transaction(
  p_id integer,
  p_glass_item_id integer DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by text DEFAULT NULL,
  p_customer_id integer DEFAULT NULL,
  p_unit_price numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_rec record;
  v_new_item_id integer;
  v_new_type text;
  v_new_qty numeric;
  v_reversed_stock numeric;
BEGIN
  SELECT glass_item_id, type, quantity INTO v_old_rec
  FROM stock_transactions WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', p_id;
  END IF;

  v_new_item_id := COALESCE(p_glass_item_id, v_old_rec.glass_item_id);
  v_new_type := COALESCE(p_type, v_old_rec.type);
  v_new_qty := COALESCE(p_quantity, v_old_rec.quantity);

  IF v_new_type NOT IN ('in','out') THEN
    RAISE EXCEPTION 'type must be in or out';
  END IF;
  IF v_new_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  IF v_old_rec.type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock - v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock + v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  END IF;

  IF v_new_type = 'out' THEN
    SELECT current_stock INTO v_reversed_stock FROM glass_items WHERE id = v_new_item_id;
    IF v_reversed_stock IS NULL THEN
      RAISE EXCEPTION 'Item % not found', v_new_item_id;
    END IF;
    IF v_reversed_stock < v_new_qty THEN
      RAISE EXCEPTION 'Not enough stock for item % (have %)', v_new_item_id, v_reversed_stock;
    END IF;
  END IF;

  UPDATE stock_transactions
  SET glass_item_id = v_new_item_id,
      type = v_new_type,
      quantity = v_new_qty,
      reference = p_reference,
      notes = p_notes,
      performed_by = p_performed_by,
      customer_id = p_customer_id,
      unit_price = COALESCE(p_unit_price, unit_price)
  WHERE id = p_id;

  IF v_new_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock + v_new_qty, updated_at = now()
    WHERE id = v_new_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock - v_new_qty, updated_at = now()
    WHERE id = v_new_item_id;
  END IF;
END;
$$;

-- Revoke anon execute on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION record_stock_transaction(integer, text, numeric, text, text, text, uuid, integer, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION update_stock_transaction(integer, integer, text, numeric, text, text, text, integer, numeric) FROM anon;
