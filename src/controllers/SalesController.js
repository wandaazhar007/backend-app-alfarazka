import pool from '../config/db.js';
import * as SalesService from '../services/SalesService.js';
import * as PushNotificationService from '../services/PushNotificationService.js';

export const create = async (req, res) => {
  const { saleType } = req.body;

  if (saleType === 'keliling') return createKeliling(req, res);
  if (saleType === 'toko') return createToko(req, res);
  if (saleType === 'paket') return createPaket(req, res);

  return res.status(400).json({
    error: 'UNSUPPORTED_SALE_TYPE',
    message: "sale_type wajib salah satu dari: 'keliling', 'toko', 'paket'.",
  });
};

async function createKeliling(req, res) {
  const { sellerId, saleDate, payments } = req.body;

  if (!sellerId || !saleDate) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sellerId dan saleDate wajib diisi' });
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'payments wajib diisi minimal 1 entry' });
  }

  for (const p of payments) {
    if (p.method !== 'cash' || typeof p.amount !== 'number' || p.amount < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message:
          "Untuk sale_type 'keliling', setiap payment wajib method='cash' dengan amount >= 0 (QRIS dicatat lewat /api/qris-settlements)",
      });
    }
  }

  const sale = await SalesService.upsertKelilingSale({
    branchId: req.user.branchId,
    sellerId,
    saleDate,
    payments,
    createdBy: req.user.id,
  });

  res.status(201).json(sale);

  notifyOwnerOfSetoran(req.user.branchId, sellerId, sale.totalAmount).catch(() => {});
}

// Fire-and-forget, sama seperti notifyOwnerOfMorningStock di StockMovementController —
// kegagalan kirim push tidak boleh mempengaruhi setoran yang sudah berhasil disimpan.
async function notifyOwnerOfSetoran(branchId, sellerId, totalAmount) {
  const { rows } = await pool.query(
    `SELECT u.name FROM sellers se JOIN users u ON u.id = se.user_id WHERE se.id = $1`,
    [sellerId]
  );
  const sellerName = rows[0]?.name ?? 'Penjual';
  const formattedAmount = new Intl.NumberFormat('id-ID').format(totalAmount);

  await PushNotificationService.notifyRole('owner', branchId, {
    title: 'Setoran Masuk',
    body: `${sellerName} sudah setor Rp${formattedAmount}`,
    data: { type: 'setoran' },
  });
}

async function createToko(req, res) {
  const { saleDate, items, payments } = req.body;

  if (!saleDate) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'saleDate wajib diisi' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: "Untuk sale_type 'toko', items wajib diisi minimal 1 (detail per produk).",
    });
  }

  for (const item of items) {
    if (!item.productId || typeof item.qty !== 'number' || item.qty <= 0 || typeof item.unitPrice !== 'number' || item.unitPrice < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Setiap item wajib punya productId, qty (> 0), dan unitPrice (>= 0)',
      });
    }
  }

  if (!Array.isArray(payments) || payments.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'payments wajib diisi minimal 1 entry' });
  }

  for (const p of payments) {
    if (!['cash', 'qris'].includes(p.method) || typeof p.amount !== 'number' || p.amount < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: "Setiap payment wajib method='cash'|'qris' dengan amount >= 0",
      });
    }
  }

  const totalFromItems = items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const totalFromPayments = payments.reduce((sum, p) => sum + p.amount, 0);

  if (totalFromItems !== totalFromPayments) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: `Total payments (${totalFromPayments}) harus sama dengan total items (${totalFromItems}) — penjualan toko dibayar lunas di tempat.`,
    });
  }

  const sale = await SalesService.createTokoSale({
    branchId: req.user.branchId,
    saleDate,
    items,
    payments,
    createdBy: req.user.id,
  });

  res.status(201).json(sale);
}

async function createPaket(req, res) {
  const { customerId, customName, saleDate, totalAmount, dpAmount, dpMethod, dueDate, items } = req.body;

  if (!customerId || !customName || !saleDate || typeof totalAmount !== 'number' || totalAmount <= 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'customerId, customName, saleDate, dan totalAmount (> 0) wajib diisi',
    });
  }

  const dp = dpAmount ?? 0;
  if (typeof dp !== 'number' || dp < 0 || dp > totalAmount) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'dpAmount wajib >= 0 dan tidak boleh melebihi totalAmount',
    });
  }

  if (dp > 0 && !['cash', 'qris'].includes(dpMethod)) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: "dpMethod wajib 'cash' atau 'qris' kalau dpAmount > 0",
    });
  }

  const sale = await SalesService.createPaketSale({
    branchId: req.user.branchId,
    customerId,
    customName,
    saleDate,
    totalAmount,
    dpAmount: dp,
    dpMethod: dp > 0 ? dpMethod : null,
    dueDate,
    items,
    createdBy: req.user.id,
  });

  res.status(201).json(sale);
}
