/*
# Create Madhav Glass inventory schema

1. New Tables
- `brands` — glass manufacturers/brands (id, name, created_at)
- `suppliers` — supplier companies (id, name, contact, phone, email, address, created_at)
- `glass_items` — individual glass stock items (id, brand_id FK, size, thickness_mm, glass_type, current_stock, min_stock, supplier_id FK, created_at, updated_at)
- `stock_transactions` — stock in/out movements (id, glass_item_id FK, type, quantity, reference, notes, performed_by, created_at)
- `member_roles` — app member access control (id, email, name, role, approved_at, created_at, updated_at)

2. Views
- `glass_inventory_list` — joins glass_items with brands and suppliers for the inventory table, computes stock_status
- `glass_dashboard` — aggregate counts (total_items, total_stock, low_stock_count, out_of_stock_count)

3. Functions
- `record_stock_transaction` — inserts a transaction row and updates glass_items.current_stock atomically

4. Security (RLS)
- All tables have RLS enabled.
- member_roles is locked to the service role (no anon/authenticated policies) — role checks are enforced via an edge function / RPC using the service role key.
- The remaining tables use `TO anon, authenticated` policies so the anon-key frontend client can read/write (single-tenant shared inventory model).

5. Important Notes
- This is a single-tenant inventory app (one shared inventory, no per-user data isolation).
- member_roles is intentionally NOT readable/writable by anon or authenticated — it is managed exclusively via the service role to prevent privilege escalation.
*/

