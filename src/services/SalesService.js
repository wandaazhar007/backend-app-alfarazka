import pool from '../config/db.js';
import { logAudit } from '../middlewares/AuditLogger.js';

// Upserts by (seller_id, sale_date, sale_type='keliling') — the "Setoran & QRIS
// Harian" form represents exactly one cash setoran per seller per day, so
// resubmitting (retry, admin correction) replaces the existing sale + its
// payments instead of creating a duplicate that would double-count cash.
export async function upsertKelilingSale({ branchId, sellerId, saleDate, payments, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);

    const { rows: existing } = await client.query(
      `SELECT id FROM sales WHERE seller_id = $1 AND sale_date = $2 AND sale_type = 'keliling'`,
      [sellerId, saleDate]
    );

    let sale;
    let auditAction;

    if (existing.length > 0) {
      const saleId = existing[0].id;
      await client.query(`DELETE FROM payments WHERE sale_id = $1`, [saleId]);
      const { rows } = await client.query(
        `UPDATE sales SET total_amount = $1, created_by = $2 WHERE id = $3 RETURNING *`,
        [totalAmount, createdBy, saleId]
      );
      sale = rows[0];
      auditAction = 'update';
    } else {
      const { rows } = await client.query(
        `INSERT INTO sales (branch_id, sale_type, seller_id, sale_date, total_amount, payment_status, created_by)
         VALUES ($1, 'keliling', $2, $3, $4, 'lunas', $5)
         RETURNING *`,
        [branchId, sellerId, saleDate, totalAmount, createdBy]
      );
      sale = rows[0];
      auditAction = 'create';
    }

    const insertedPayments = [];
    for (const p of payments) {
      const { rows } = await client.query(
        `INSERT INTO payments (sale_id, method, amount, note) VALUES ($1, $2, $3, $4) RETURNING *`,
        [sale.id, p.method, p.amount, p.note ?? null]
      );
      insertedPayments.push(rows[0]);
    }

    // Admin baru saja mengonfirmasi ulang setoran untuk seller+tanggal ini —
    // itu artinya koreksi retur (kalau ada) sudah ditindaklanjuti, jadi
    // hapus tanda "perlu resettlement" di StockEveningPage/DailySettlementPage.
    await client.query(`UPDATE stock_movements SET needs_resettlement = false WHERE seller_id = $1 AND movement_date = $2`, [
      sellerId,
      saleDate,
    ]);

    await logAudit(client, {
      userId: createdBy,
      action: auditAction,
      entity: 'sales',
      entityId: sale.id,
      details: { sellerId, saleDate, totalAmount, paymentsCount: payments.length },
    });

    await client.query('COMMIT');

    return mapSale(sale, insertedPayments);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Toko: mini-POS walk-in sale. items[] is mandatory (per-product detail),
// total_amount is computed server-side from items, payments must sum to it
// exactly (toko sales are paid in full on the spot — no DP concept here).
export async function createTokoSale({ branchId, saleDate, items, payments, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const subtotals = items.map((item) => ({ ...item, subtotal: item.qty * item.unitPrice }));
    const totalAmount = subtotals.reduce((sum, item) => sum + item.subtotal, 0);

    const { rows } = await client.query(
      `INSERT INTO sales (branch_id, sale_type, sale_date, total_amount, payment_status, created_by)
       VALUES ($1, 'toko', $2, $3, 'lunas', $4)
       RETURNING *`,
      [branchId, saleDate, totalAmount, createdBy]
    );
    const sale = rows[0];

    const insertedItems = [];
    for (const item of subtotals) {
      const { rows: itemRows } = await client.query(
        `INSERT INTO sale_items (sale_id, product_id, description, qty, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sale.id, item.productId ?? null, item.description ?? null, item.qty, item.unitPrice, item.subtotal]
      );
      insertedItems.push(itemRows[0]);
    }

    const insertedPayments = [];
    for (const p of payments) {
      const { rows: paymentRows } = await client.query(
        `INSERT INTO payments (sale_id, method, amount, note) VALUES ($1, $2, $3, $4) RETURNING *`,
        [sale.id, p.method, p.amount, p.note ?? null]
      );
      insertedPayments.push(paymentRows[0]);
    }

    await logAudit(client, {
      userId: createdBy,
      action: 'create',
      entity: 'sales',
      entityId: sale.id,
      details: { saleDate, totalAmount, itemsCount: items.length },
    });

    await client.query('COMMIT');
    return mapSale(sale, insertedPayments, insertedItems);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Paket: negotiated custom-name sale (e.g. "Paket Aqiqah Bu Ani"). total_amount
// is client-supplied (harga negosiasi, not derived from items). If the initial
// DP doesn't cover the full total, a receivables row is opened to track the
// outstanding balance + due date.
export async function createPaketSale({
  branchId,
  customerId,
  customName,
  saleDate,
  totalAmount,
  dpAmount,
  dpMethod,
  dueDate,
  items,
  createdBy,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const paymentStatus = dpAmount >= totalAmount ? 'lunas' : 'dp';

    const { rows } = await client.query(
      `INSERT INTO sales (branch_id, sale_type, customer_id, custom_name, sale_date, total_amount, payment_status, created_by)
       VALUES ($1, 'paket', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [branchId, customerId, customName, saleDate, totalAmount, paymentStatus, createdBy]
    );
    const sale = rows[0];

    const insertedItems = [];
    for (const item of items ?? []) {
      const subtotal = (item.qty ?? 1) * item.unitPrice;
      const { rows: itemRows } = await client.query(
        `INSERT INTO sale_items (sale_id, product_id, description, qty, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sale.id, item.productId ?? null, item.description ?? null, item.qty ?? 1, item.unitPrice, subtotal]
      );
      insertedItems.push(itemRows[0]);
    }

    const insertedPayments = [];
    if (dpAmount > 0) {
      const { rows: paymentRows } = await client.query(
        `INSERT INTO payments (sale_id, method, amount, note) VALUES ($1, $2, $3, $4) RETURNING *`,
        [sale.id, dpMethod, dpAmount, 'DP awal']
      );
      insertedPayments.push(paymentRows[0]);
    }

    let receivable = null;
    if (paymentStatus !== 'lunas') {
      const { rows: receivableRows } = await client.query(
        `INSERT INTO receivables (sale_id, customer_id, total_amount, amount_paid, due_date, status)
         VALUES ($1, $2, $3, $4, $5, 'dp')
         RETURNING *`,
        [sale.id, customerId, totalAmount, dpAmount, dueDate ?? null]
      );
      receivable = mapReceivable(receivableRows[0]);
    }

    await logAudit(client, {
      userId: createdBy,
      action: 'create',
      entity: 'sales',
      entityId: sale.id,
      details: { customerId, customName, totalAmount, dpAmount },
    });

    await client.query('COMMIT');
    return { ...mapSale(sale, insertedPayments, insertedItems), receivable };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function mapSale(row, payments, items) {
  return {
    id: row.id,
    branchId: row.branch_id,
    saleType: row.sale_type,
    sellerId: row.seller_id,
    customerId: row.customer_id,
    customName: row.custom_name,
    saleDate: row.sale_date,
    totalAmount: Number(row.total_amount),
    paymentStatus: row.payment_status,
    payments: payments.map((p) => ({
      method: p.method,
      amount: Number(p.amount),
      note: p.note ?? null,
    })),
    items: (items ?? []).map((i) => ({
      productId: i.product_id,
      description: i.description,
      qty: i.qty,
      unitPrice: Number(i.unit_price),
      subtotal: Number(i.subtotal),
    })),
    createdAt: row.created_at,
  };
}

function mapReceivable(row) {
  return {
    id: row.id,
    saleId: row.sale_id,
    customerId: row.customer_id,
    totalAmount: Number(row.total_amount),
    amountPaid: Number(row.amount_paid),
    outstanding: Number(row.total_amount) - Number(row.amount_paid),
    dueDate: row.due_date,
    status: row.status,
    createdAt: row.created_at,
  };
}
