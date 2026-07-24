import pool from '../config/db.js';
import * as NotificationService from './NotificationService.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function saveToken({ userId, expoPushToken }) {
  await pool.query(
    `INSERT INTO push_tokens (user_id, expo_push_token, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET expo_push_token = $2, updated_at = now()`,
    [userId, expoPushToken]
  );
}

// LEFT JOIN (bukan INNER) — user yang belum/tidak aktifkan push tetap harus dapat
// baris di notifications (riwayat in-app), cuma tidak ikut dikirimi push beneran.
async function getUsersForRole(role, branchId) {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, pt.expo_push_token
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN push_tokens pt ON pt.user_id = u.id
     WHERE r.name = $1 AND u.branch_id = $2`,
    [role, branchId]
  );
  return rows;
}

// Gagal kirim push (device offline, token expired, dll) TIDAK BOLEH menggagalkan
// aksi utama yang memicunya (mis. input stok pagi) — jadi selalu ditelan di sini,
// bukan dilempar ke pemanggil. Riwayat notifications tetap tersimpan lepas dari
// berhasil/gagalnya pengiriman push itu sendiri.
export async function notifyRole(role, branchId, { title, body, data }) {
  const users = await getUsersForRole(role, branchId);
  if (users.length === 0) return;

  await NotificationService.createForUsers(
    users.map((u) => u.user_id),
    { title, body, type: data?.type }
  );

  const tokens = users.map((u) => u.expo_push_token).filter(Boolean);
  if (tokens.length === 0) return;

  try {
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body, data }))),
    });
  } catch {
    // best-effort, lihat komentar di atas
  }
}
