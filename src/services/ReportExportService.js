import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';

function formatCurrency(n) {
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}

const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// "2026-07-16" -> "16-Juli-2026" — samakan dengan format badge rentang tanggal di ExpensesPage.
function formatTanggalDash(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}-${MONTH_NAMES_ID[Number(month) - 1]}-${year}`;
}

// `date` (satu hari) ATAU `from`+`to` (rentang) — dipakai baik oleh laporan harian
// gabungan maupun laporan pengeluaran, supaya labelnya konsisten di semua export.
function formatRangeLabel({ date, from, to }) {
  return date ? formatTanggalDash(date) : `${formatTanggalDash(from)} s/d ${formatTanggalDash(to)}`;
}

export function generatePdfReport(res, { date, from, to, report, closingTotals }) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text('Laporan Harian - Alfarazka Bakery', { align: 'center' });
  doc.fontSize(12).text(`Tanggal: ${formatRangeLabel({ date, from, to })}`, { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(14).text('Ringkasan Gabungan (Keliling + Toko + Paket)');
  doc.moveDown(0.5);
  doc.fontSize(11);
  doc.text(`Total Cash: ${formatCurrency(report.summary.totalCash)}`);
  doc.text(`Total QRIS: ${formatCurrency(report.summary.totalQris)}`);
  doc.text(`Total Penjualan: ${formatCurrency(report.summary.totalPenjualan)}`);
  doc.text(`  - Keliling: ${formatCurrency(report.summary.totalKeliling)}`);
  doc.text(`  - Toko: ${formatCurrency(report.summary.totalToko)}`);
  doc.text(`  - Paket: ${formatCurrency(report.summary.totalPaket)}`);
  doc.text(`Total HPP: ${formatCurrency(closingTotals.totalCogs)}`);
  doc.text(`Laba Kotor: ${formatCurrency(closingTotals.grossProfit)}`);
  doc.text(`Total Pengeluaran Operasional: ${formatCurrency(closingTotals.totalExpenses)}`);
  doc.text(`Laba Bersih: ${formatCurrency(closingTotals.netProfit)}`);
  doc.text(`Roti Terjual (keliling): ${report.summary.totalQtySold}`);
  doc.text(`Roti Retur (keliling): ${report.summary.totalQtyReturned}`);
  doc.moveDown(1.5);

  doc.fontSize(14).text('Keliling — Penjualan per Penjual');
  doc.moveDown(0.5);

  const kelilingColumns = [
    { label: 'Penjual', x: 40, width: 140 },
    { label: 'Cash', x: 180, width: 90 },
    { label: 'QRIS', x: 270, width: 90 },
    { label: 'Total', x: 360, width: 90 },
    { label: 'Roti Terjual', x: 450, width: 60 },
    { label: 'Roti Retur', x: 510, width: 60 },
  ];

  doc.fontSize(10).font('Helvetica-Bold');
  let headerY = doc.y;
  kelilingColumns.forEach((col) => doc.text(col.label, col.x, headerY, { width: col.width }));
  doc.moveDown(0.5);
  doc.font('Helvetica');

  if (report.keliling.sellers.length === 0) {
    doc.text('Tidak ada data.');
  }
  report.keliling.sellers.forEach((s) => {
    const rowY = doc.y;
    doc.text(s.sellerName, kelilingColumns[0].x, rowY, { width: kelilingColumns[0].width });
    doc.text(String(s.cash.toLocaleString('id-ID')), kelilingColumns[1].x, rowY, { width: kelilingColumns[1].width });
    doc.text(String(s.qris.toLocaleString('id-ID')), kelilingColumns[2].x, rowY, { width: kelilingColumns[2].width });
    doc.text(String(s.totalPenjualan.toLocaleString('id-ID')), kelilingColumns[3].x, rowY, { width: kelilingColumns[3].width });
    doc.text(String(s.qtySold), kelilingColumns[4].x, rowY, { width: kelilingColumns[4].width });
    doc.text(String(s.qtyReturned), kelilingColumns[5].x, rowY, { width: kelilingColumns[5].width });
    doc.moveDown(0.7);
  });
  doc.moveDown(1);

  doc.fontSize(14).text('Toko — Transaksi Mini POS');
  doc.moveDown(0.5);

  const tokoColumns = [
    { label: 'Item', x: 40, width: 260 },
    { label: 'Cash', x: 310, width: 100 },
    { label: 'QRIS', x: 420, width: 100 },
    { label: 'Total', x: 530, width: 40 },
  ];

  doc.fontSize(10).font('Helvetica-Bold');
  headerY = doc.y;
  tokoColumns.forEach((col) => doc.text(col.label, col.x, headerY, { width: col.width }));
  doc.moveDown(0.5);
  doc.font('Helvetica');

  if (report.toko.sales.length === 0) {
    doc.text('Tidak ada transaksi toko.');
  }
  report.toko.sales.forEach((s) => {
    const rowY = doc.y;
    const itemSummary = s.items.map((i) => `${i.productName} x${i.qty}`).join(', ');
    doc.text(itemSummary || '-', tokoColumns[0].x, rowY, { width: tokoColumns[0].width });
    doc.text(String(s.cash.toLocaleString('id-ID')), tokoColumns[1].x, rowY, { width: tokoColumns[1].width });
    doc.text(String(s.qris.toLocaleString('id-ID')), tokoColumns[2].x, rowY, { width: tokoColumns[2].width });
    doc.moveDown(0.7);
  });
  doc.moveDown(1);

  doc.fontSize(14).text('Paket — Penjualan Custom');
  doc.moveDown(0.5);

  const paketColumns = [
    { label: 'Nama Paket', x: 40, width: 140 },
    { label: 'Pelanggan', x: 180, width: 110 },
    { label: 'Diterima Hari Ini', x: 290, width: 100 },
    { label: 'Nilai Paket', x: 390, width: 90 },
    { label: 'Status', x: 480, width: 90 },
  ];

  doc.fontSize(10).font('Helvetica-Bold');
  headerY = doc.y;
  paketColumns.forEach((col) => doc.text(col.label, col.x, headerY, { width: col.width }));
  doc.moveDown(0.5);
  doc.font('Helvetica');

  if (report.paket.sales.length === 0) {
    doc.text('Tidak ada transaksi paket.');
  }
  report.paket.sales.forEach((s) => {
    const rowY = doc.y;
    doc.text(s.customName ?? '-', paketColumns[0].x, rowY, { width: paketColumns[0].width });
    doc.text(s.customerName ?? '-', paketColumns[1].x, rowY, { width: paketColumns[1].width });
    doc.text(String((s.cash + s.qris).toLocaleString('id-ID')), paketColumns[2].x, rowY, { width: paketColumns[2].width });
    doc.text(String(s.totalAmount.toLocaleString('id-ID')), paketColumns[3].x, rowY, { width: paketColumns[3].width });
    doc.text(s.paymentStatus, paketColumns[4].x, rowY, { width: paketColumns[4].width });
    doc.moveDown(0.7);
  });

  doc.end();
}

export async function generateExcelReport(res, { date, from, to, report, closingTotals }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Laporan Harian');

  sheet.addRow(['Laporan Harian - Alfarazka Bakery']);
  sheet.addRow([`Tanggal: ${formatRangeLabel({ date, from, to })}`]);
  sheet.addRow([]);
  sheet.addRow(['Ringkasan Gabungan (Keliling + Toko + Paket)']);
  sheet.addRow(['Total Cash', report.summary.totalCash]);
  sheet.addRow(['Total QRIS', report.summary.totalQris]);
  sheet.addRow(['Total Penjualan', report.summary.totalPenjualan]);
  sheet.addRow(['  - Keliling', report.summary.totalKeliling]);
  sheet.addRow(['  - Toko', report.summary.totalToko]);
  sheet.addRow(['  - Paket', report.summary.totalPaket]);
  sheet.addRow(['Total HPP', closingTotals.totalCogs]);
  sheet.addRow(['Laba Kotor', closingTotals.grossProfit]);
  sheet.addRow(['Total Pengeluaran Operasional', closingTotals.totalExpenses]);
  sheet.addRow(['Laba Bersih', closingTotals.netProfit]);
  sheet.addRow(['Roti Terjual (keliling)', report.summary.totalQtySold]);
  sheet.addRow(['Roti Retur (keliling)', report.summary.totalQtyReturned]);
  sheet.addRow([]);

  sheet.addRow(['Keliling — Penjualan per Penjual']);
  const kelilingHeader = sheet.addRow(['Penjual', 'Cash', 'QRIS', 'Total Penjualan', 'Roti Terjual', 'Roti Retur']);
  kelilingHeader.font = { bold: true };
  report.keliling.sellers.forEach((s) => {
    sheet.addRow([s.sellerName, s.cash, s.qris, s.totalPenjualan, s.qtySold, s.qtyReturned]);
  });
  sheet.addRow([]);

  sheet.addRow(['Toko — Transaksi Mini POS']);
  const tokoHeader = sheet.addRow(['Item', 'Cash', 'QRIS', 'Total']);
  tokoHeader.font = { bold: true };
  report.toko.sales.forEach((s) => {
    const itemSummary = s.items.map((i) => `${i.productName} x${i.qty}`).join(', ');
    sheet.addRow([itemSummary || '-', s.cash, s.qris, s.cash + s.qris]);
  });
  sheet.addRow([]);

  sheet.addRow(['Paket — Penjualan Custom']);
  const paketHeader = sheet.addRow(['Nama Paket', 'Pelanggan', 'Diterima Hari Ini', 'Nilai Paket', 'Status', 'Outstanding']);
  paketHeader.font = { bold: true };
  report.paket.sales.forEach((s) => {
    sheet.addRow([s.customName ?? '-', s.customerName ?? '-', s.cash + s.qris, s.totalAmount, s.paymentStatus, s.outstanding]);
  });

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  await workbook.xlsx.write(res);
  res.end();
}

export function generateExpensesPdfReport(res, { from, to, expenses, totals }) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  doc.fontSize(18).text('Laporan Pengeluaran - Alfarazka Bakery', { align: 'center' });
  doc.fontSize(12).text(`Rentang: ${formatRangeLabel({ from, to })}`, { align: 'center' });
  doc.moveDown(1.5);

  doc.fontSize(11);
  doc.text(`Uang Makan: ${formatCurrency(totals.totalMealAllowance)}`);
  doc.text(`Lain-lain: ${formatCurrency(totals.totalOther)}`);
  doc.text(`Total Pengeluaran: ${formatCurrency(totals.totalAmount)}`);
  doc.moveDown(1.5);

  const columns = [
    { label: 'Tanggal', x: 40, width: 95 },
    { label: 'Kategori', x: 140, width: 130 },
    { label: 'Nominal', x: 275, width: 90 },
    { label: 'Keterangan', x: 370, width: 180 },
  ];

  doc.fontSize(10).font('Helvetica-Bold');
  let headerY = doc.y;
  columns.forEach((col) => doc.text(col.label, col.x, headerY, { width: col.width }));
  doc.moveDown(0.5);
  doc.font('Helvetica');

  if (expenses.length === 0) {
    doc.text('Tidak ada pengeluaran pada rentang tanggal ini.');
  }
  expenses.forEach((e) => {
    const rowY = doc.y;
    doc.text(formatTanggalDash(e.expenseDate), columns[0].x, rowY, { width: columns[0].width });
    doc.text(e.categoryName, columns[1].x, rowY, { width: columns[1].width });
    doc.text(formatCurrency(e.amount), columns[2].x, rowY, { width: columns[2].width });
    doc.text(e.description ?? '-', columns[3].x, rowY, { width: columns[3].width });
    doc.moveDown(0.7);
  });

  doc.end();
}

export async function generateExpensesExcelReport(res, { from, to, expenses, totals }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Laporan Pengeluaran');

  sheet.addRow(['Laporan Pengeluaran - Alfarazka Bakery']);
  sheet.addRow([`Rentang: ${formatRangeLabel({ from, to })}`]);
  sheet.addRow([]);
  sheet.addRow(['Uang Makan', totals.totalMealAllowance]);
  sheet.addRow(['Lain-lain', totals.totalOther]);
  sheet.addRow(['Total Pengeluaran', totals.totalAmount]);
  sheet.addRow([]);

  const header = sheet.addRow(['Tanggal', 'Kategori', 'Nominal', 'Keterangan']);
  header.font = { bold: true };
  expenses.forEach((e) => {
    sheet.addRow([formatTanggalDash(e.expenseDate), e.categoryName, e.amount, e.description ?? '-']);
  });

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  await workbook.xlsx.write(res);
  res.end();
}
