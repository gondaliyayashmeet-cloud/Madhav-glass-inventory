DROP VIEW glass_inventory_list;

CREATE VIEW glass_inventory_list AS
SELECT
  gi.id,
  gi.company_id,
  gi.brand_id,
  b.name AS brand,
  gi.size,
  gi.thickness_mm,
  gi.color,
  gi.glass_type,
  gi.sku,
  gi.unit,
  gi.category_id,
  c.name AS category_name,
  gi.current_stock,
  gi.min_stock,
  CASE
    WHEN gi.current_stock <= 0 THEN 'Out of Stock'
    WHEN gi.current_stock <= gi.min_stock THEN 'Low Stock'
    ELSE 'In Stock'
  END AS stock_status,
  gi.supplier_id,
  s.name AS supplier,
  gi.created_at,
  gi.updated_at
FROM glass_items gi
  JOIN brands b ON b.id = gi.brand_id
  LEFT JOIN categories c ON c.id = gi.category_id
  LEFT JOIN suppliers s ON s.id = gi.supplier_id;
