import pool from '../config/db.js';
import * as SellerService from '../services/SellerService.js';
import * as StockMovementService from '../services/StockMovementService.js';
import * as ReportService from '../services/ReportService.js';
import todayJakarta, { yesterdayJakarta } from '../utils/todayJakarta.js';
import { getPagination } from '../utils/pagination.js';

async function findOwnSeller(userId) {
  const { rows } = await pool.query(
    'SELECT s.id, s.branch_id, u.name FROM sellers s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1',
    [userId]
  );
  return rows[0] ?? null;
}

export const list = async (req, res) => {
  const pagination = getPagination(req);
  const result = await SellerService.listSellers({ role: req.user.role, branchId: req.user.branchId, pagination });

  if (pagination) {
    return res.json({ ...result, page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(result);
};

export const create = async (req, res) => {
  const { name, email, phone, qrisTerminalId, dailyMealAllowance, isActive } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name dan email wajib diisi' });
  }

  try {
    const { seller, tempPassword } = await SellerService.createSeller({
      name,
      email,
      phone,
      qrisTerminalId,
      dailyMealAllowance,
      isActive,
      branchId: req.user.branchId,
    });

    res.status(201).json({ ...seller, tempPassword });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'SELLER_CREATE_FAILED', message: err.message });
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name, phone, qrisTerminalId, dailyMealAllowance, isActive } = req.body;

  const seller = await SellerService.updateSeller(id, { name, phone, qrisTerminalId, dailyMealAllowance, isActive });

  if (!seller) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Penjual tidak ditemukan' });
  }

  res.json(seller);
};

export const todayStock = async (req, res) => {
  const seller = await findOwnSeller(req.user.id);
  if (!seller) {
    return res.status(403).json({ error: 'NOT_A_SELLER', message: 'Akun ini bukan penjual keliling.' });
  }

  const movements = await StockMovementService.listMovements({ sellerId: seller.id, date: todayJakarta() });
  res.json(movements);
};

export const mySales = async (req, res) => {
  const seller = await findOwnSeller(req.user.id);
  if (!seller) {
    return res.status(403).json({ error: 'NOT_A_SELLER', message: 'Akun ini bukan penjual keliling.' });
  }

  const date = req.query.date || yesterdayJakarta();
  const report = await ReportService.getDailyReport({ branchId: seller.branch_id, date });
  const row = report.keliling.sellers.find((s) => s.sellerId === seller.id);

  res.json({
    date,
    ...(row ?? {
      sellerId: seller.id,
      sellerName: seller.name,
      cash: 0,
      qris: 0,
      totalPenjualan: 0,
      qtyOut: 0,
      qtyReturned: 0,
      qtySold: 0,
    }),
  });
};
