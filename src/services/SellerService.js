import pool from '../config/db.js';
import { extractTotal } from '../utils/pagination.js';
import { provisionFirebaseUser } from './UserService.js';

// Reuses an existing Postgres user by email, or provisions a brand-new
// Firebase account (with a temp password) + users row with role 'seller'.
// Does not touch the role of an already-existing user.
async function ensureUserForSeller({ name, email, phone, branchId }) {
  return provisionFirebaseUser({ name, email, phone, branchId, roleName: 'seller' });
}

export async function listSellers({ role, branchId, pagination }) {
  const params = [];
  let query = `
    SELECT s.id, s.user_id, s.branch_id, s.qris_terminal_id, s.daily_meal_allowance, s.is_active, s.created_at,
           u.name, u.email, u.phone${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM sellers s
    JOIN users u ON u.id = s.user_id
  `;

  if (role !== 'owner') {
    params.push(branchId);
    query += ` WHERE s.branch_id = $1`;
  }

  query += ` ORDER BY u.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return { data: rows.map(mapSeller), total: extractTotal(rows) };
  }
  return rows.map(mapSeller);
}

export async function createSeller({ name, email, phone, qrisTerminalId, dailyMealAllowance, isActive, branchId }) {
  const { user, tempPassword } = await ensureUserForSeller({ name, email, phone, branchId });

  try {
    const { rows } = await pool.query(
      `INSERT INTO sellers (user_id, branch_id, qris_terminal_id, daily_meal_allowance, is_active)
       VALUES ($1, $2, $3, COALESCE($4, 20000), COALESCE($5, true))
       RETURNING id, user_id, branch_id, qris_terminal_id, daily_meal_allowance, is_active, created_at`,
      [user.id, branchId, qrisTerminalId ?? null, dailyMealAllowance, isActive]
    );

    return {
      seller: mapSeller({ ...rows[0], name: user.name, email: user.email, phone: user.phone }),
      tempPassword,
    };
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('User ini sudah terdaftar sebagai penjual lain.'), { status: 409 });
    }
    throw err;
  }
}

export async function updateSeller(id, { name, phone, qrisTerminalId, dailyMealAllowance, isActive }) {
  const { rows: sellerRows } = await pool.query('SELECT * FROM sellers WHERE id = $1', [id]);
  if (sellerRows.length === 0) {
    return null;
  }

  const seller = sellerRows[0];

  if (name !== undefined || phone !== undefined) {
    await pool.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = now() WHERE id = $3`,
      [name, phone, seller.user_id]
    );
  }

  const { rows } = await pool.query(
    `UPDATE sellers SET
       qris_terminal_id = COALESCE($1, qris_terminal_id),
       daily_meal_allowance = COALESCE($2, daily_meal_allowance),
       is_active = COALESCE($3, is_active)
     WHERE id = $4
     RETURNING id, user_id, branch_id, qris_terminal_id, daily_meal_allowance, is_active, created_at`,
    [qrisTerminalId, dailyMealAllowance, isActive, id]
  );

  const { rows: userRows } = await pool.query('SELECT name, email, phone FROM users WHERE id = $1', [seller.user_id]);

  return mapSeller({ ...rows[0], ...userRows[0] });
}

function mapSeller(row) {
  return {
    id: row.id,
    userId: row.user_id,
    branchId: row.branch_id,
    qrisTerminalId: row.qris_terminal_id,
    dailyMealAllowance: Number(row.daily_meal_allowance),
    isActive: row.is_active,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}
