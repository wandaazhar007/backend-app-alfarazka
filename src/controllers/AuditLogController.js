import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

// Previously, there was a hard-coded `LIMIT 200` without OFFSET/total — older data
// would silently become inaccessible once the audit log exceeded 200 rows. Now it uses
// true pagination; if the `page` query parameter is not provided, it still defaults to
// a limit of 200 (a safe fallback for clients that don't request a specific page).
export const list = async (req, res) => {
  const { entity, user_id: userId } = req.query;
  const pagination = getPagination(req);

  const params = [];
  const conditions = [];

  if (entity) {
    params.push(entity);
    conditions.push(`a.entity = $${params.length}`);
  }
  if (userId) {
    params.push(userId);
    conditions.push(`a.user_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT a.id, a.user_id, u.name AS user_name, a.action, a.entity, a.entity_id, a.details, a.created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${whereClause}
     ORDER BY a.created_at DESC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  } else {
    query += ` LIMIT 200`;
  }

  const { rows } = await pool.query(query, params);

  const mapped = rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id,
    details: row.details,
    createdAt: row.created_at,
  }));

  if (pagination) {
    return res.json({ data: mapped, total: extractTotal(rows), page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(mapped);
};
