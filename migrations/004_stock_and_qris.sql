CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  seller_id UUID REFERENCES sellers(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  movement_date DATE NOT NULL,
  qty_out INT NOT NULL DEFAULT 0,      -- taken out in the morning
  qty_returned INT DEFAULT 0,          -- evening return (filled in at settlement)
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- QRIS settlement per terminal (per seller), entered by admin from the BCA Merchant report
CREATE TABLE qris_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  seller_id UUID REFERENCES sellers(id) NOT NULL,
  settlement_date DATE NOT NULL,
  terminal_id VARCHAR(50),           -- copy of qris_terminal_id at that time, for history/audit
  amount NUMERIC(14,2) NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id, settlement_date)
);