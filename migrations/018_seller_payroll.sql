-- Gaji bulanan penjual keliling: akumulasi gaji tier harian (dari qty roti terjual)
-- + komisi harian (dari qty produk ber-commission_per_unit terjual), dikurangi utang
-- yang dipotong saat itu. Mirip pola daily_closings, tapi bulanan & per-penjual —
-- draft dulu (preview), baru "paid" setelah admin konfirmasi bayar.
CREATE TABLE seller_payroll_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES sellers(id) NOT NULL,
  branch_id UUID REFERENCES branches(id) NOT NULL,
  period_month DATE NOT NULL, -- selalu tanggal 1 di bulan itu, mis. '2026-07-01'
  total_tier_salary NUMERIC(14,2) NOT NULL,
  total_commission NUMERIC(14,2) NOT NULL,
  total_debt_deduction NUMERIC(14,2) DEFAULT 0,
  net_payout NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft', -- 'draft' | 'paid'
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(seller_id, period_month)
);

ALTER TABLE seller_debt_payments
  ADD CONSTRAINT seller_debt_payments_payroll_closing_fkey
  FOREIGN KEY (payroll_closing_id) REFERENCES seller_payroll_closings(id);
