-- Riwayat notifikasi in-app (dibaca lewat ikon lonceng di navbar mobile) — terpisah
-- dari push_tokens/push notification itu sendiri (push cuma sinyal sekali lewat kalau
-- HP sedang online, tabel ini yang jadi sumber kebenaran riwayatnya bisa dilihat lagi
-- kapan saja, termasuk oleh user yang belum/tidak mengaktifkan push).
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  type VARCHAR(50),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
