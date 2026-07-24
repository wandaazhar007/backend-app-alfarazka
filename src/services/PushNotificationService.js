import pool from '../config/db.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function saveToken({ userId, expoPushToken }) {
  await pool.query(
    `INSERT INTO push_tokens (user_id, expo_push_token, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET expo_push_token = $2, updated_at = now()`,
    [userId, expoPushToken]
  );
}

async function getTokensForRole(role, branchId) {
  const { rows } = await pool.query(
    `SELECT pt.expo_push_token
     FROM push_tokens pt
     JOIN users u ON u.id = pt.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = $1 AND u.branch_id = $2`,
    [role, branchId]
  );
  return rows.map((r) => r.expo_push_token);
}

// Gagal kirim push (device offline, token expired, dll) TIDAK BOLEH menggagalkan
// aksi utama yang memicunya (mis. input stok pagi) — jadi selalu ditelan di sini,
// bukan dilempar ke pemanggil.
export async function notifyRole(role, branchId, { title, body, data }) {
  const tokens = await getTokensForRole(role, branchId);
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
