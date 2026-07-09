import pool from '../config/db.js';

export async function logAudit(client, { userId, action, entity, entityId, details }) {
  const runner = client ?? pool;
  await runner.query(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, details) VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entity, entityId, details ? JSON.stringify(details) : null]
  );
}
