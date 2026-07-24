import pool from '../config/db.js';

export async function createForUsers(userIds, { title, body, type }) {
  if (userIds.length === 0) return;

  const values = [];
  const placeholders = userIds.map((userId, i) => {
    const base = i * 4;
    values.push(userId, title, body, type ?? null);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
  });

  await pool.query(
    `INSERT INTO notifications (user_id, title, body, type) VALUES ${placeholders.join(', ')}`,
    values
  );
}

export async function listForUser(userId, limit = 50) {
  const { rows } = await pool.query(
    `SELECT id, title, body, type, read_at, created_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return rows.map(mapNotification);
}

export async function getUnreadCount(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return Number(rows[0].count);
}

export async function markAsRead(id, userId) {
  const { rows } = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING *`,
    [id, userId]
  );
  return rows[0] ? mapNotification(rows[0]) : null;
}

export async function markAllAsRead(userId) {
  await pool.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
}

function mapNotification(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type,
    read: row.read_at !== null,
    createdAt: row.created_at,
  };
}
