-- Riwayat lokasi GPS penjual keliling (dikirim dari app mobile, lihat plan mobile/).
-- Append-only, tidak ada UPDATE — recorded_at (jam GPS diambil di HP) dipisah dari
-- created_at (jam server terima) supaya antrian offline yang di-flush belakangan
-- tetap punya timestamp asli yang benar.
CREATE TABLE seller_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID REFERENCES sellers(id) NOT NULL,
  branch_id UUID REFERENCES branches(id) NOT NULL,
  latitude NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  accuracy NUMERIC(6,2),
  speed NUMERIC(6,2),
  heading NUMERIC(5,1),
  battery_level NUMERIC(4,1),
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_seller_locations_seller_recorded ON seller_locations (seller_id, recorded_at DESC);
CREATE INDEX idx_seller_locations_branch_recorded ON seller_locations (branch_id, recorded_at DESC);
