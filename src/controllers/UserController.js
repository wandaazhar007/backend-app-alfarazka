import * as UserService from '../services/UserService.js';
import * as SellerService from '../services/SellerService.js';
import { getPagination } from '../utils/pagination.js';

// Owner-only: manage admin and mobile seller accounts from a single place.
// Sellers are still created through SellerService.createSeller (instead of
// duplicating the logic) so the corresponding `sellers` row (QRIS terminal,
// meal allowance) is always created as well — keeping it consistent with the
// admin flow in /admin/sellers.
export const list = async (req, res) => {
  const { role } = req.query;
  const pagination = getPagination(req);

  if (!role || !['admin', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Query param role wajib 'admin' atau 'seller'" });
  }

  if (role === 'seller') {
    const result = await SellerService.listSellers({ role: req.user.role, branchId: req.user.branchId, pagination });
    if (pagination) return res.json({ ...result, page: pagination.page, pageSize: pagination.pageSize });
    return res.json(result);
  }

  const result = await UserService.listUsers({ branchId: req.user.branchId, role, pagination });
  if (pagination) return res.json({ ...result, page: pagination.page, pageSize: pagination.pageSize });
  res.json(result);
};

export const create = async (req, res) => {
  const { role, name, email, phone, qrisTerminalId, dailyMealAllowance, isActive } = req.body;

  if (!role || !['admin', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "role wajib 'admin' atau 'seller'" });
  }
  if (!name || !email) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name dan email wajib diisi' });
  }

  try {
    if (role === 'admin') {
      const { user, tempPassword } = await UserService.createAdmin({ name, email, phone, branchId: req.user.branchId });
      return res.status(201).json({ user, tempPassword });
    }

    const { seller, tempPassword } = await SellerService.createSeller({
      name,
      email,
      phone,
      qrisTerminalId,
      dailyMealAllowance,
      isActive,
      branchId: req.user.branchId,
    });
    res.status(201).json({ user: seller, tempPassword });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'USER_CREATE_FAILED', message: err.message });
  }
};

export const resetPassword = async (req, res) => {
  const { id } = req.params;

  try {
    const { tempPassword } = await UserService.resetPassword({ userId: id });
    res.json({ tempPassword });
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'PASSWORD_RESET_FAILED', message: err.message });
  }
};
