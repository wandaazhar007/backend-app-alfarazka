import * as SellerPayrollService from '../services/SellerPayrollService.js';
import { getPagination } from '../utils/pagination.js';

function normalizePeriodMonth(value) {
  // Terima 'YYYY-MM' atau 'YYYY-MM-DD' dari frontend, selalu simpan sbg tanggal 1.
  if (!value) return null;
  const [year, month] = value.split('-');
  if (!year || !month) return null;
  return `${year}-${month.padStart(2, '0')}-01`;
}

export const preview = async (req, res) => {
  const { sellerId, periodMonth } = req.query;
  const normalized = normalizePeriodMonth(periodMonth);

  if (!sellerId || !normalized) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sellerId dan periodMonth (YYYY-MM) wajib diisi' });
  }

  const result = await SellerPayrollService.computeMonthlyPreview({
    sellerId,
    branchId: req.user.branchId,
    periodMonth: normalized,
  });

  res.json(result);
};

export const generate = async (req, res) => {
  const { sellerId, periodMonth } = req.body;
  const normalized = normalizePeriodMonth(periodMonth);

  if (!sellerId || !normalized) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'sellerId dan periodMonth (YYYY-MM) wajib diisi' });
  }

  try {
    const closing = await SellerPayrollService.generateClosing({
      sellerId,
      branchId: req.user.branchId,
      periodMonth: normalized,
      createdBy: req.user.id,
    });
    res.status(201).json(closing);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'PAYROLL_GENERATE_FAILED', message: err.message });
  }
};

export const confirm = async (req, res) => {
  const { id } = req.params;

  try {
    const closing = await SellerPayrollService.confirmPayout(id);
    if (!closing) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Gaji bulanan tidak ditemukan' });
    }
    res.json(closing);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'PAYROLL_CONFIRM_FAILED', message: err.message });
  }
};

export const list = async (req, res) => {
  const { seller_id: sellerId } = req.query;
  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;
  const pagination = getPagination(req);

  const result = await SellerPayrollService.listClosings({ branchId, sellerId, pagination });

  if (pagination) {
    return res.json({ ...result, page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(result);
};
