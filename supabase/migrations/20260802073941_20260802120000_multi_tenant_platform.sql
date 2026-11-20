/*
# Multi-tenant platform: companies, memberships, generic inventory

## Overview
Transforms the single-tenant glass inventory into a multi-tenant platform where:
- Any user can create a company (becomes its owner)
- Other users join a company via invite code (QR or link)
- Each company has its own inventory, brands, suppliers, categories, and members
- A user can belong to multiple companies simultaneously
- Inventory is material-agnostic (glass, plastic, liquids, aluminum, etc.)
- The app name changes from "Madhav Glass" to "StockHub"

## New Tables
1. `companies` — each company/workspace
2. `company_members` — membership join table (user ↔ company ↔ role)
3. `categories` — material/product categories per company

## Modified Tables
- `brands`: added `company_id` column
- `suppliers`: added `company_id` column
- `glass_items`: added `company_id`, `category_id` columns; thickness_mm and glass_type now nullable
- `stock_transactions`: added `company_id` column

## Security (RLS)
- All new tables have RLS enabled with company-membership-based policies
- Existing tables' policies updated from anon/public to authenticated + company-scoped

## Important Notes
1. A default company "Madhav Glass" is created; existing data migrated to it
2. The existing owner becomes the owner of the default company
3. A default "Glass" category is created for the default company
4. invite_code is a unique 6-character code per company
5. Transaction functions updated to handle company_id
*/

-- ── Companies (must exist before policies that reference company_members) ──
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code text UNIQUE NOT NULL DEFAULT upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 6)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- ── Company Members ──
CREATE TABLE IF NOT EXISTS company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'pending' CHECK (role IN ('owner','admin','stock_keeper','viewer','pending')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;

-- ── Categories ──
CREATE TABLE IF NOT EXISTS categories (
  id serial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- ── Add company_id to existing tables ──
ALTER TABLE brands ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE glass_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE glass_items ADD COLUMN IF NOT EXISTS category_id integer REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- Make glass-specific fields nullable for non-glass materials
ALTER TABLE glass_items ALTER COLUMN thickness_mm DROP NOT NULL;
ALTER TABLE glass_items ALTER COLUMN glass_type DROP NOT NULL;
ALTER TABLE glass_items ALTER COLUMN glass_type SET DEFAULT NULL;

-- ── Now add RLS policies ──

-- Companies
DROP POLICY IF EXISTS "select_own_companies" ON companies;
CREATE POLICY "select_own_companies" ON companies FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = companies.id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

DROP POLICY IF EXISTS "insert_own_companies" ON companies;
CREATE POLICY "insert_own_companies" ON companies FOR INSERT
  TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "update_own_companies" ON companies;
CREATE POLICY "update_own_companies" ON companies FOR UPDATE
  TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_companies" ON companies;
CREATE POLICY "delete_own_companies" ON companies FOR DELETE
  TO authenticated USING (owner_id = auth.uid());

-- Company Members
DROP POLICY IF EXISTS "select_company_members" ON company_members;
CREATE POLICY "select_company_members" ON company_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role != 'pending'
    )
  );

DROP POLICY IF EXISTS "insert_company_members_self" ON company_members;
CREATE POLICY "insert_company_members_self" ON company_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() AND role = 'pending'
  );

DROP POLICY IF EXISTS "update_company_members" ON company_members;
CREATE POLICY "update_company_members" ON company_members FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "delete_company_members" ON company_members;
CREATE POLICY "delete_company_members" ON company_members FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role = 'owner'
    )
    OR user_id = auth.uid()
  );

-- Categories
DROP POLICY IF EXISTS "select_categories" ON categories;
CREATE POLICY "select_categories" ON categories FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

DROP POLICY IF EXISTS "insert_categories" ON categories;
CREATE POLICY "insert_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_categories" ON categories;
CREATE POLICY "update_categories" ON categories FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "delete_categories" ON categories;
CREATE POLICY "delete_categories" ON categories FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Update brands RLS to company-scoped ──
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_brands" ON brands;
DROP POLICY IF EXISTS "anon_insert_brands" ON brands;
DROP POLICY IF EXISTS "anon_update_brands" ON brands;
DROP POLICY IF EXISTS "anon_delete_brands" ON brands;

CREATE POLICY "select_brands" ON brands FOR SELECT
  TO authenticated USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

CREATE POLICY "insert_brands" ON brands FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "update_brands" ON brands FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "delete_brands" ON brands FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Update suppliers RLS to company-scoped ──
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;

CREATE POLICY "select_suppliers" ON suppliers FOR SELECT
  TO authenticated USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

CREATE POLICY "insert_suppliers" ON suppliers FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "update_suppliers" ON suppliers FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "delete_suppliers" ON suppliers FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Update glass_items RLS to company-scoped ──
ALTER TABLE glass_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_glass_items" ON glass_items;
DROP POLICY IF EXISTS "anon_insert_glass_items" ON glass_items;
DROP POLICY IF EXISTS "anon_update_glass_items" ON glass_items;
DROP POLICY IF EXISTS "anon_delete_glass_items" ON glass_items;

