import pool from '../config/db.js';
import todayJakarta from '../utils/todayJakarta.js';

// Sales trend for the last N days (from daily_closings, cash basis — the same
// basis used for gross_profit) — used for the Owner dashboard chart
// (docs/07_DESIGN_SYSTEM.md §13).
// "Last N days" is calculated based on the Jakarta business date (todayJakarta),
// not PostgreSQL's CURRENT_DATE, to stay consistent with the business date logic
// used throughout the application.
export async function getSalesTrend({ branchId, days }) {
  const [y, m, d] = todayJakarta().split('-').map(Number);
  const cutoff = new Date(Date.UTC(y, m - 1, d));
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const fromDate = cutoff.toISOString().slice(0, 10);

  const params = [fromDate];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT closing_date, (total_sales_cash + total_sales_qris) AS total
     FROM daily_closings
     WHERE closing_date >= $1 ${branchFilter}
     ORDER BY closing_date ASC`,
    params
  );

  return rows.map((row) => ({ date: row.closing_date, total: Number(row.total) }));
}

// Sales comparison by mobile seller for the selected date range
// (Owner dashboard chart, §13) — uses the same formula as the daily mobile
// sales breakdown, but aggregated across the selected date range instead of
// a single day.
export async function getSellerComparison({ branchId, from, to }) {
  const params = [from, to];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND se.branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `WITH cash_agg AS (
       SELECT s.seller_id, SUM(p.amount) AS cash_total
       FROM sales s
       JOIN payments p ON p.sale_id = s.id AND p.method = 'cash'
       WHERE s.sale_date BETWEEN $1 AND $2 AND s.seller_id IS NOT NULL
       GROUP BY s.seller_id
     ),
     qris_agg AS (
       SELECT seller_id, SUM(amount) AS qris_total
       FROM qris_settlements
       WHERE settlement_date BETWEEN $1 AND $2
       GROUP BY seller_id
     )
     SELECT se.id AS seller_id, u.name AS seller_name,
            COALESCE(cash_agg.cash_total, 0) + COALESCE(qris_agg.qris_total, 0) AS total
     FROM sellers se
     JOIN users u ON u.id = se.user_id
     LEFT JOIN cash_agg ON cash_agg.seller_id = se.id
     LEFT JOIN qris_agg ON qris_agg.seller_id = se.id
     WHERE se.is_active = true ${branchFilter}
     ORDER BY u.name ASC`,
    params
  );

  return rows.map((row) => ({ sellerId: row.seller_id, sellerName: row.seller_name, total: Number(row.total) }));
}

// Consolidated daily report: mobile sales + store sales + package sales in a
// single response.
// `keliling` keeps its original per-seller structure so consumers that only
// need mobile sales data (DailySettlementPage, seller/my-sales) continue to work.
// The top-level `summary` represents the GRAND TOTAL on a cash basis (money
// actually received that day, using the same formula as gross_profit in
// DailyClosingService) — not just mobile sales.
export async function getDailyReport({ branchId, date }) {
  const [keliling, toko, paket] = await Promise.all([
    getKelilingBreakdown({ branchId, date }),
    getTokoBreakdown({ branchId, date }),
    getPaketBreakdown({ branchId, date }),
  ]);

  const totalCash = keliling.summary.totalCash + toko.summary.cash + paket.summary.cash;
  const totalQris = keliling.summary.totalQris + toko.summary.qris + paket.summary.qris;

  const summary = {
    totalCash,
    totalQris,
    totalPenjualan: totalCash + totalQris,
    totalKeliling: keliling.summary.totalPenjualan,
    totalToko: toko.summary.cash + toko.summary.qris,
    totalPaket: paket.summary.cash + paket.summary.qris,
    totalQtyOut: keliling.summary.totalQtyOut,
    totalQtyReturned: keliling.summary.totalQtyReturned,
    totalQtySold: keliling.summary.totalQtySold,
  };

  return { date, keliling, toko, paket, summary };
}

// Formula based on docs/01_DATA_MODEL.md, "Key Calculation Notes":
// - Daily sales per seller = SUM(payments.amount where method='cash' for that seller's sales on that day) + the seller's qris_settlements.amount for that day
// - Bread sold per seller = SUM(qty_out - qty_returned) from that day's stock_movements
async function getKelilingBreakdown({ branchId, date }) {
  const params = [date];
  let branchFilterSellers = '';
  let branchFilterSales = '';
  let branchFilterStock = '';

  if (branchId) {
    params.push(branchId);
    branchFilterSellers = ` AND se.branch_id = $${params.length}`;
    branchFilterSales = ` AND s.branch_id = $${params.length}`;
    branchFilterStock = ` AND sm.branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `WITH cash_agg AS (
       SELECT s.seller_id, SUM(p.amount) AS cash_total
       FROM sales s
       JOIN payments p ON p.sale_id = s.id AND p.method = 'cash'
       WHERE s.sale_date = $1 AND s.seller_id IS NOT NULL ${branchFilterSales}
       GROUP BY s.seller_id
     ),
     stock_agg AS (
       SELECT sm.seller_id, SUM(sm.qty_out) AS qty_out_total, SUM(sm.qty_returned) AS qty_returned_total
       FROM stock_movements sm
       WHERE sm.movement_date = $1 ${branchFilterStock}
       GROUP BY sm.seller_id
     )
     SELECT se.id AS seller_id, u.name AS seller_name,
            COALESCE(cash_agg.cash_total, 0) AS cash,
            COALESCE(qs.amount, 0) AS qris,
            COALESCE(stock_agg.qty_out_total, 0) AS qty_out,
            COALESCE(stock_agg.qty_returned_total, 0) AS qty_returned
     FROM sellers se
     JOIN users u ON u.id = se.user_id
     LEFT JOIN cash_agg ON cash_agg.seller_id = se.id
     LEFT JOIN qris_settlements qs ON qs.seller_id = se.id AND qs.settlement_date = $1
     LEFT JOIN stock_agg ON stock_agg.seller_id = se.id
     WHERE se.is_active = true ${branchFilterSellers}
     ORDER BY u.name ASC`,
    params
  );

  const sellers = rows.map((row) => {
    const cash = Number(row.cash);
    const qris = Number(row.qris);
    const qtyOut = Number(row.qty_out);
    const qtyReturned = Number(row.qty_returned);

    return {
      sellerId: row.seller_id,
      sellerName: row.seller_name,
      cash,
      qris,
      totalPenjualan: cash + qris,
      qtyOut,
      qtyReturned,
      qtySold: qtyOut - qtyReturned,
    };
  });

  const summary = sellers.reduce(
    (acc, s) => ({
      totalCash: acc.totalCash + s.cash,
      totalQris: acc.totalQris + s.qris,
      totalPenjualan: acc.totalPenjualan + s.totalPenjualan,
      totalQtyOut: acc.totalQtyOut + s.qtyOut,
      totalQtyReturned: acc.totalQtyReturned + s.qtyReturned,
      totalQtySold: acc.totalQtySold + s.qtySold,
    }),
    { totalCash: 0, totalQris: 0, totalPenjualan: 0, totalQtyOut: 0, totalQtyReturned: 0, totalQtySold: 0 }
  );

  return { sellers, summary };
}

