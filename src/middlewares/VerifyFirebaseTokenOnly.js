import firebaseAuth from '../config/firebaseAdmin.js';

// Verifies the Firebase ID token only — no Postgres lookup, no 404.
// Used exclusively by POST /api/auth/sync, which must work for a
// firebase_uid that does not have a users row yet (first-time login).
export default async function VerifyFirebaseTokenOnly(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [, token] = authHeader.split('Bearer ');

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing Bearer token' });
  }

  try {
    req.firebaseDecoded = await firebaseAuth.verifyIdToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'INVALID_TOKEN', message: err.message });
  }
}
