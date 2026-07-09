CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  sale_type VARCHAR(20) NOT NULL,       -- 'mobile' | 'store' | 'package'
  seller_id UUID REFERENCES sellers(id),      -- filled in if mobile sale
  customer_id UUID REFERENCES customers(id),  -- filled in if package/subscription
  custom_name VARCHAR(150),             -- e.g. "Aqiqah Package for Mrs. Ani"
  sale_date DATE NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  payment_status VARCHAR(20) DEFAULT 'lunas', -- 'lunas' (paid) | 'dp' (down payment) | 'pending'
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- For mobile sales: sale_items MAY be empty (payments total = total cash settlement is enough).
-- For store sales: per-product detail is required. For packages: optional/summary.
CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id),
  description VARCHAR(150),   -- fallback for custom packages, not a standard product
  qty INT NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL,
  subtotal NUMERIC(14,2) NOT NULL
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
  method VARCHAR(10) NOT NULL, -- 'cash' | 'qris'
  amount NUMERIC(14,2) NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT now(),
  note TEXT
);