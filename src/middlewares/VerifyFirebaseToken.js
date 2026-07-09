import firebaseAuth from '../config/firebaseAdmin.js';
import pool from '../config/db.js';

export default async function VerifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split('Bearer ');

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }

  try {
    const decoded = await firebaseAuth.verifyIdToken(token);

    const { rows } = await pool.query(
      `SELECT u.id, u.firebase_uid, u.branch_id, u.name, u.email, u.is_active, u.is_vendor, u.must_change_password, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.firebase_uid = $1`,
      [decoded.uid]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'USER_NOT_SYNCED',
        message: 'User belum terdaftar di database. Panggil POST /api/auth/sync setelah login.',
      });
    }

    const user = rows[0];
    req.user = {
      id: user.id,
      firebaseUid: user.firebase_uid,
      branchId: user.branch_id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      isVendor: user.is_vendor,
      mustChangePassword: user.must_change_password,
    };
    req.firebaseDecoded = decoded;

    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: err.message });
  }
}
