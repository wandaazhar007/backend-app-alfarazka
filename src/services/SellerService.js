import pool from '../config/db.js';
import { extractTotal } from '../utils/pagination.js';
import { provisionFirebaseUser } from './UserService.js';

// Reuses an existing Postgres user by email, or provisions a brand-new
// Firebase account (with a temp password) + users row with role 'seller'.
// Does not touch the role of an already-existing user.
async function ensureUserForSeller({ name, email, phone, branchId }) {
  return provisionFirebaseUser({ name, email, phone, branchId, roleName: 'seller' });
}

// Nama/No. HP penjual disimpan di tabel `users` yang dipakai bareng admin/owner,
// jadi tidak bisa dikasih UNIQUE constraint DB (itu akan salah sasaran, membandingkan
// ke SEMUA role). Uniqueness di sini sengaja di-scope ke sesama penjual saja lewat
// query aplikasi.
//
// Terminal QRIS JUGA dicek di sini (bukan cuma lewat DB UNIQUE constraint di migration
// 016) — kalau cuma mengandalkan constraint, createSeller() akan sempat memprovision
// user + akun Firebase baru (lewat ensureUserForSeller) SEBELUM insert ke `sellers`
// gagal karena constraint itu, jadi nyisa akun yatim. Cek di sini mencegah itu di jalur
// normal; constraint DB tetap dipertahankan sebagai jaring pengaman race condition.
async function checkSellerUniqueness({ name, phone, qrisTerminalId, excludeSellerId }) {
  if (name !== undefined) {
    const params = [name];
    let query = `SELECT 1 FROM sellers s JOIN users u ON u.id = s.user_id WHERE u.name = $1`;
    if (excludeSellerId) {
      params.push(excludeSellerId);
      query += ` AND s.id != $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    if (rows.length > 0) {
      throw Object.assign(new Error('Nama penjual sudah dipakai penjual lain.'), { status: 409 });
    }
  }

  if (phone) {
    const params = [phone];
    let query = `SELECT 1 FROM sellers s JOIN users u ON u.id = s.user_id WHERE u.phone = $1`;
    if (excludeSellerId) {
      params.push(excludeSellerId);
      query += ` AND s.id != $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    if (rows.length > 0) {
      throw Object.assign(new Error('No. HP sudah dipakai penjual lain.'), { status: 409 });
    }
  }

  if (qrisTerminalId) {
    const params = [qrisTerminalId];
    let query = `SELECT 1 FROM sellers s WHERE s.qris_terminal_id = $1`;
    if (excludeSellerId) {
      params.push(excludeSellerId);
      query += ` AND s.id != $${params.length}`;
    }
    const { rows } = await pool.query(query, params);
    if (rows.length > 0) {
      throw Object.assign(new Error('ID Terminal QRIS BCA sudah dipakai penjual lain.'), { status: 409 });
    }
  }
}

export async function listSellers({ role, branchId, pagination }) {
  const params = [];
  let query = `
    SELECT s.id, s.user_id, s.branch_id, s.qris_terminal_id, s.daily_meal_allowance, s.is_active, s.created_at,
           u.name, u.email, u.phone,
           (
             EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.seller_id = s.id)
             OR EXISTS (SELECT 1 FROM sales sa WHERE sa.seller_id = s.id)
             OR EXISTS (SELECT 1 FROM qris_settlements qs WHERE qs.seller_id = s.id)
           ) AS has_usage${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM sellers s
    JOIN users u ON u.id = s.user_id
  `;

  if (role !== 'owner') {
    params.push(branchId);
    query += ` WHERE s.branch_id = $1`;
  }

  // Tabel Kelola Penjual (paginated) tampilkan yang terbaru dulu. Dropdown penjual
  // di halaman lain (ExpensesPage, StockMorningPage — panggil endpoint ini TANPA
  // `page`) tetap alfabetis, lebih gampang dicari manual saat mengetik.
  query += pagination ? ` ORDER BY s.created_at DESC` : ` ORDER BY u.name ASC`;

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
  const { rows: existingUsers } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUsers.length > 0) {
    throw Object.assign(new Error('Email sudah terdaftar.'), { status: 409 });
  }

  await checkSellerUniqueness({ name, phone, qrisTerminalId });

  const { user, tempPassword } = await ensureUserForSeller({ name, email, phone, branchId });

  try {
    const { rows } = await pool.query(
      `INSERT INTO sellers (user_id, branch_id, qris_terminal_id, daily_meal_allowance, is_active)
       VALUES ($1, $2, $3, COALESCE($4, 20000), COALESCE($5, true))
       RETURNING id, user_id, branch_id, qris_terminal_id, daily_meal_allowance, is_active, created_at`,
      [user.id, branchId, qrisTerminalId ?? null, dailyMealAllowance, isActive]
    );

    return {
      seller: mapSeller({ ...rows[0], name: user.name, email: user.email, phone: user.phone, has_usage: false }),
      tempPassword,
    };
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint === 'sellers_qris_terminal_id_key') {
        throw Object.assign(new Error('ID Terminal QRIS BCA sudah dipakai penjual lain.'), { status: 409 });
      }
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

  await checkSellerUniqueness({ name, phone, qrisTerminalId, excludeSellerId: id });

  if (name !== undefined || phone !== undefined) {
    await pool.query(
      `UPDATE users SET name = COALESCE($1, name), phone = COALESCE($2, phone), updated_at = now() WHERE id = $3`,
      [name, phone, seller.user_id]
    );
  }

  try {
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
    const { rows: usageRows } = await pool.query(
      `SELECT
         (EXISTS (SELECT 1 FROM stock_movements WHERE seller_id = $1)
          OR EXISTS (SELECT 1 FROM sales WHERE seller_id = $1)
          OR EXISTS (SELECT 1 FROM qris_settlements WHERE seller_id = $1)) AS has_usage`,
      [id]
    );

    return mapSeller({ ...rows[0], ...userRows[0], has_usage: usageRows[0].has_usage });
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('ID Terminal QRIS BCA sudah dipakai penjual lain.'), { status: 409 });
    }
    throw err;
  }
}

export async function deleteSeller(id, branchId) {
  const { rows: existing } = await pool.query('SELECT id FROM sellers WHERE id = $1 AND branch_id = $2', [id, branchId]);
  if (existing.length === 0) {
    throw Object.assign(new Error('Penjual tidak ditemukan'), { status: 404 });
  }

  // Sengaja HANYA hapus baris `sellers` (profil bisnis: terminal QRIS, uang makan).
  // Baris `users` & akun Firebase-nya TIDAK ikut dihapus — lebih aman (tidak perlu
  // panggil Firebase Admin API, tidak mengorbankan integritas created_by di tabel lain
  // yang mereferensikan users.id).
  try {
    await pool.query('DELETE FROM sellers WHERE id = $1', [id]);
  } catch (err) {
    if (err.code === '23503') {
      throw Object.assign(new Error('Penjual masih punya riwayat transaksi, tidak bisa dihapus.'), { status: 409 });
    }
    throw err;
  }
}

function mapSeller(row) {
  return {
    id: row.id,
    userId: row.user_id,
    branchId: row.branch_id,
    qrisTerminalId: row.qris_terminal_id,
    dailyMealAllowance: Number(row.daily_meal_allowance),
    hasUsage: Boolean(row.has_usage),
    isActive: row.is_active,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    phone: row.phone,
  };
}
