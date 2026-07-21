import pool from '../config/db.js';
import * as SellerDebtService from './SellerDebtService.js';
import { extractTotal } from '../utils/pagination.js';

// Tier gaji harian dari qty ROTI terjual — batas ATAS inklusif (dikonfirmasi user).
const TIER_TABLE = [
  { max: 200, salary: 30000 },
  { max: 300, salary: 35000 },
  { max: 400, salary: 40000 },
  { max: 500, salary: 50000 },
  { max: Infinity, salary: 50000 },
];

export function computeTierSalary(qtySold) {
  const tier = TIER_TABLE.find((t) => qtySold <= t.max);
  return tier.salary;
}

// Preview gaji sebulan — dihitung LIVE dari stock_movements+products (tidak disimpan
// harian), dikelompokkan per hari penjual itu benar-benar bawa stok. Roti (commission_per_unit
// kosong/0) menentukan tier gaji harian; produk komisi (commission_per_unit > 0) dihitung
// terpisah sebagai komisi, TIDAK ikut qty tier (dikonfirmasi user).
export async function computeMonthlyPreview({ sellerId, branchId, periodMonth }) {
  const [year, month] = periodMonth.split('-').map(Number);
  const monthStart = periodMonth;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${periodMonth.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;

  const { rows: dailyRows } = await pool.query(
    `SELECT sm.movement_date AS date,
            SUM(CASE WHEN COALESCE(p.commission_per_unit, 0) = 0 THEN sm.qty_out - sm.qty_returned ELSE 0 END) AS roti_qty,
            SUM(CASE WHEN COALESCE(p.commission_per_unit, 0) > 0 THEN (sm.qty_out - sm.qty_returned) * p.commission_per_unit ELSE 0 END) AS commission_amount
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.seller_id = $1 AND sm.movement_date BETWEEN $2 AND $3
     GROUP BY sm.movement_date
     ORDER BY sm.movement_date ASC`,
    [sellerId, monthStart, monthEnd]
  );

  const dailyBreakdown = dailyRows.map((row) => {
    const rotiQty = Number(row.roti_qty);
    return {
      date: row.date,
      rotiQty,
      tierSalary: computeTierSalary(rotiQty),
      commissionAmount: Number(row.commission_amount),
    };
  });

  const totalTierSalary = dailyBreakdown.reduce((sum, d) => sum + d.tierSalary, 0);
  const totalCommission = dailyBreakdown.reduce((sum, d) => sum + d.commissionAmount, 0);
  const outstandingDebt = await SellerDebtService.getMyOutstandingTotal({ sellerId });
  const grossPayout = totalTierSalary + totalCommission;
  // Tidak pernah memotong lebih dari payout kotornya sendiri (tidak sampai minus).
  const debtDeduction = Math.min(outstandingDebt, grossPayout);
  const netPayout = grossPayout - debtDeduction;

  const unsettledDate = await findFirstUnsettledDate({ sellerId, monthStart, monthEnd });

  return { totalTierSalary, totalCommission, outstandingDebt, debtDeduction, netPayout, dailyBreakdown, unsettledDate };
}

// Tanggal pertama (paling awal) dalam periode dimana penjual sudah bawa stok
// (ada baris stock_movements) tapi BELUM setoran cash DAN/ATAU QRIS — pola
// has_cash/has_qris sama seperti ReportService.getKelilingBreakdown &
// StockMovementService.setReturnBatch, di sini per-hari (bukan agregat sebulan).
async function findFirstUnsettledDate({ sellerId, monthStart, monthEnd }) {
  const { rows } = await pool.query(
    `SELECT stock_days.movement_date AS date
     FROM (
       SELECT DISTINCT sm.movement_date
       FROM stock_movements sm
       WHERE sm.seller_id = $1 AND sm.movement_date BETWEEN $2 AND $3
     ) stock_days
     WHERE NOT EXISTS (
       SELECT 1 FROM sales s JOIN payments p ON p.sale_id = s.id AND p.method = 'cash'
       WHERE s.seller_id = $1 AND s.sale_date = stock_days.movement_date AND s.sale_type = 'keliling'
     )
     OR NOT EXISTS (
       SELECT 1 FROM qris_settlements qs
       WHERE qs.seller_id = $1 AND qs.settlement_date = stock_days.movement_date
     )
     ORDER BY stock_days.movement_date ASC
     LIMIT 1`,
    [sellerId, monthStart, monthEnd]
  );

  return rows.length > 0 ? rows[0].date : null;
}

// Simpan hasil preview sebagai draft — bisa digenerate ulang berkali-kali SELAMA masih
// draft (mis. ada koreksi data di bulan itu), tapi tidak boleh menimpa closing yang
// sudah 'paid'.
export async function generateClosing({ sellerId, branchId, periodMonth, createdBy }) {
  const preview = await computeMonthlyPreview({ sellerId, branchId, periodMonth });

  if (preview.unsettledDate) {
    throw Object.assign(
      new Error(`Penjual belum melakukan setoran pada tanggal ${preview.unsettledDate}, tidak bisa generate gaji.`),
      { status: 409 }
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO seller_payroll_closings
       (seller_id, branch_id, period_month, total_tier_salary, total_commission, total_debt_deduction, net_payout, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8)
     ON CONFLICT (seller_id, period_month) DO UPDATE SET
       total_tier_salary = EXCLUDED.total_tier_salary,
       total_commission = EXCLUDED.total_commission,
       total_debt_deduction = EXCLUDED.total_debt_deduction,
       net_payout = EXCLUDED.net_payout,
       created_by = EXCLUDED.created_by
     WHERE seller_payroll_closings.status = 'draft'
     RETURNING *`,
    [sellerId, branchId, periodMonth, preview.totalTierSalary, preview.totalCommission, preview.debtDeduction, preview.netPayout, createdBy]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Gaji bulan ini sudah dibayar (paid), tidak bisa digenerate ulang.'), { status: 409 });
  }

  return { ...mapClosing(rows[0]), dailyBreakdown: preview.dailyBreakdown };
}

// Konfirmasi bayar — memotong utang belum lunas (tertua duluan) sebesar total_debt_deduction,
// mencatat tiap potongan sebagai seller_debt_payments (method='potongan_gaji'), lalu
// menandai closing 'paid'. Transaksional supaya tidak ada potongan utang yang "nyangkut"
// kalau closing gagal ditandai paid, atau sebaliknya.
export async function confirmPayout(closingId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: closingRows } = await client.query('SELECT * FROM seller_payroll_closings WHERE id = $1 FOR UPDATE', [
      closingId,
    ]);
    if (closingRows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const closing = closingRows[0];

    if (closing.status === 'paid') {
      throw Object.assign(new Error('Closing ini sudah dibayar.'), { status: 409 });
    }

    let remaining = Number(closing.total_debt_deduction);

    if (remaining > 0) {
      const { rows: debtRows } = await client.query(
        `SELECT id, total_amount, amount_paid FROM seller_debts
         WHERE seller_id = $1 AND status = 'belum_lunas'
         ORDER BY created_at ASC FOR UPDATE`,
        [closing.seller_id]
      );

      for (const debt of debtRows) {
        if (remaining <= 0) break;
        const outstanding = Number(debt.total_amount) - Number(debt.amount_paid);
        const payThis = Math.min(outstanding, remaining);
        if (payThis <= 0) continue;

        await client.query(
          `INSERT INTO seller_debt_payments (seller_debt_id, amount, method, payment_date, payroll_closing_id, created_by)
           VALUES ($1, $2, 'potongan_gaji', CURRENT_DATE, $3, $4)`,
          [debt.id, payThis, closingId, closing.created_by]
        );

        const newAmountPaid = Number(debt.amount_paid) + payThis;
        const newStatus = newAmountPaid >= Number(debt.total_amount) ? 'lunas' : 'belum_lunas';
        await client.query(`UPDATE seller_debts SET amount_paid = $1, status = $2 WHERE id = $3`, [
          newAmountPaid,
          newStatus,
          debt.id,
        ]);

        remaining -= payThis;
      }
    }

    const { rows: updated } = await client.query(
      `UPDATE seller_payroll_closings SET status = 'paid', paid_at = now() WHERE id = $1 RETURNING *`,
      [closingId]
    );

    await client.query('COMMIT');
    return mapClosing(updated[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listClosings({ branchId, sellerId, pagination }) {
  const params = [];
  const conditions = [];

  if (branchId) {
    params.push(branchId);
    conditions.push(`c.branch_id = $${params.length}`);
  }
  if (sellerId) {
    params.push(sellerId);
    conditions.push(`c.seller_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT c.id, c.seller_id, u.name AS seller_name, c.period_month, c.total_tier_salary, c.total_commission,
            c.total_debt_deduction, c.net_payout, c.status, c.paid_at, c.created_at${
              pagination ? ', COUNT(*) OVER() AS full_count' : ''
            }
     FROM seller_payroll_closings c
     JOIN sellers se ON se.id = c.seller_id
     JOIN users u ON u.id = se.user_id
     ${whereClause}
     ORDER BY c.period_month DESC, u.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return { data: rows.map(mapClosing), total: extractTotal(rows) };
  }
  return rows.map(mapClosing);
}

function mapClosing(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    periodMonth: row.period_month,
    totalTierSalary: Number(row.total_tier_salary),
    totalCommission: Number(row.total_commission),
    totalDebtDeduction: Number(row.total_debt_deduction),
    netPayout: Number(row.net_payout),
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}
