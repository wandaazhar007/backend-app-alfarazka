-- Kolom opsional untuk menandai pengeluaran "Uang Makan Penjual" milik penjual
-- tertentu — dipakai supaya satu penjual tidak bisa diinput uang makan dua kali
-- di tanggal yang sama (dicek di kode, ditegakkan di DB lewat unique index di bawah).
-- NULL untuk kategori pengeluaran lain (Bahan Baku, Gaji, dll — tidak per-penjual).
ALTER TABLE expenses ADD COLUMN seller_id UUID REFERENCES sellers(id);

CREATE UNIQUE INDEX expenses_seller_meal_unique ON expenses (seller_id, expense_date)
  WHERE seller_id IS NOT NULL;
