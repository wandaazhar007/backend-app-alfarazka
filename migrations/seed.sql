INSERT INTO roles (name) VALUES
  ('owner'),
  ('admin'),
  ('seller')
ON CONFLICT (name) DO NOTHING;

-- Nama harus persis sama dengan MEAL_ALLOWANCE_CATEGORY (ExpenseController.js/ExpensesPage.tsx)
-- dan COGS_EXPENSE_CATEGORY (DailyClosingService.js/ExpensesPage.tsx) — dua baris pertama ini
-- dirujuk oleh nama secara langsung di kode, bukan sekadar data dekoratif.
INSERT INTO expense_categories (name) VALUES
  ('Uang Makan Penjual'),
  ('Bahan Baku'),
  ('Gaji'),
  ('Sewa'),
  ('Listrik & Air'),
  ('Maintenance'),
  ('Lain-lain')
ON CONFLICT (name) DO NOTHING;

INSERT INTO branches (name, address) VALUES
  ('Alfarazka Bakery - Ciputat', 'Ciputat, Tangerang Selatan')
ON CONFLICT DO NOTHING;