-- ── Brands ──
CREATE TABLE IF NOT EXISTS brands (
  id serial PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_brands" ON brands;
CREATE POLICY "anon_select_brands" ON brands FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_brands" ON brands;
CREATE POLICY "anon_insert_brands" ON brands FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_brands" ON brands;
CREATE POLICY "anon_update_brands" ON brands FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_brands" ON brands;
CREATE POLICY "anon_delete_brands" ON brands FOR DELETE TO anon, authenticated USING (true);

-- ── Suppliers ──
CREATE TABLE IF NOT EXISTS suppliers (
  id serial PRIMARY KEY,
  name text NOT NULL,
  contact text,
  phone text,
  email text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

-- ── Glass items ──
CREATE TABLE IF NOT EXISTS glass_items (
  id serial PRIMARY KEY,
  brand_id integer NOT NULL REFERENCES brands(id) ON DELETE RESTRICT,
  size text NOT NULL,
  thickness_mm numeric NOT NULL DEFAULT 0,
  glass_type text NOT NULL DEFAULT 'Clear',
  current_stock numeric NOT NULL DEFAULT 0,
  min_stock numeric NOT NULL DEFAULT 0,
  supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE glass_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_glass_items" ON glass_items;
CREATE POLICY "anon_select_glass_items" ON glass_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_glass_items" ON glass_items;
CREATE POLICY "anon_insert_glass_items" ON glass_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_glass_items" ON glass_items;
CREATE POLICY "anon_update_glass_items" ON glass_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_glass_items" ON glass_items;
CREATE POLICY "anon_delete_glass_items" ON glass_items FOR DELETE TO anon, authenticated USING (true);

-- ── Stock transactions ──
CREATE TABLE IF NOT EXISTS stock_transactions (
  id serial PRIMARY KEY,
  glass_item_id integer NOT NULL REFERENCES glass_items(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('in','out')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  reference text,
  notes text,
  performed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stock_transactions" ON stock_transactions;
CREATE POLICY "anon_select_stock_transactions" ON stock_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stock_transactions" ON stock_transactions;
CREATE POLICY "anon_insert_stock_transactions" ON stock_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stock_transactions" ON stock_transactions;
CREATE POLICY "anon_update_stock_transactions" ON stock_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stock_transactions" ON stock_transactions;
CREATE POLICY "anon_delete_stock_transactions" ON stock_transactions FOR DELETE TO anon, authenticated USING (true);

-- ── Member roles (service-role only — no anon/authenticated policies) ──
CREATE TABLE IF NOT EXISTS member_roles (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text,
  role text NOT NULL DEFAULT 'pending' CHECK (role IN ('owner','admin','stock_keeper','viewer','pending')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE member_roles ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: only the service role can read/write this table.

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_glass_items_brand_id ON glass_items(brand_id);
CREATE INDEX IF NOT EXISTS idx_glass_items_supplier_id ON glass_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_glass_item_id ON stock_transactions(glass_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_created_at ON stock_transactions(created_at DESC);

-- ── View: glass_inventory_list ──
DROP VIEW IF EXISTS glass_inventory_list;
CREATE OR REPLACE VIEW glass_inventory_list AS
SELECT
  gi.id,
  gi.brand_id,
  b.name AS brand,
  gi.size,
  gi.thickness_mm,
  gi.glass_type,
  gi.current_stock,
  gi.min_stock,
  CASE
    WHEN gi.current_stock <= 0 THEN 'Out of Stock'
    WHEN gi.current_stock <= gi.min_stock THEN 'Low Stock'
    ELSE 'In Stock'
  END AS stock_status,
  s.name AS supplier
FROM glass_items gi
JOIN brands b ON b.id = gi.brand_id
LEFT JOIN suppliers s ON s.id = gi.supplier_id;

-- ── View: glass_dashboard ──
DROP VIEW IF EXISTS glass_dashboard;
CREATE OR REPLACE VIEW glass_dashboard AS
SELECT
  (SELECT COUNT(*) FROM glass_items) AS total_items,
  (SELECT COALESCE(SUM(current_stock), 0) FROM glass_items) AS total_stock,
  (SELECT COUNT(*) FROM glass_items WHERE current_stock <= min_stock AND current_stock > 0) AS low_stock_count,
  (SELECT COUNT(*) FROM glass_items WHERE current_stock <= 0) AS out_of_stock_count;

-- ── Function: record_stock_transaction ──
CREATE OR REPLACE FUNCTION record_stock_transaction(
  p_glass_item_id integer,
  p_type text,
  p_quantity numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  INSERT INTO stock_transactions (glass_item_id, type, quantity, reference, notes, performed_by)
  VALUES (p_glass_item_id, p_type, p_quantity, p_reference, p_notes, p_performed_by);
  IF p_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock + p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock - p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  END IF;
END;
$$;

-- ── Seed: brands ──
INSERT INTO brands (name)
SELECT * FROM (VALUES
  ('AIS'),
  ('Saint-Gobain'),
  ('Modi Guard'),
  ('Gold Plus'),
  ('Asahi India')
) AS t(name)
WHERE NOT EXISTS (SELECT 1 FROM brands);

-- ── Seed: suppliers ──
INSERT INTO suppliers (name, contact, phone, email, address)
SELECT * FROM (VALUES
  ('Madhav Glass Works', 'Yashmeet', '9876543210', 'yashmeetgondaliya004@gmail.com', 'Rajkot, Gujarat'),
  ('Crystal Glass Traders', 'Rajesh', '9123456789', 'rajesh@crystalglass.com', 'Ahmedabad, Gujarat'),
  ('Shree Balaji Glass', 'Amit', '9988776655', 'amit@balagiglass.com', 'Surat, Gujarat')
) AS t(name, contact, phone, email, address)
WHERE NOT EXISTS (SELECT 1 FROM suppliers);

-- ── Seed: glass_items ──
INSERT INTO glass_items (brand_id, size, thickness_mm, glass_type, current_stock, min_stock, supplier_id)
SELECT b.id, t.size, t.thickness_mm, t.glass_type, t.current_stock, t.min_stock, t.supplier_id
FROM (VALUES
  ('AIS', '6x4 ft', 5, 'Clear', 120, 20, 1),
  ('AIS', '7x5 ft', 6, 'Clear', 45, 20, 1),
  ('AIS', '8x4 ft', 8, 'Tinted', 15, 20, 1),
  ('Saint-Gobain', '6x4 ft', 5, 'Clear', 200, 30, 2),
  ('Saint-Gobain', '7x4 ft', 6, 'Reflective', 0, 15, 2),
  ('Modi Guard', '6x4 ft', 4, 'Clear', 80, 15, 3),
  ('Modi Guard', '8x4 ft', 10, 'Laminated', 25, 10, 3),
  ('Gold Plus', '7x5 ft', 6, 'Frosted', 5, 10, 1),
  ('Asahi India', '6x4 ft', 5, 'Clear', 60, 20, 2),
  ('Asahi India', '9x5 ft', 12, 'Toughened', 10, 5, 2)
) AS t(brand, size, thickness_mm, glass_type, current_stock, min_stock, supplier_id)
JOIN brands b ON b.name = t.brand
WHERE NOT EXISTS (SELECT 1 FROM glass_items);

-- ── Seed: owner member role ──
INSERT INTO member_roles (email, name, role, approved_at)
VALUES ('yashmeetgondaliya004@gmail.com', 'Yashmeet', 'owner', now())
ON CONFLICT (email) DO NOTHING;
