CREATE TABLE license_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(30) UNIQUE NOT NULL,   -- 'monthly' | 'yearly'
  duration_days INT NOT NULL,          -- 30 | 365
  price NUMERIC(14,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE licenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) UNIQUE NOT NULL, -- One license per organization/main branch
  status VARCHAR(20) NOT NULL DEFAULT 'inactive', -- 'active' | 'expired' | 'inactive'
  current_plan_id INT REFERENCES license_plans(id),
  activated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE license_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id UUID REFERENCES licenses(id) NOT NULL,
  plan_id INT REFERENCES license_plans(id) NOT NULL,
  midtrans_order_id VARCHAR(100) UNIQUE NOT NULL,
  midtrans_transaction_id VARCHAR(100),
  payment_method VARCHAR(30),          -- Populated from the webhook: qris/gopay/bank_transfer/etc.
  amount NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'settlement' | 'expire' | 'cancel' | 'deny'
  paid_at TIMESTAMPTZ,
  raw_notification JSONB,              -- Store the raw webhook payload for auditing
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN is_vendor BOOLEAN DEFAULT false;

-- Seed license plans (placeholder prices, can be updated directly in this table without redeploying)
INSERT INTO license_plans (name, duration_days, price) VALUES
  ('bulanan', 30, 150000),
  ('tahunan', 365, 1500000)
ON CONFLICT (name) DO NOTHING;

-- Create one license record for each existing branch, default status is 'inactive' (not yet paid)
INSERT INTO licenses (branch_id, status)
SELECT id, 'inactive' FROM branches
ON CONFLICT (branch_id) DO NOTHING;