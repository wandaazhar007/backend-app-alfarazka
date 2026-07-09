INSERT INTO roles (name) VALUES
  ('owner'),
  ('admin'),
  ('seller')
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_categories (name) VALUES
  ('uang_makan_penjual'),
  ('bahan_baku'),
  ('gaji'),
  ('sewa'),
  ('listrik_air'),
  ('maintenance'),
  ('lain_lain')
ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (name, address) VALUES
  ('Alfarazka Bakery - Ciputat', 'Ciputat, Tangerang Selatan')
ON CONFLICT DO NOTHING;
