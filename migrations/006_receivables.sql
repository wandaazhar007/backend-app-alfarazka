CREATE TABLE receivables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(id) NOT NULL,
  customer_id UUID REFERENCES customers(id) NOT NULL,
  total_amount NUMERIC(14,2) NOT NULL,
  amount_paid NUMERIC(14,2) DEFAULT 0,
  due_date DATE,
  status VARCHAR(20) DEFAULT 'dp', -- 'dp' | 'lunas'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE receivable_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id UUID REFERENCES receivables(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  method VARCHAR(10) NOT NULL, -- 'cash' | 'qris'
  payment_date DATE NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
