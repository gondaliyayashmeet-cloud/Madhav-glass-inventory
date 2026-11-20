/*
# Fix infinite recursion in company_members RLS policies

## Problem
The SELECT policy on `company_members` checks membership by querying `company_members` itself,
which triggers the policy again → infinite recursion.

## Fix
1. Create a SECURITY DEFINER function `is_company_member(user_id, company_id)` that bypasses RLS
   to check membership. Uses search_path = public so it can find the table.
2. Rewrite all policies that referenced `company_members` in a subquery to use this function instead.
*/

-- ── Helper function: check if a user is an approved member of a company ──
CREATE OR REPLACE FUNCTION is_company_member(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_members.user_id = p_user_id
    AND company_members.company_id = p_company_id
    AND company_members.role != 'pending'
  );
$$;

-- ── Rewrite company_members policies ──
DROP POLICY IF EXISTS "select_company_members" ON company_members;
CREATE POLICY "select_company_members" ON company_members FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR is_company_member(auth.uid(), company_members.company_id)
  );

DROP POLICY IF EXISTS "insert_company_members_self" ON company_members;
CREATE POLICY "insert_company_members_self" ON company_members FOR INSERT
  TO authenticated WITH CHECK (
    user_id = auth.uid() AND role = 'pending'
  );

DROP POLICY IF EXISTS "update_company_members" ON company_members;
CREATE POLICY "update_company_members" ON company_members FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), company_members.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), company_members.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "delete_company_members" ON company_members;
CREATE POLICY "delete_company_members" ON company_members FOR DELETE
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM company_members cm2
      WHERE cm2.company_id = company_members.company_id
      AND cm2.user_id = auth.uid()
      AND cm2.role = 'owner'
    )
  );

-- ── Rewrite companies policies ──
DROP POLICY IF EXISTS "select_own_companies" ON companies;
CREATE POLICY "select_own_companies" ON companies FOR SELECT
  TO authenticated USING (
    owner_id = auth.uid()
    OR is_company_member(auth.uid(), companies.id)
  );

-- ── Rewrite categories policies ──
DROP POLICY IF EXISTS "select_categories" ON categories;
CREATE POLICY "select_categories" ON categories FOR SELECT
  TO authenticated USING (
    is_company_member(auth.uid(), categories.company_id)
  );

DROP POLICY IF EXISTS "insert_categories" ON categories;
CREATE POLICY "insert_categories" ON categories FOR INSERT
  TO authenticated WITH CHECK (
    is_company_member(auth.uid(), categories.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_categories" ON categories;
CREATE POLICY "update_categories" ON categories FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), categories.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), categories.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "delete_categories" ON categories;
CREATE POLICY "delete_categories" ON categories FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), categories.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = categories.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Rewrite brands policies ──
DROP POLICY IF EXISTS "select_brands" ON brands;
CREATE POLICY "select_brands" ON brands FOR SELECT
  TO authenticated USING (
    company_id IS NULL OR is_company_member(auth.uid(), brands.company_id)
  );

DROP POLICY IF EXISTS "insert_brands" ON brands;
CREATE POLICY "insert_brands" ON brands FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND is_company_member(auth.uid(), brands.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_brands" ON brands;
CREATE POLICY "update_brands" ON brands FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), brands.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), brands.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = brands.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

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

-- ── Rewrite suppliers policies ──
DROP POLICY IF EXISTS "select_suppliers" ON suppliers;
CREATE POLICY "select_suppliers" ON suppliers FOR SELECT
  TO authenticated USING (
    company_id IS NULL OR is_company_member(auth.uid(), suppliers.company_id)
  );

DROP POLICY IF EXISTS "insert_suppliers" ON suppliers;
CREATE POLICY "insert_suppliers" ON suppliers FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND is_company_member(auth.uid(), suppliers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_suppliers" ON suppliers;
CREATE POLICY "update_suppliers" ON suppliers FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), suppliers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), suppliers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "delete_suppliers" ON suppliers;
CREATE POLICY "delete_suppliers" ON suppliers FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), suppliers.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = suppliers.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- ── Rewrite glass_items policies ──
DROP POLICY IF EXISTS "select_items" ON glass_items;
CREATE POLICY "select_items" ON glass_items FOR SELECT
  TO authenticated USING (
    company_id IS NULL OR is_company_member(auth.uid(), glass_items.company_id)
  );

DROP POLICY IF EXISTS "insert_items" ON glass_items;
CREATE POLICY "insert_items" ON glass_items FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND is_company_member(auth.uid(), glass_items.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_items" ON glass_items;
CREATE POLICY "update_items" ON glass_items FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), glass_items.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), glass_items.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "delete_items" ON glass_items;
CREATE POLICY "delete_items" ON glass_items FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), glass_items.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role = 'owner'
    )
  );

-- ── Rewrite stock_transactions policies ──
DROP POLICY IF EXISTS "select_transactions" ON stock_transactions;
CREATE POLICY "select_transactions" ON stock_transactions FOR SELECT
  TO authenticated USING (
    company_id IS NULL OR is_company_member(auth.uid(), stock_transactions.company_id)
  );

DROP POLICY IF EXISTS "insert_transactions" ON stock_transactions;
CREATE POLICY "insert_transactions" ON stock_transactions FOR INSERT
  TO authenticated WITH CHECK (
    company_id IS NOT NULL
    AND is_company_member(auth.uid(), stock_transactions.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

DROP POLICY IF EXISTS "update_transactions" ON stock_transactions;
CREATE POLICY "update_transactions" ON stock_transactions FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), stock_transactions.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  ) WITH CHECK (
    is_company_member(auth.uid(), stock_transactions.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "delete_transactions" ON stock_transactions;
CREATE POLICY "delete_transactions" ON stock_transactions FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), stock_transactions.company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin')
    )
  );

-- Revoke anon execute on the helper function
REVOKE EXECUTE ON FUNCTION is_company_member(uuid, uuid) FROM anon;
