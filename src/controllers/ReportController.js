import * as ReportService from '../services/ReportService.js';
import * as DailyClosingService from '../services/DailyClosingService.js';
import * as ReportExportService from '../services/ReportExportService.js';

export const daily = async (req, res) => {
  const { date, from, to } = req.query;

  if (!date && !(from && to)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param date, atau from dan to, wajib diisi' });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const report = await ReportService.getDailyReport({ branchId, date, from, to });
  res.json(report);
};

// Versi ringan dari `daily` — cuma breakdown keliling (tanpa toko/paket),
// dipakai StockMorningPage/StockEveningPage/DailySettlementPage yang cuma
// butuh status retur+setoran per penjual, supaya tidak ikut menanggung 3
// query toko+paket yang tidak mereka pakai sama sekali.
export const kelilingStatus = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param date wajib diisi' });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const keliling = await ReportService.getKelilingBreakdown({ branchId, date });
  res.json(keliling);
};

export const exportReport = async (req, res) => {
  const { date, from, to, format } = req.query;

  if (!date && !(from && to)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param date, atau from dan to, wajib diisi' });
  }
  if (!['pdf', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Query param format wajib 'pdf' atau 'xlsx'" });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const [report, closingTotals] = await Promise.all([
    ReportService.getDailyReport({ branchId, date, from, to }),
    date
      ? DailyClosingService.computeTotals({ branchId, date })
      : DailyClosingService.computeRangeTotals({ branchId, from, to }),
  ]);

  const fileLabel = date ?? `${from}_${to}`;

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-harian-${fileLabel}.pdf"`);
    return ReportExportService.generatePdfReport(res, { date, from, to, report, closingTotals });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-harian-${fileLabel}.xlsx"`);
  await ReportExportService.generateExcelReport(res, { date, from, to, report, closingTotals });
};

export const trend = async (req, res) => {
  const daysParam = Number(req.query.days);
  const days = [7, 30].includes(daysParam) ? daysParam : 7;
  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const data = await ReportService.getSalesTrend({ branchId, days });
  res.json(data);
};

export const sellerComparison = async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param from dan to wajib diisi' });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;
  const data = await ReportService.getSellerComparison({ branchId, from, to });
  res.json(data);
};
