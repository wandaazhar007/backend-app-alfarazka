import pool from '../config/db.js';

// gross_profit = total combined sales (mobile + store + package) - total expenses.
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

  const { rows: expenseRows } = await runner.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE branch_id = $1 AND expense_date = $2`,
    [branchId, date]
  );
  const totalExpenses = Number(expenseRows[0].total);

  const { rows: stockRows } = await runner.query(
    `SELECT COALESCE(SUM(qty_out - qty_returned), 0) AS sold, COALESCE(SUM(qty_returned), 0) AS returned
     FROM stock_movements WHERE branch_id = $1 AND movement_date = $2`,
    [branchId, date]
  );
  const totalBreadSold = Number(stockRows[0].sold);
  const totalBreadReturned = Number(stockRows[0].returned);

  const grossProfit = totalSalesCash + totalSalesQris - totalExpenses;

  return { totalSalesCash, totalSalesQris, totalExpenses, grossProfit, totalBreadSold, totalBreadReturned };
}

export async function generateClosing({ branchId, closingDate, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { totalSalesCash, totalSalesQris, totalExpenses, grossProfit, totalBreadSold, totalBreadReturned } =
      await computeTotals({ branchId, date: closingDate, client });

    const { rows } = await client.query(
      `INSERT INTO daily_closings
         (branch_id, closing_date, total_sales_cash, total_sales_qris, total_expenses, gross_profit,
          total_bread_sold, total_bread_returned, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (branch_id, closing_date)
       DO UPDATE SET
         total_sales_cash = EXCLUDED.total_sales_cash,
         total_sales_qris = EXCLUDED.total_sales_qris,
         total_expenses = EXCLUDED.total_expenses,
         gross_profit = EXCLUDED.gross_profit,
         total_bread_sold = EXCLUDED.total_bread_sold,
         total_bread_returned = EXCLUDED.total_bread_returned,
         created_by = EXCLUDED.created_by
       RETURNING *`,
      [branchId, closingDate, totalSalesCash, totalSalesQris, totalExpenses, grossProfit, totalBreadSold, totalBreadReturned, createdBy]
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
    totalExpenses: Number(row.total_expenses),
    grossProfit: Number(row.gross_profit),
    totalBreadSold: row.total_bread_sold,
    totalBreadReturned: row.total_bread_returned,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
