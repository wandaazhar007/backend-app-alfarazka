import pool from '../config/db.js';
import * as StockMovementService from '../services/StockMovementService.js';
import * as PushNotificationService from '../services/PushNotificationService.js';
import todayJakarta from '../utils/todayJakarta.js';
import { logAudit } from '../middlewares/AuditLogger.js';

export const create = async (req, res) => {
  const { movementDate, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'items wajib berupa array dan tidak boleh kosong' });
  }

  for (const item of items) {
    if (!item.sellerId || !item.productId || item.qtyOut === undefined || item.qtyOut < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Setiap item wajib punya sellerId, productId, dan qtyOut (>= 0)',
      });
    }
  }

  const movements = await StockMovementService.createBatch({
    branchId: req.user.branchId,
    createdBy: req.user.id,
    movementDate: movementDate || todayJakarta(),
    items,
  });

  res.status(201).json(movements);

  notifyOwnerOfMorningStock(req.user.branchId, items).catch(() => {});
};

// Fire-and-forget, dipanggil SETELAH response dikirim — Owner tidak perlu nunggu
// push notification selesai terkirim, dan kegagalannya tidak boleh mempengaruhi
// hasil input stok pagi yang sudah berhasil disimpan.
async function notifyOwnerOfMorningStock(branchId, items) {
  const sellerIds = [...new Set(items.map((item) => item.sellerId))];
  const { rows } = await pool.query(
    `SELECT u.name FROM sellers se JOIN users u ON u.id = se.user_id WHERE se.id = ANY($1)`,
    [sellerIds]
  );
  const sellerNames = rows.map((r) => r.name).join(', ');

  await PushNotificationService.notifyRole('owner', branchId, {
    title: 'Stok Pagi Masuk',
    body: `Stok pagi sudah dicatat untuk: ${sellerNames}`,
    data: { type: 'morning-stock' },
  });
}

export const setReturn = async (req, res) => {
  const { id } = req.params;
  const { qtyReturned } = req.body;

  if (qtyReturned === undefined || qtyReturned < 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'qtyReturned wajib diisi dan >= 0' });
  }

  try {
    const movement = await StockMovementService.setReturn(id, qtyReturned);
    if (!movement) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Data stok tidak ditemukan' });
    }
    res.json(movement);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'RETURN_UPDATE_FAILED', message: err.message });
  }
};

export const setReturnBatch = async (req, res) => {
  const { sellerId, movementDate, items } = req.body;

  if (!sellerId || !movementDate) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sellerId dan movementDate wajib diisi' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'items wajib berupa array dan tidak boleh kosong' });
  }

  for (const item of items) {
    if (!item.id || item.qtyReturned === undefined || item.qtyReturned < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Setiap item wajib punya id dan qtyReturned (>= 0)',
      });
    }
  }

  try {
    const movements = await StockMovementService.setReturnBatch({ sellerId, movementDate, items });
    res.json(movements);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'RETURN_UPDATE_FAILED', message: err.message });
  }
};

export const list = async (req, res) => {
  const { date, seller_id: sellerIdParam } = req.query;

  let branchId;
  let sellerId = sellerIdParam;

  if (req.user.role === 'seller') {
    const { rows } = await pool.query('SELECT id FROM sellers WHERE user_id = $1', [req.user.id]);
    if (rows.length === 0) {
      return res.status(403).json({ error: 'NOT_A_SELLER', message: 'Akun ini bukan penjual keliling.' });
    }
    sellerId = rows[0].id;
  } else if (req.user.role === 'admin') {
    branchId = req.user.branchId;
  }
  // owner: no branch filter, sees all branches

  const movements = await StockMovementService.listMovements({ branchId, sellerId, date });
  res.json(movements);
};

export const removeBySellerAndDate = async (req, res) => {
  const { sellerId, date } = req.params;

  const deletedCount = await StockMovementService.deleteBySellerAndDate({
    branchId: req.user.branchId,
    sellerId,
    movementDate: date,
  });

  if (deletedCount === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Data stok pagi tidak ditemukan untuk penjual/tanggal ini' });
  }

  await logAudit(null, {
    userId: req.user.id,
    action: 'delete',
    entity: 'stock_movements',
    entityId: sellerId,
    details: { sellerId, movementDate: date, deletedCount },
  });

  res.status(204).send();
};
