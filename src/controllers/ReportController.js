import * as ReportService from '../services/ReportService.js';
import * as DailyClosingService from '../services/DailyClosingService.js';
import * as ReportExportService from '../services/ReportExportService.js';

export const daily = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param date wajib diisi' });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const report = await ReportService.getDailyReport({ branchId, date });
  res.json(report);
};

export const exportReport = async (req, res) => {
  const { date, format } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param date wajib diisi' });
  }
  if (!['pdf', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Query param format wajib 'pdf' atau 'xlsx'" });
  }

  const branchId = req.user.role === 'admin' ? req.user.branchId : undefined;

  const [report, closingTotals] = await Promise.all([
    ReportService.getDailyReport({ branchId, date }),
    DailyClosingService.computeTotals({ branchId, date }),
  ]);

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-harian-${date}.pdf"`);
    return ReportExportService.generatePdfReport(res, { date, report, closingTotals });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="laporan-harian-${date}.xlsx"`);
  await ReportExportService.generateExcelReport(res, { date, report, closingTotals });
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
