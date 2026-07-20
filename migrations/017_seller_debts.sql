-- Komisi flat per unit untuk produk non-roti (mis. Es Sirsak) — dinamis, admin isi
-- lewat halaman Produk. Produk roti biasa dibiarkan 0/NULL (tidak dapat komisi, dan
-- ikut dihitung ke tier gaji harian; produk ber-komisi > 0 sebaliknya).
ALTER TABLE products ADD COLUMN commission_per_unit NUMERIC(12,2) DEFAULT 0;

-- Utang penjual — dari 2 sumber: kekurangan setoran (dihitung otomatis saat admin
-- simpan Setoran & QRIS) dan pinjaman/kasbon (dicatat manual oleh admin kapan saja).
CREATE TABLE seller_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES sellers(id) NOT NULL,
  branch_id UUID REFERENCES branches(id) NOT NULL,
  source VARCHAR(20) NOT NULL, -- 'kekurangan_setoran' | 'pinjaman'
  debt_date DATE NOT NULL,
  expected_amount NUMERIC(14,2), -- diisi cuma utk source='kekurangan_setoran'
  actual_amount NUMERIC(14,2),   -- diisi cuma utk source='kekurangan_setoran'
  total_amount NUMERIC(14,2) NOT NULL, -- nilai kekurangan ATAU nilai pinjaman
  amount_paid NUMERIC(14,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'belum_lunas', -- 'belum_lunas' | 'lunas'
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Satu baris kekurangan-setoran per penjual per hari (di-upsert tiap kali admin
-- simpan/edit setoran hari itu) — pinjaman boleh berkali-kali per hari, jadi index
-- unique ini sengaja parsial (cuma berlaku utk source='kekurangan_setoran').
CREATE UNIQUE INDEX seller_debts_shortfall_unique ON seller_debts (seller_id, debt_date)
  WHERE source = 'kekurangan_setoran';

CREATE TABLE seller_debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_debt_id UUID REFERENCES seller_debts(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  method VARCHAR(20) NOT NULL, -- 'cash' | 'qris' | 'potongan_gaji'
  payment_date DATE NOT NULL,
  note TEXT,
  payroll_closing_id UUID, -- diisi kalau method='potongan_gaji' — FK ditambahkan di migration 018 setelah tabel seller_payroll_closings ada
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
