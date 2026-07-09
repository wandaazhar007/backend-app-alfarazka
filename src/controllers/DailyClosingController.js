import * as DailyClosingService from '../services/DailyClosingService.js';
import todayJakarta from '../utils/todayJakarta.js';

export const generate = async (req, res) => {
  const { closingDate } = req.body;

  const closing = await DailyClosingService.generateClosing({
    branchId: req.user.branchId,
    closingDate: closingDate || todayJakarta(),
    createdBy: req.user.id,
  });

  res.status(201).json(closing);
};

export const list = async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param from dan to wajib diisi' });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const closings = await DailyClosingService.listClosings({ branchId, from, to });
  res.json(closings);
};
