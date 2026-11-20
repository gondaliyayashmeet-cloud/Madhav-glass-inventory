/*
# Fix security issues: views bypassing RLS and functions with mutable search path

## Changes
1. Recreate `glass_inventory_list` view as SECURITY INVOKER (was SECURITY DEFINER, bypassing RLS)
2. Recreate `glass_dashboard` view as SECURITY INVOKER
3. Set `search_path = '' on all SECURITY DEFINER functions to prevent search path injection
4. member_roles table: it's intentionally service-role only (no policies), this is by design

## Security
- Views now respect the querying user's RLS policies instead of the view owner's
- Functions are hardened against search path injection
*/

-- ── Fix views: recreate as SECURITY INVOKER ──
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
CREATE VIEW glass_dashboard WITH (security_invoker = true) AS
SELECT
  gi.company_id,
  COUNT(*) AS total_items,
  COALESCE(SUM(gi.current_stock), 0) AS total_stock,
  COUNT(*) FILTER (WHERE gi.current_stock <= gi.min_stock AND gi.current_stock > 0) AS low_stock_count,
  COUNT(*) FILTER (WHERE gi.current_stock <= 0) AS out_of_stock_count
FROM glass_items gi
GROUP BY gi.company_id;

-- ── Fix functions: set search_path = '' ──
ALTER FUNCTION record_stock_transaction(integer, text, numeric, text, text, text, uuid) SET search_path = '';
ALTER FUNCTION update_stock_transaction(integer, integer, text, numeric, text, text, text) SET search_path = '';
ALTER FUNCTION delete_stock_transaction(integer) SET search_path = '';
