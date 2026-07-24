import pool from '../config/db.js';
import * as SellerDebtService from '../services/SellerDebtService.js';
import * as PushNotificationService from '../services/PushNotificationService.js';
import { getPagination } from '../utils/pagination.js';

export const settle = async (req, res) => {
  const { sellerId, date, actualAmount } = req.body;

  if (!sellerId || !date || typeof actualAmount !== 'number' || actualAmount < 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'sellerId, date, dan actualAmount (>= 0) wajib diisi',
    });
  }

  const debt = await SellerDebtService.upsertShortfallDebt({
    sellerId,
    branchId: req.user.branchId,
    date,
    actualAmount,
  });

  res.json(debt);
};

// Preview LIVE nilai penjualan yang seharusnya disetor (tidak menyimpan apa pun) —
// dipakai modal Setor di DailySettlementPage supaya admin bisa lihat target setoran
// & selisihnya SAAT mengetik, sebelum klik Simpan (yang baru memanggil settle di atas).
export const getExpected = async (req, res) => {
  const { sellerId, date } = req.query;

  if (!sellerId || !date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sellerId dan date wajib diisi' });
  }

  const expectedAmount = await SellerDebtService.computeExpectedAmount({ sellerId, date });
  res.json({ expectedAmount });
};

export const createLoan = async (req, res) => {
  const { sellerId, date, amount, note } = req.body;

  if (!sellerId || !date || typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'sellerId, date, dan amount (> 0) wajib diisi',
    });
  }

  const debt = await SellerDebtService.createLoan({
    sellerId,
    branchId: req.user.branchId,
    date,
    amount,
    note,
    createdBy: req.user.id,
  });

  res.status(201).json(debt);

  notifyOwnerOfLoan(req.user.branchId, sellerId, amount).catch(() => {});
};

// Fire-and-forget, sama seperti notifikasi lain (StockMovement/Sales/DailyClosing) —
// kegagalan kirim push tidak boleh mempengaruhi pinjaman yang sudah berhasil disimpan.
async function notifyOwnerOfLoan(branchId, sellerId, amount) {
  const { rows } = await pool.query(
    `SELECT u.name FROM sellers se JOIN users u ON u.id = se.user_id WHERE se.id = $1`,
    [sellerId]
  );
  const sellerName = rows[0]?.name ?? 'Penjual';
  const formattedAmount = new Intl.NumberFormat('id-ID').format(amount);

  await PushNotificationService.notifyRole('owner', branchId, {
    title: 'Pinjaman Penjual Baru',
    body: `${sellerName} mendapat pinjaman Rp${formattedAmount}`,
    data: { type: 'seller-loan' },
  });
}

export const list = async (req, res) => {
  const { status, seller_id: sellerId, source, date } = req.query;
  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;
  const pagination = getPagination(req);

  const result = await SellerDebtService.listDebts({ branchId, status, sellerId, source, date, pagination });

  if (pagination) {
    return res.json({ ...result, page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(result);
};

export const addPayment = async (req, res) => {
  const { id } = req.params;
  const { amount, method, paymentDate, note } = req.body;

  if (typeof amount !== 'number' || amount <= 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'amount wajib > 0' });
  }
  if (!['cash', 'qris', 'potongan_gaji'].includes(method)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "method wajib 'cash', 'qris', atau 'potongan_gaji'" });
  }
  if (!paymentDate) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'paymentDate wajib diisi' });
  }

  try {
    const debt = await SellerDebtService.addPayment(id, {
      amount,
      method,
      paymentDate,
      note,
      createdBy: req.user.id,
    });

    if (!debt) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Utang tidak ditemukan' });
    }

    res.status(201).json(debt);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'DEBT_PAYMENT_FAILED', message: err.message });
  }
};
