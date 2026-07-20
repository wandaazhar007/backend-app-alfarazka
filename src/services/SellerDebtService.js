import pool from '../config/db.js';
import { extractTotal } from '../utils/pagination.js';

// Nilai penjualan yang SEHARUSNYA disetor penjual hari itu — qty roti terjual (qty_out
// - qty_returned) x harga jual produk, HANYA produk roti (commission_per_unit kosong/0).
// Produk ber-komisi (mis. Es Sirsak) sengaja dikecualikan — itu jalur komisi terpisah,
// bukan bagian dari "setoran" yang dibandingkan ke cash+QRIS di sini.
export async function computeExpectedAmount({ sellerId, date }) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM((sm.qty_out - sm.qty_returned) * p.unit_price), 0) AS total
     FROM stock_movements sm
     JOIN products p ON p.id = sm.product_id
     WHERE sm.seller_id = $1 AND sm.movement_date = $2 AND COALESCE(p.commission_per_unit, 0) = 0`,
    [sellerId, date]
  );
  return Number(rows[0].total);
}

// Dipanggil setiap kali admin simpan/edit Setoran & QRIS untuk seorang penjual di
// suatu tanggal — upsert baris `seller_debts` (source='kekurangan_setoran') kalau ada
// selisih kurang, atau hapus baris lama (kalau belum ada pembayaran) kalau selisihnya
// sudah tidak ada lagi (mis. admin mengoreksi angka setoran).
export async function upsertShortfallDebt({ sellerId, branchId, date, actualAmount }) {
  const expectedAmount = await computeExpectedAmount({ sellerId, date });
  const shortfall = expectedAmount - actualAmount;

  if (shortfall <= 0) {
    await pool.query(
      `DELETE FROM seller_debts
       WHERE seller_id = $1 AND debt_date = $2 AND source = 'kekurangan_setoran' AND amount_paid = 0`,
      [sellerId, date]
    );
    return null;
  }

  const { rows } = await pool.query(
    `INSERT INTO seller_debts (seller_id, branch_id, source, debt_date, expected_amount, actual_amount, total_amount)
     VALUES ($1, $2, 'kekurangan_setoran', $3, $4, $5, $6)
     ON CONFLICT (seller_id, debt_date) WHERE source = 'kekurangan_setoran'
     DO UPDATE SET
       expected_amount = EXCLUDED.expected_amount,
       actual_amount = EXCLUDED.actual_amount,
       total_amount = EXCLUDED.total_amount,
       status = CASE WHEN seller_debts.amount_paid >= EXCLUDED.total_amount THEN 'lunas' ELSE 'belum_lunas' END
     RETURNING *`,
    [sellerId, branchId, date, expectedAmount, actualAmount, shortfall]
  );
  return mapDebt(rows[0]);
}

// Pinjaman/kasbon — dicatat manual oleh admin, terpisah dari kekurangan setoran, bisa
// berkali-kali per penjual per hari (tidak ada batasan unique seperti kekurangan setoran).
export async function createLoan({ sellerId, branchId, date, amount, note, createdBy }) {
  const { rows } = await pool.query(
    `INSERT INTO seller_debts (seller_id, branch_id, source, debt_date, total_amount, note, created_by)
     VALUES ($1, $2, 'pinjaman', $3, $4, $5, $6)
     RETURNING *`,
    [sellerId, branchId, date, amount, note ?? null, createdBy]
  );
  return mapDebt(rows[0]);
}

export async function listDebts({ branchId, status, sellerId, source, date, pagination }) {
  const params = [];
  const conditions = [];

  if (branchId) {
    params.push(branchId);
    conditions.push(`d.branch_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`d.status = $${params.length}`);
  }
  if (sellerId) {
    params.push(sellerId);
    conditions.push(`d.seller_id = $${params.length}`);
  }
  if (source) {
    params.push(source);
    conditions.push(`d.source = $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`d.debt_date = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT d.id, d.seller_id, u.name AS seller_name, d.source, d.debt_date, d.expected_amount,
            d.actual_amount, d.total_amount, d.amount_paid, d.status, d.note, d.created_at${
              pagination ? ', COUNT(*) OVER() AS full_count' : ''
            }
     FROM seller_debts d
     JOIN sellers se ON se.id = d.seller_id
     JOIN users u ON u.id = se.user_id
     ${whereClause}
     ORDER BY d.debt_date DESC, d.created_at DESC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return { data: rows.map(mapDebt), total: extractTotal(rows) };
  }
  return rows.map(mapDebt);
}

export async function getDebtWithPayments(id) {
  const { rows } = await pool.query(
    `SELECT d.id, d.seller_id, u.name AS seller_name, d.source, d.debt_date, d.expected_amount,
            d.actual_amount, d.total_amount, d.amount_paid, d.status, d.note, d.created_at
     FROM seller_debts d
     JOIN sellers se ON se.id = d.seller_id
     JOIN users u ON u.id = se.user_id
     WHERE d.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  const { rows: paymentRows } = await pool.query(
    `SELECT id, amount, method, payment_date, note, created_at
     FROM seller_debt_payments WHERE seller_debt_id = $1 ORDER BY payment_date ASC, created_at ASC`,
    [id]
  );

  return {
    ...mapDebt(rows[0]),
    payments: paymentRows.map(mapDebtPayment),
  };
}

export async function addPayment(id, { amount, method, paymentDate, note, createdBy, payrollClosingId }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: debtRows } = await client.query('SELECT * FROM seller_debts WHERE id = $1 FOR UPDATE', [id]);
    if (debtRows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const debt = debtRows[0];
    const outstanding = Number(debt.total_amount) - Number(debt.amount_paid);

    if (amount > outstanding) {
      throw Object.assign(new Error(`amount (${amount}) melebihi sisa utang (${outstanding})`), { status: 400 });
    }

    await client.query(
      `INSERT INTO seller_debt_payments (seller_debt_id, amount, method, payment_date, note, payroll_closing_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, amount, method, paymentDate, note ?? null, payrollClosingId ?? null, createdBy]
    );

    const newAmountPaid = Number(debt.amount_paid) + amount;
    const newStatus = newAmountPaid >= Number(debt.total_amount) ? 'lunas' : 'belum_lunas';

    await client.query(`UPDATE seller_debts SET amount_paid = $1, status = $2 WHERE id = $3`, [
      newAmountPaid,
      newStatus,
      id,
    ]);

    await client.query('COMMIT');
    return getDebtWithPayments(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Total sisa utang (semua sumber) milik satu penjual — dipakai Dashboard Penjual.
export async function getMyOutstandingTotal({ sellerId }) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(total_amount - amount_paid), 0) AS total
     FROM seller_debts WHERE seller_id = $1 AND status = 'belum_lunas'`,
    [sellerId]
  );
  return Number(rows[0].total);
}

function mapDebt(row) {
  return {
    id: row.id,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    source: row.source,
    debtDate: row.debt_date,
    expectedAmount: row.expected_amount !== null && row.expected_amount !== undefined ? Number(row.expected_amount) : null,
    actualAmount: row.actual_amount !== null && row.actual_amount !== undefined ? Number(row.actual_amount) : null,
    totalAmount: Number(row.total_amount),
    amountPaid: Number(row.amount_paid),
    outstanding: Number(row.total_amount) - Number(row.amount_paid),
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
  };
}

function mapDebtPayment(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    method: row.method,
    paymentDate: row.payment_date,
    note: row.note,
    createdAt: row.created_at,
  };
}
