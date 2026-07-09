import * as QrisSettlementService from '../services/QrisSettlementService.js';
import todayJakarta from '../utils/todayJakarta.js';

export const create = async (req, res) => {
  const { settlementDate, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'items wajib berupa array dan tidak boleh kosong' });
  }

  for (const item of items) {
    if (!item.sellerId || typeof item.amount !== 'number' || item.amount < 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Setiap item wajib punya sellerId dan amount (>= 0)',
      });
    }
  }

  try {
    const settlements = await QrisSettlementService.upsertBatch({
      branchId: req.user.branchId,
      settlementDate: settlementDate || todayJakarta(),
      items,
      createdBy: req.user.id,
    });

    res.status(201).json(settlements);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: 'QRIS_SETTLEMENT_FAILED', message: err.message });
  }
};
