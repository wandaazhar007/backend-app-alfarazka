CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firebase_uid VARCHAR(128) UNIQUE NOT NULL,
  branch_id UUID REFERENCES branches(id),
  role_id INT REFERENCES roles(id) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Additional profile info specific to traveling/mobile sellers
CREATE TABLE sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) UNIQUE NOT NULL,
  branch_id UUID REFERENCES branches(id) NOT NULL,
  qris_terminal_id VARCHAR(50), -- ID/code of the BCA QRIS terminal assigned to this seller
  daily_meal_allowance NUMERIC(12,2) DEFAULT 20000,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
