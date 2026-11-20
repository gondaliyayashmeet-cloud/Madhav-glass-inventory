/*
# Add edit and delete functions for stock transactions

1. New Functions
- `update_stock_transaction` — reverses the stock effect of an existing transaction, validates the new values, updates the transaction row, and applies the new stock effect. All atomically.
- `delete_stock_transaction` — reverses the stock effect of an existing transaction and deletes the row. All atomically.

2. Security
- Both functions are SECURITY DEFINER so they can modify glass_items.current_stock and the stock_transactions row in a single atomic operation.
- RLS policies on stock_transactions already allow anon/authenticated UPDATE and DELETE, but direct row updates would not adjust glass_items.current_stock — these functions ensure stock stays consistent.

3. Important Notes
- Editing a transaction: the old quantity is reversed first (if old type was 'in', subtract old qty; if 'out', add old qty back). Then the new values are validated (enough stock for 'out'?). Then the row is updated and new stock effect applied.
- Deleting a transaction: the old quantity is reversed (same logic) and the row is removed.
- Both functions raise an exception if the transaction row does not exist.
*/

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

  -- Reverse old transaction's stock effect
  IF v_old_rec.type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock - v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock + v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  END IF;

  -- Validate new 'out' has enough stock (after reversal)
  IF v_new_type = 'out' THEN
    SELECT current_stock INTO v_reversed_stock FROM glass_items WHERE id = v_new_item_id;
    IF v_reversed_stock IS NULL THEN
      RAISE EXCEPTION 'Glass item % not found', v_new_item_id;
    END IF;
    IF v_reversed_stock < v_new_qty THEN
      RAISE EXCEPTION 'Not enough stock for item % (have %)', v_new_item_id, v_reversed_stock;
    END IF;
  END IF;

  -- Update the transaction row
  UPDATE stock_transactions
  SET glass_item_id = v_new_item_id,
      type = v_new_type,
      quantity = v_new_qty,
      reference = p_reference,
      notes = p_notes,
      performed_by = p_performed_by
  WHERE id = p_id;

  -- Apply new stock effect
  IF v_new_type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock + v_new_qty, updated_at = now()
    WHERE id = v_new_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock - v_new_qty, updated_at = now()
    WHERE id = v_new_item_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION delete_stock_transaction(p_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_rec record;
BEGIN
  SELECT glass_item_id, type, quantity INTO v_old_rec
  FROM stock_transactions WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction % not found', p_id;
  END IF;

  -- Reverse the stock effect
  IF v_old_rec.type = 'in' THEN
    UPDATE glass_items SET current_stock = current_stock - v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  ELSE
    UPDATE glass_items SET current_stock = current_stock + v_old_rec.quantity, updated_at = now()
    WHERE id = v_old_rec.glass_item_id;
  END IF;

  DELETE FROM stock_transactions WHERE id = p_id;
END;
$$;
