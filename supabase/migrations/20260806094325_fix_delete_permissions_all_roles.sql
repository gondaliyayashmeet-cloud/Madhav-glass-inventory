/*
# Fix delete permissions for stock keepers and admins

## Problem
1. `glass_items` DELETE policy only allows `owner` — admin and stock_keeper cannot delete inventory items.
2. `stock_transactions` DELETE policy allows `owner, admin` — stock_keeper cannot delete transactions.
3. `glass_items` UPDATE policy allows `owner, admin` but NOT `stock_keeper` — so stock_keeper can't adjust stock.
4. `delete_stock_transaction` and `update_stock_transaction` RPCs don't verify the caller is authorized.

## Changes
1. `glass_items` DELETE: allow `owner, admin, stock_keeper`
2. `stock_transactions` DELETE: allow `owner, admin, stock_keeper`
3. `glass_items` UPDATE: add `stock_keeper` role
4. Both RPCs: add authorization check — caller must be owner/admin/stock_keeper of the transaction's company
*/

-- ── 1. Fix glass_items DELETE policy ──
DROP POLICY IF EXISTS "delete_items" ON glass_items;
CREATE POLICY "delete_items" ON glass_items FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

-- ── 2. Fix stock_transactions DELETE policy ──
DROP POLICY IF EXISTS "delete_transactions" ON stock_transactions;
CREATE POLICY "delete_transactions" ON stock_transactions FOR DELETE
  TO authenticated USING (
    is_company_member(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = stock_transactions.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

-- ── 3. Fix glass_items UPDATE policy to include stock_keeper ──
DROP POLICY IF EXISTS "update_items" ON glass_items;
CREATE POLICY "update_items" ON glass_items FOR UPDATE
  TO authenticated USING (
    is_company_member(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  )
  WITH CHECK (
    is_company_member(auth.uid(), company_id)
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = glass_items.company_id
      AND company_members.user_id = auth.uid()
      AND company_members.role IN ('owner', 'admin', 'stock_keeper')
    )
  );

-- ── 4. Add authorization check to delete_stock_transaction ──
CREATE OR REPLACE FUNCTION delete_stock_transaction(p_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_glass_item_id integer;
  v_old_type text;
  v_old_qty numeric;
  v_company_id uuid;
  v_user_role text;
BEGIN
  SELECT glass_item_id, type, quantity, company_id
  INTO v_old_glass_item_id, v_old_type, v_old_qty, v_company_id
  FROM stock_transactions WHERE id = p_id;

  IF v_old_glass_item_id IS NULL THEN
    RAISE EXCEPTION 'Transaction % not found', p_id;
  END IF;

  SELECT role INTO v_user_role FROM company_members
  WHERE company_id = v_company_id AND user_id = auth.uid();

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this company';
  END IF;

  IF v_user_role NOT IN ('owner', 'admin', 'stock_keeper') THEN
    RAISE EXCEPTION 'Only owners, admins, and stock keepers can delete transactions';
  END IF;

  IF v_old_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock - v_old_qty, updated_at = now()
    WHERE id = v_old_glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock + v_old_qty, updated_at = now()
    WHERE id = v_old_glass_item_id;
  END IF;

  DELETE FROM stock_transactions WHERE id = p_id;
END;
$$;

-- ── 5. Add authorization check to update_stock_transaction ──
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
  v_old_glass_item_id integer;
  v_old_type text;
  v_old_qty numeric;
  v_company_id uuid;
  v_user_role text;
  v_new_item_id integer;
  v_new_type text;
  v_new_qty numeric;
  v_reversed_stock numeric;
BEGIN
  SELECT glass_item_id, type, quantity, company_id
  INTO v_old_glass_item_id, v_old_type, v_old_qty, v_company_id
  FROM stock_transactions WHERE id = p_id;

  IF v_old_glass_item_id IS NULL THEN
    RAISE EXCEPTION 'Transaction % not found', p_id;
  END IF;

  SELECT role INTO v_user_role FROM company_members
  WHERE company_id = v_company_id AND user_id = auth.uid();

  IF v_user_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this company';
  END IF;

  IF v_user_role NOT IN ('owner', 'admin', 'stock_keeper') THEN
    RAISE EXCEPTION 'Only owners, admins, and stock keepers can edit transactions';
  END IF;

  v_new_item_id := COALESCE(p_glass_item_id, v_old_glass_item_id);
  v_new_type := COALESCE(p_type, v_old_type);
  v_new_qty := COALESCE(p_quantity, v_old_qty);

  IF v_new_type NOT IN ('in','out') THEN
    RAISE EXCEPTION 'type must be in or out';
  END IF;
  IF v_new_qty <= 0 THEN
    RAISE EXCEPTION 'quantity must be positive';
  END IF;

  IF v_old_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock - v_old_qty, updated_at = now()
    WHERE id = v_old_glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock + v_old_qty, updated_at = now()
    WHERE id = v_old_glass_item_id;
  END IF;

  IF v_new_type = 'out' THEN
    SELECT current_stock INTO v_reversed_stock FROM glass_items WHERE id = v_new_item_id;
    IF v_reversed_stock IS NULL THEN
      RAISE EXCEPTION 'Glass item % not found', v_new_item_id;
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

REVOKE EXECUTE ON FUNCTION delete_stock_transaction(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION update_stock_transaction(integer, integer, text, numeric, text, text, text) FROM anon;
