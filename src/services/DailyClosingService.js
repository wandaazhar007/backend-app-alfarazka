import pool from '../config/db.js';

// Cost of Goods Sold — category kept in expense_categories for master-data/history
// purposes, but no longer subtracted from profit (see totalExpenses below): once
// totalCogs is computed automatically from cost_price × qty sold, counting a manual
// "bahan_baku" expense entry too would double-count the same cost.
const COGS_EXPENSE_CATEGORY = 'bahan_baku';

// gross_profit = total combined sales (mobile + store + package) - total COGS (harga
// pokok penjualan, computed automatically from products.cost_price × qty sold — NOT
// from manual expense entries, so it no longer depends on the admin remembering to
// log raw-material purchases).
// net_profit = gross_profit - total OPERATIONAL expenses (gaji, sewa, listrik, uang
// makan penjual, dll — excludes the 'bahan_baku' category, see COGS_EXPENSE_CATEGORY).
//
// Cash basis: only money actually received on that day (cash/QRIS payments + mobile
// QRIS settlements), NOT the value of package contracts that have not been fully
// paid yet (those are recorded as receivables).
// - Cash: sales.payments where method='cash', covering all sale types (mobile/store/package).
// - QRIS: qris_settlements (mobile sales only, per BCA terminal) + sales.payments where method='qris'
//   (store/package — mobile sales NEVER use payments method='qris'; they always go through
//   qris_settlements, see validation in SalesController, so there is no double counting).
// Uses qris_settlements (NOT qris_allocations, the old table name that is no longer used — see docs/CLAUDE.md).
//
// Pure calculation, no database writes — reused by generateClosing() (which persists
// the data) and by the report export (which must remain read-only regardless of role,
// since POST /api/daily-closings is admin-only while export is available to both
// admin and owner).
export async function computeTotals({ branchId, date, client }) {
  const runner = client ?? pool;

  const { rows: cashRows } = await runner.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
     FROM sales s
     JOIN payments p ON p.sale_id = s.id AND p.method = 'cash'
     WHERE s.branch_id = $1 AND s.sale_date = $2`,
    [branchId, date]
  );
  const totalSalesCash = Number(cashRows[0].total);

  const { rows: qrisSettlementRows } = await runner.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM qris_settlements WHERE branch_id = $1 AND settlement_date = $2`,
    [branchId, date]
  );
  const { rows: qrisPaymentRows } = await runner.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
     FROM sales s
     JOIN payments p ON p.sale_id = s.id AND p.method = 'qris'
     WHERE s.branch_id = $1 AND s.sale_date = $2`,
    [branchId, date]
  );
  const totalSalesQris = Number(qrisSettlementRows[0].total) + Number(qrisPaymentRows[0].total);

  // COGS — mobile sales (qty from stock_movements, not sale_items — mobile sales
  // aren't recorded per-item) + store/package sales (qty from sale_items).
  const { rows: mobileCogsRows } = await runner.query(
    `SELECT COALESCE(SUM((sm.qty_out - sm.qty_returned) * p.cost_price), 0) AS total
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.branch_id = $1 AND sm.movement_date = $2`,
    [branchId, date]
  );
  const { rows: itemCogsRows } = await runner.query(
    `SELECT COALESCE(SUM(si.qty * p.cost_price), 0) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.branch_id = $1 AND s.sale_date = $2`,
    [branchId, date]
  );
  const totalCogs = Number(mobileCogsRows[0].total) + Number(itemCogsRows[0].total);

  const { rows: expenseRows } = await runner.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.branch_id = $1 AND e.expense_date = $2 AND ec.name != $3`,
    [branchId, date, COGS_EXPENSE_CATEGORY]
  );
  const totalExpenses = Number(expenseRows[0].total);

  const { rows: stockRows } = await runner.query(
    `SELECT COALESCE(SUM(qty_out - qty_returned), 0) AS sold, COALESCE(SUM(qty_returned), 0) AS returned
     FROM stock_movements WHERE branch_id = $1 AND movement_date = $2`,
    [branchId, date]
  );
  const totalBreadSold = Number(stockRows[0].sold);
  const totalBreadReturned = Number(stockRows[0].returned);

  const grossProfit = totalSalesCash + totalSalesQris - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  return {
    totalSalesCash,
    totalSalesQris,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    totalBreadSold,
    totalBreadReturned,
  };
}

