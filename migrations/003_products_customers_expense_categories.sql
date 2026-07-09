CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50), -- bread type
  unit_price NUMERIC(12,2) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  customer_type VARCHAR(20) DEFAULT 'individual', -- 'individual' | 'subscription'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL
  -- seed: employee_meal_allowance, raw_materials, salary, rent, electricity_water, maintenance, other
);
