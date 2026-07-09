import pool from '../config/db.js';
import { extractTotal } from '../utils/pagination.js';

export async function listReceivables({ branchId, status, customerId, pagination }) {
  const params = [];
  const conditions = [];

  if (branchId) {
    params.push(branchId);
    conditions.push(`s.branch_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`r.status = $${params.length}`);
  }
  if (customerId) {
    params.push(customerId);
    conditions.push(`r.customer_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT r.id, r.sale_id, r.customer_id, c.name AS customer_name, s.custom_name,
            r.total_amount, r.amount_paid, r.due_date, r.status, r.created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
     FROM receivables r
     JOIN sales s ON s.id = r.sale_id
     JOIN customers c ON c.id = r.customer_id
     ${whereClause}
     ORDER BY r.due_date ASC NULLS LAST, r.created_at DESC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return { data: rows.map(mapReceivable), total: extractTotal(rows) };
  }
  return rows.map(mapReceivable);
}

export async function getReceivableWithPayments(id) {
  const { rows } = await pool.query(
    `SELECT r.id, r.sale_id, r.customer_id, c.name AS customer_name, s.custom_name,
            r.total_amount, r.amount_paid, r.due_date, r.status, r.created_at
     FROM receivables r
     JOIN sales s ON s.id = r.sale_id
     JOIN customers c ON c.id = r.customer_id
     WHERE r.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    return null;
  }

  const { rows: paymentRows } = await pool.query(
    `SELECT id, amount, method, payment_date, note, created_at
     FROM receivable_payments WHERE receivable_id = $1 ORDER BY payment_date ASC, created_at ASC`,
    [id]
  );

  return {
    ...mapReceivable(rows[0]),
    payments: paymentRows.map(mapReceivablePayment),
  };
}

export async function addPayment(id, { amount, method, paymentDate, note, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: receivableRows } = await client.query('SELECT * FROM receivables WHERE id = $1 FOR UPDATE', [id]);
    if (receivableRows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const receivable = receivableRows[0];
    const outstanding = Number(receivable.total_amount) - Number(receivable.amount_paid);

    if (amount > outstanding) {
      throw Object.assign(new Error(`amount (${amount}) melebihi sisa tagihan (${outstanding})`), { status: 400 });
    }

    await client.query(
      `INSERT INTO receivable_payments (receivable_id, amount, method, payment_date, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, amount, method, paymentDate, note ?? null, createdBy]
    );

    const newAmountPaid = Number(receivable.amount_paid) + amount;
    const newStatus = newAmountPaid >= Number(receivable.total_amount) ? 'lunas' : 'dp';

    await client.query(`UPDATE receivables SET amount_paid = $1, status = $2 WHERE id = $3`, [
      newAmountPaid,
      newStatus,
      id,
    ]);

    if (newStatus === 'lunas') {
      await client.query(`UPDATE sales SET payment_status = 'lunas' WHERE id = $1`, [receivable.sale_id]);
    }

    await client.query('COMMIT');
    return getReceivableWithPayments(id);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function mapReceivable(row) {
  return {
    id: row.id,
    saleId: row.sale_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customName: row.custom_name,
    totalAmount: Number(row.total_amount),
    amountPaid: Number(row.amount_paid),
    outstanding: Number(row.total_amount) - Number(row.amount_paid),
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapReceivablePayment(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    method: row.method,
    paymentDate: row.payment_date,
    note: row.note,
    createdAt: row.created_at,
  };
}
