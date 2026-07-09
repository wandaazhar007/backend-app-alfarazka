CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  category_id INT REFERENCES expense_categories(id) NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  description TEXT,
  expense_date DATE NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  closing_date DATE NOT NULL,
  total_sales_cash NUMERIC(14,2) DEFAULT 0,
  total_sales_qris NUMERIC(14,2) DEFAULT 0,
  total_expenses NUMERIC(14,2) DEFAULT 0,
  gross_profit NUMERIC(14,2) DEFAULT 0, -- total sales - total expenses
  total_bread_sold INT DEFAULT 0,
  total_bread_returned INT DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, closing_date)
);
