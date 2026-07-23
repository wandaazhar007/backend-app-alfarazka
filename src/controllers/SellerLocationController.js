import pool from '../config/db.js';
import * as SellerLocationService from '../services/SellerLocationService.js';
import todayJakarta from '../utils/todayJakarta.js';

async function findOwnSeller(userId) {
  const { rows } = await pool.query('SELECT id, branch_id FROM sellers WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

function validatePing(ping) {
  return (
    ping &&
    typeof ping.latitude === 'number' &&
    typeof ping.longitude === 'number' &&
    typeof ping.recordedAt === 'string' &&
    ping.recordedAt.length > 0
  );
}

// Terima 1 ping (body langsung) ATAU batch { pings: [...] } (buat flush antrian offline
// dari app mobile). sellerId SELALU di-resolve dari akun yang login, tidak pernah dari body.
export const create = async (req, res) => {
  const seller = await findOwnSeller(req.user.id);
  if (!seller) {
    return res.status(403).json({ error: 'NOT_A_SELLER', message: 'Akun ini bukan penjual keliling.' });
  }

  const pings = Array.isArray(req.body.pings) ? req.body.pings : [req.body];

  if (pings.length === 0 || !pings.every(validatePing)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'Setiap ping wajib punya latitude, longitude (number), dan recordedAt (string ISO)',
    });
  }

  const inserted = await SellerLocationService.insertPings({
    sellerId: seller.id,
    branchId: seller.branch_id,
    pings,
  });

  res.status(201).json({ inserted: inserted.length });
};

export const list = async (req, res) => {
  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;
  const date = req.query.date || todayJakarta();

  const positions = await SellerLocationService.getLatestPositions({ branchId, date });
  res.json(positions);
};

export const trail = async (req, res) => {
  const { id } = req.params;
  const date = req.query.date || todayJakarta();

  const points = await SellerLocationService.getTrail({ sellerId: id, date });
  res.json(points);
};
