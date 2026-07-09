CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  name VARCHAR(50) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, name)
);

ALTER TABLE products ADD COLUMN category_id UUID REFERENCES product_categories(id);

-- Backfill: turn each distinct free-text category value into a proper
-- product_categories row, then point existing products at it.
INSERT INTO product_categories (branch_id, name)
SELECT DISTINCT branch_id, category FROM products WHERE category IS NOT NULL
ON CONFLICT (branch_id, name) DO NOTHING;

UPDATE products p
SET category_id = pc.id
FROM product_categories pc
WHERE pc.branch_id = p.branch_id AND pc.name = p.category;

ALTER TABLE products DROP COLUMN category;
