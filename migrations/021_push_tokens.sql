-- Expo push token per user, dipakai kirim notifikasi ke app mobile (mis. Owner
-- diberitahu saat Admin input stok pagi). Satu user = satu token aktif (device
-- terakhir yang login) — cukup upsert, tidak perlu riwayat banyak device sekaligus.
CREATE TABLE push_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  expo_push_token VARCHAR(255) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
