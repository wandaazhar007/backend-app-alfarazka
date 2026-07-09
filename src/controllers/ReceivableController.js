import * as ReceivableService from '../services/ReceivableService.js';
import { getPagination } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { status, customer_id: customerId } = req.query;
  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;
  const pagination = getPagination(req);

  const result = await ReceivableService.listReceivables({ branchId, status, customerId, pagination });

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
  if (!['cash', 'qris'].includes(method)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "method wajib 'cash' atau 'qris'" });
  }
  if (!paymentDate) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'paymentDate wajib diisi' });
  }

  try {
    const receivable = await ReceivableService.addPayment(id, {
      amount,
      method,
      paymentDate,
      note,
      createdBy: req.user.id,
    });

    if (!receivable) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Piutang tidak ditemukan' });
    }

    res.status(201).json(receivable);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'RECEIVABLE_PAYMENT_FAILED', message: err.message });
  }
};