CREATE POLICY "select_items" ON glass_items FOR SELECT
  TO authenticated USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

CREATE POLICY "insert_items" ON glass_items FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "update_items" ON glass_items FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "delete_items" ON glass_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role = 'owner'
    )
  );

-- ── Update stock_transactions RLS to company-scoped ──
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stock_transactions" ON stock_transactions;
DROP POLICY IF EXISTS "anon_insert_stock_transactions" ON stock_transactions;
DROP POLICY IF EXISTS "anon_update_stock_transactions" ON stock_transactions;
DROP POLICY IF EXISTS "anon_delete_stock_transactions" ON stock_transactions;

CREATE POLICY "select_transactions" ON stock_transactions FOR SELECT
  TO authenticated USING (
    company_id IS NULL
    OR EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role != 'pending'
    )
  );

CREATE POLICY "insert_transactions" ON stock_transactions FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

CREATE POLICY "update_transactions" ON stock_transactions FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "delete_transactions" ON stock_transactions FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_company_members_company_id ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user_id ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_company_id ON categories(company_id);
CREATE INDEX IF NOT EXISTS idx_brands_company_id ON brands(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company_id ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_glass_items_company_id ON glass_items(company_id);
CREATE INDEX IF NOT EXISTS idx_glass_items_category_id ON glass_items(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_company_id ON stock_transactions(company_id);

-- ── Migrate existing data into a default company ──
DO $$
DECLARE
  v_company_id uuid;
  v_category_id integer;
  v_owner_id uuid;
BEGIN
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'yashmeetgondaliya004@gmail.com' LIMIT 1;

  SELECT id INTO v_company_id FROM companies WHERE name = 'Madhav Glass' LIMIT 1;
  IF v_company_id IS NULL THEN
    INSERT INTO companies (name, description, owner_id, invite_code)
    VALUES ('Madhav Glass', 'Default migrated company', v_owner_id, 'MADHAV')
    ON CONFLICT (invite_code) DO NOTHING
    RETURNING id INTO v_company_id;

    IF v_company_id IS NULL THEN
      SELECT id INTO v_company_id FROM companies WHERE invite_code = 'MADHAV' LIMIT 1;
    END IF;
  END IF;

  IF v_company_id IS NOT NULL THEN
    INSERT INTO categories (company_id, name, unit)
    VALUES (v_company_id, 'Glass', 'sq ft')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_category_id;

    IF v_category_id IS NULL THEN
      SELECT id INTO v_category_id FROM categories WHERE company_id = v_company_id AND name = 'Glass' LIMIT 1;
    END IF;

    IF v_owner_id IS NOT NULL THEN
      INSERT INTO company_members (company_id, user_id, role, approved_at)
      VALUES (v_company_id, v_owner_id, 'owner', now())
      ON CONFLICT (company_id, user_id) DO NOTHING;
    END IF;

    UPDATE brands SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE suppliers SET company_id = v_company_id WHERE company_id IS NULL;
    UPDATE glass_items SET company_id = v_company_id, category_id = v_category_id WHERE company_id IS NULL;
    UPDATE stock_transactions SET company_id = v_company_id WHERE company_id IS NULL;
  END IF;
END $$;

-- ── Updated views (company-scoped) ──
DROP VIEW IF EXISTS glass_inventory_list;
CREATE OR REPLACE VIEW glass_inventory_list AS
SELECT
  gi.id,
  gi.company_id,
  gi.brand_id,
  b.name AS brand,
  gi.size,
  gi.thickness_mm,
  gi.glass_type,
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

DROP VIEW IF EXISTS glass_dashboard;
CREATE OR REPLACE VIEW glass_dashboard AS
SELECT
  gi.company_id,
  COUNT(*) AS total_items,
  COALESCE(SUM(gi.current_stock), 0) AS total_stock,
  COUNT(*) FILTER (WHERE gi.current_stock <= gi.min_stock AND gi.current_stock > 0) AS low_stock_count,
  COUNT(*) FILTER (WHERE gi.current_stock <= 0) AS out_of_stock_count
FROM glass_items gi
GROUP BY gi.company_id;

-- ── Updated record_stock_transaction function (with company_id) ──
CREATE OR REPLACE FUNCTION record_stock_transaction(
  p_glass_item_id integer,
  p_type text,
  p_quantity numeric,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
  INSERT INTO stock_transactions (glass_item_id, type, quantity, reference, notes, performed_by, company_id)
  VALUES (p_glass_item_id, p_type, p_quantity, p_reference, p_notes, p_performed_by, COALESCE(p_company_id, v_company_id));

  IF p_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock + p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock - p_quantity, updated_at = now() WHERE id = p_glass_item_id;
  END IF;
END;
$$;

-- ── Updated update_stock_transaction function ──
CREATE OR REPLACE FUNCTION update_stock_transaction(
  p_id integer,
  p_glass_item_id integer DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
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
      performed_by = p_performed_by
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