// Store sales: mini POS, always paid in full at the time of purchase
// (cash + QRIS = total_amount, validated during creation).
async function getTokoBreakdown({ branchId, date }) {
  const params = [date];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND s.branch_id = $${params.length}`;
  }

  const [{ rows: saleRows }, { rows: itemRows }] = await Promise.all([
    pool.query(
      `SELECT s.id, s.total_amount,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0) AS cash,
              COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'qris'), 0) AS qris
       FROM sales s
       LEFT JOIN payments p ON p.sale_id = s.id
       WHERE s.sale_type = 'toko' AND s.sale_date = $1 ${branchFilter}
       GROUP BY s.id
       ORDER BY s.created_at`,
      params
    ),
    pool.query(
      `SELECT si.sale_id, si.qty, si.unit_price, si.subtotal, si.description, pr.name AS product_name
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN products pr ON pr.id = si.product_id
       WHERE s.sale_type = 'toko' AND s.sale_date = $1 ${branchFilter}
       ORDER BY si.id`,
      params
    ),
  ]);

  const itemsBySale = new Map();
  for (const row of itemRows) {
    const list = itemsBySale.get(row.sale_id) ?? [];
    list.push({
      productName: row.product_name ?? row.description ?? '-',
      qty: row.qty,
      unitPrice: Number(row.unit_price),
      subtotal: Number(row.subtotal),
    });
    itemsBySale.set(row.sale_id, list);
  }

  const sales = saleRows.map((row) => ({
    id: row.id,
    totalAmount: Number(row.total_amount),
    cash: Number(row.cash),
    qris: Number(row.qris),
    items: itemsBySale.get(row.id) ?? [],
  }));

  const summary = sales.reduce(
    (acc, s) => ({
      cash: acc.cash + s.cash,
      qris: acc.qris + s.qris,
      transactionCount: acc.transactionCount + 1,
    }),
    { cash: 0, qris: 0, transactionCount: 0 }
  );

  return { sales, summary };
}

// Package sales: can be paid as a down payment (not fully paid). `cash`/`qris` = money received that day (sale_date == down payment/settlement date),
// `totalNilaiPaket` = full contract value, `outstanding` = current outstanding receivable (can change if there are settlements on other days — see the receivables module for complete payment history).
async function getPaketBreakdown({ branchId, date }) {
  const params = [date];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND s.branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.custom_name, s.total_amount, s.payment_status, c.name AS customer_name,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'cash'), 0) AS cash,
            COALESCE(SUM(p.amount) FILTER (WHERE p.method = 'qris'), 0) AS qris,
            r.due_date, r.status AS receivable_status,
            COALESCE(r.total_amount - r.amount_paid, 0) AS outstanding
     FROM sales s
     LEFT JOIN customers c ON c.id = s.customer_id
     LEFT JOIN payments p ON p.sale_id = s.id
     LEFT JOIN receivables r ON r.sale_id = s.id
     WHERE s.sale_type = 'paket' AND s.sale_date = $1 ${branchFilter}
     GROUP BY s.id, c.name, r.due_date, r.status, r.total_amount, r.amount_paid
     ORDER BY s.created_at`,
    params
  );

  const sales = rows.map((row) => ({
    id: row.id,
    customName: row.custom_name,
    customerName: row.customer_name,
    totalAmount: Number(row.total_amount),
    cash: Number(row.cash),
    qris: Number(row.qris),
    paymentStatus: row.payment_status,
    dueDate: row.due_date,
    outstanding: Number(row.outstanding),
  }));

  const summary = sales.reduce(
    (acc, s) => ({
      cash: acc.cash + s.cash,
      qris: acc.qris + s.qris,
      totalNilaiPaket: acc.totalNilaiPaket + s.totalAmount,
      outstanding: acc.outstanding + s.outstanding,
      transactionCount: acc.transactionCount + 1,
    }),
    { cash: 0, qris: 0, totalNilaiPaket: 0, outstanding: 0, transactionCount: 0 }
  );

  return { sales, summary };
}
