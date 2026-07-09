import pool from '../config/db.js';
import firebaseAuth from '../config/firebaseAdmin.js';
import generatePassword from '../utils/generatePassword.js';
import { extractTotal } from '../utils/pagination.js';

// Reuses an existing Postgres user by email, or provisions a brand-new
// Firebase account (with a temp password) + users row with the given role.
// Does not touch the role of an already-existing user. Dipakai bareng oleh
// createAdmin() di sini dan SellerService.createSeller() (bukan duplikasi).
export async function provisionFirebaseUser({ name, email, phone, branchId, roleName }) {
  const { rows: existing } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (existing.length > 0) {
    return { user: existing[0], tempPassword: null };
  }

  const tempPassword = generatePassword();
  let firebaseUid;

  try {
    const fbUser = await firebaseAuth.createUser({ email, password: tempPassword, displayName: name });
    firebaseUid = fbUser.uid;
  } catch (err) {
    if (err.code === 'auth/email-already-exists') {
      const fbUser = await firebaseAuth.getUserByEmail(email);
      firebaseUid = fbUser.uid;
    } else {
      throw err;
    }
  }

  const { rows: roleRows } = await pool.query(`SELECT id FROM roles WHERE name = $1`, [roleName]);
  if (roleRows.length === 0) {
    throw Object.assign(new Error(`Role '${roleName}' belum ada, jalankan seed.sql`), { status: 500 });
  }

  // must_change_password = true: this new account is assigned a system-generated
  // temporary password (tempPassword above) and must change it on the first login.
  const { rows: inserted } = await pool.query(
    `INSERT INTO users (firebase_uid, branch_id, role_id, name, email, phone, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, true)
     RETURNING *`,
    [firebaseUid, branchId, roleRows[0].id, name, email, phone ?? null]
  );

  return { user: inserted[0], tempPassword };
}

export async function createAdmin({ name, email, phone, branchId }) {
  try {
    const { user, tempPassword } = await provisionFirebaseUser({ name, email, phone, branchId, roleName: 'admin' });
    return { user: mapUser(user, 'admin'), tempPassword };
  } catch (err) {
    if (err.code === '23505') {
      throw Object.assign(new Error('Email ini sudah terdaftar sebagai user lain.'), { status: 409 });
    }
    throw err;
  }
}

// Generate a new temporary password for an existing user (if they forgot or
// lost their previous password) — used by the owner through the Add User page.
// Self-healing: if the user's Firebase account no longer exists (e.g. it was
// manually deleted from the Firebase Console), recreate it using the SAME UID
// so existing foreign keys (created_by in sales/expenses/stock_movements/etc.)
// remain valid and do not become orphaned.
export async function resetPassword({ userId }) {
  const { rows } = await pool.query('SELECT firebase_uid, email, name FROM users WHERE id = $1', [userId]);
  if (rows.length === 0) {
    throw Object.assign(new Error('User tidak ditemukan'), { status: 404 });
  }
  const { firebase_uid: firebaseUid, email, name } = rows[0];
  const tempPassword = generatePassword();

  try {
    await firebaseAuth.updateUser(firebaseUid, { password: tempPassword });
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      await firebaseAuth.createUser({ uid: firebaseUid, email, password: tempPassword, displayName: name });
    } else {
      throw err;
    }
  }

  await pool.query('UPDATE users SET must_change_password = true WHERE id = $1', [userId]);
  return { tempPassword };
}

export async function listUsers({ branchId, role, pagination }) {
  const params = [role];
  let query = `
    SELECT u.id, u.name, u.email, u.phone, u.is_active, u.created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE r.name = $1
  `;

  if (branchId) {
    params.push(branchId);
    query += ` AND u.branch_id = $${params.length}`;
  }

  query += ` ORDER BY u.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return { data: rows.map((row) => mapUser(row, role)), total: extractTotal(rows) };
  }
  return rows.map((row) => mapUser(row, role));
}

function mapUser(row, role) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
