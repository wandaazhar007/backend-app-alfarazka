import pool from '../config/db.js';
import firebaseAuth from '../config/firebaseAdmin.js';

export const sync = async (req, res) => {
  const { uid, email, name } = req.firebaseDecoded;
  const isVendorEmail = process.env.VENDOR_EMAIL && email === process.env.VENDOR_EMAIL;

  const { rows: existingRows } = await pool.query(
    `SELECT u.id, u.firebase_uid, u.branch_id, u.name, u.email, u.is_active, u.is_vendor, u.must_change_password, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.firebase_uid = $1`,
    [uid]
  );

  if (existingRows.length > 0) {
    let user = existingRows[0];

    // If the VENDOR_EMAIL environment variable is changed or configured later,
    // synchronize this flag on every sync so no manual migration is needed
    // whenever a new vendor account logs in for the first time.
    if (isVendorEmail && !user.is_vendor) {
      const { rows: updated } = await pool.query(
        `UPDATE users SET is_vendor = true WHERE id = $1
         RETURNING id, branch_id, name, email, is_active, is_vendor, must_change_password`,
        [user.id]
      );
      user = { ...user, ...updated[0] };
    }

    return res.json({
      id: user.id,
      branchId: user.branch_id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      isVendor: user.is_vendor,
      mustChangePassword: user.must_change_password,
    });
  }

  const { rows: roleRows } = await pool.query(`SELECT id FROM roles WHERE name = 'admin'`);
  if (roleRows.length === 0) {
    return res.status(500).json({ error: 'ROLE_NOT_SEEDED', message: "Role 'admin' belum ada, jalankan seed.sql" });
  }
  const adminRoleId = roleRows[0].id;

  const { rows: branchRows } = await pool.query(`SELECT id FROM branches ORDER BY created_at ASC LIMIT 1`);
  const defaultBranchId = branchRows[0]?.id ?? null;

  const { rows: inserted } = await pool.query(
    `INSERT INTO users (firebase_uid, branch_id, role_id, name, email, is_vendor)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, branch_id, name, email, is_active, is_vendor, must_change_password`,
    [uid, defaultBranchId, adminRoleId, name || email.split('@')[0], email, Boolean(isVendorEmail)]
  );

  const user = inserted[0];
  return res.status(201).json({
    id: user.id,
    branchId: user.branch_id,
    name: user.name,
    email: user.email,
    role: 'admin',
    isActive: user.is_active,
    isVendor: user.is_vendor,
    mustChangePassword: user.must_change_password,
  });
};

export const me = async (req, res) => {
  res.json(req.user);
};

// Called by the user themselves (an admin/seller who logged in with a temporary
// password from provisioning) — updates their Firebase password and clears the
// force-password-change flag.
// The old password is not required because account ownership has already been
// verified with a valid ID token (VerifyFirebaseToken), following the same
// pattern as other password reset flows.
export const changePassword = async (req, res) => {
  const { newPassword } = req.body;

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Password baru wajib diisi, minimal 8 karakter' });
  }

  await firebaseAuth.updateUser(req.user.firebaseUid, { password: newPassword });
  await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [req.user.id]);

  res.json({ success: true });
};