export async function generateClosing({ branchId, closingDate, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const {
      totalSalesCash,
      totalSalesQris,
      totalCogs,
      totalExpenses,
      grossProfit,
      netProfit,
      totalBreadSold,
      totalBreadReturned,
    } = await computeTotals({ branchId, date: closingDate, client });

    const { rows } = await client.query(
      `INSERT INTO daily_closings
         (branch_id, closing_date, total_sales_cash, total_sales_qris, total_cogs, total_expenses, gross_profit,
          net_profit, total_bread_sold, total_bread_returned, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (branch_id, closing_date)
       DO UPDATE SET
         total_sales_cash = EXCLUDED.total_sales_cash,
         total_sales_qris = EXCLUDED.total_sales_qris,
         total_cogs = EXCLUDED.total_cogs,
         total_expenses = EXCLUDED.total_expenses,
         gross_profit = EXCLUDED.gross_profit,
         net_profit = EXCLUDED.net_profit,
         total_bread_sold = EXCLUDED.total_bread_sold,
         total_bread_returned = EXCLUDED.total_bread_returned,
         created_by = EXCLUDED.created_by
       RETURNING *`,
      [
        branchId,
        closingDate,
        totalSalesCash,
        totalSalesQris,
        totalCogs,
        totalExpenses,
        grossProfit,
        netProfit,
        totalBreadSold,
        totalBreadReturned,
        createdBy,
      ]
    );

    await client.query('COMMIT');
    return mapClosing(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Versi rentang tanggal dari computeTotals() di atas — dipakai HANYA oleh export
// Laporan (read-only) ketika admin memilih rentang Dari/Sampai, BUKAN oleh alur
// generateClosing()/Tutup Buku (yang tetap per-hari, tidak diubah). Dihitung LIVE
// dari tabel sumber (bukan dari SUM(daily_closings)) supaya tetap akurat walau ada
// hari dalam rentang yang belum di-"Tutup Buku" (belum punya baris daily_closings).
export async function computeRangeTotals({ branchId, from, to }) {
  const { rows: cashRows } = await pool.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
     FROM sales s
     JOIN payments p ON p.sale_id = s.id AND p.method = 'cash'
     WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const totalSalesCash = Number(cashRows[0].total);

  const { rows: qrisSettlementRows } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM qris_settlements WHERE branch_id = $1 AND settlement_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const { rows: qrisPaymentRows } = await pool.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS total
     FROM sales s
     JOIN payments p ON p.sale_id = s.id AND p.method = 'qris'
     WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const totalSalesQris = Number(qrisSettlementRows[0].total) + Number(qrisPaymentRows[0].total);

  const { rows: mobileCogsRows } = await pool.query(
    `SELECT COALESCE(SUM((sm.qty_out - sm.qty_returned) * p.cost_price), 0) AS total
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.branch_id = $1 AND sm.movement_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const { rows: itemCogsRows } = await pool.query(
    `SELECT COALESCE(SUM(si.qty * p.cost_price), 0) AS total
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN products p ON p.id = si.product_id
     WHERE s.branch_id = $1 AND s.sale_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const totalCogs = Number(mobileCogsRows[0].total) + Number(itemCogsRows[0].total);

  const { rows: expenseRows } = await pool.query(
    `SELECT COALESCE(SUM(e.amount), 0) AS total
     FROM expenses e
     JOIN expense_categories ec ON ec.id = e.category_id
     WHERE e.branch_id = $1 AND e.expense_date BETWEEN $2 AND $3 AND ec.name != $4`,
    [branchId, from, to, COGS_EXPENSE_CATEGORY]
  );
  const totalExpenses = Number(expenseRows[0].total);

  const { rows: stockRows } = await pool.query(
    `SELECT COALESCE(SUM(qty_out - qty_returned), 0) AS sold, COALESCE(SUM(qty_returned), 0) AS returned
     FROM stock_movements WHERE branch_id = $1 AND movement_date BETWEEN $2 AND $3`,
    [branchId, from, to]
  );
  const totalBreadSold = Number(stockRows[0].sold);
  const totalBreadReturned = Number(stockRows[0].returned);

  const grossProfit = totalSalesCash + totalSalesQris - totalCogs;
  const netProfit = grossProfit - totalExpenses;

  return {
    totalSalesCash,
    totalSalesQris,
    totalCogs,
    totalExpenses,
    grossProfit,
    netProfit,
    totalBreadSold,
    totalBreadReturned,
  };
}

export async function listClosings({ branchId, from, to }) {
  const params = [from, to];
  let branchFilter = '';

  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT * FROM daily_closings WHERE closing_date BETWEEN $1 AND $2 ${branchFilter} ORDER BY closing_date DESC`,
    params
  );

  return rows.map(mapClosing);
}

function mapClosing(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    closingDate: row.closing_date,
    totalSalesCash: Number(row.total_sales_cash),
    totalSalesQris: Number(row.total_sales_qris),
    totalCogs: Number(row.total_cogs),
    totalExpenses: Number(row.total_expenses),
    grossProfit: Number(row.gross_profit),
    netProfit: Number(row.net_profit),
    totalBreadSold: row.total_bread_sold,
    totalBreadReturned: row.total_bread_returned,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
