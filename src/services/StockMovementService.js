import pool from '../config/db.js';

// Upserts by (seller_id, product_id, movement_date) since the table has no
// unique constraint on that combo — this keeps re-submitting the morning
// form idempotent instead of creating duplicate rows that would double-count
// bread sold (qty_out - qty_returned) per seller/day.
async function upsertMovement(client, { branchId, sellerId, productId, movementDate, qtyOut, createdBy }) {
  const { rows: existing } = await client.query(
    `SELECT id FROM stock_movements WHERE seller_id = $1 AND product_id = $2 AND movement_date = $3`,
    [sellerId, productId, movementDate]
  );

  if (existing.length > 0) {
    const { rows } = await client.query(
      `UPDATE stock_movements SET qty_out = $1 WHERE id = $2 RETURNING *`,
      [qtyOut, existing[0].id]
    );
    return rows[0];
  }

  const { rows } = await client.query(
    `INSERT INTO stock_movements (branch_id, seller_id, product_id, movement_date, qty_out, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [branchId, sellerId, productId, movementDate, qtyOut, createdBy]
  );
  return rows[0];
}

export async function createBatch({ branchId, createdBy, movementDate, items }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];
    for (const item of items) {
      const row = await upsertMovement(client, {
        branchId,
        sellerId: item.sellerId,
        productId: item.productId,
        movementDate,
        qtyOut: item.qtyOut,
        createdBy,
      });
      results.push(row);
    }

    await client.query('COMMIT');
    return results.map(mapMovementRow);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function setReturn(id, qtyReturned) {
  const { rows: existing } = await pool.query('SELECT * FROM stock_movements WHERE id = $1', [id]);
  if (existing.length === 0) {
    return null;
  }

  if (qtyReturned > existing[0].qty_out) {
    throw Object.assign(new Error('qtyReturned tidak boleh lebih besar dari qtyOut'), { status: 400 });
  }

  const { rows } = await pool.query(
    `UPDATE stock_movements SET qty_returned = $1, returned_at = now() WHERE id = $2 RETURNING *`,
    [qtyReturned, id]
  );

  return mapMovementRow(rows[0]);
}

export async function setReturnBatch(items) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];
    for (const { id, qtyReturned } of items) {
      const { rows: existing } = await client.query('SELECT * FROM stock_movements WHERE id = $1', [id]);
      if (existing.length === 0) continue;

      if (qtyReturned > existing[0].qty_out) {
        throw Object.assign(new Error('qtyReturned tidak boleh lebih besar dari qtyOut'), { status: 400 });
      }

      const { rows } = await client.query(
        `UPDATE stock_movements SET qty_returned = $1, returned_at = now() WHERE id = $2 RETURNING *`,
        [qtyReturned, id]
      );
      results.push(rows[0]);
    }

    await client.query('COMMIT');
    return results.map(mapMovementRow);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteBySellerAndDate({ branchId, sellerId, movementDate }) {
  const { rows } = await pool.query(
    `DELETE FROM stock_movements WHERE branch_id = $1 AND seller_id = $2 AND movement_date = $3 RETURNING id`,
    [branchId, sellerId, movementDate]
  );
  return rows.length;
}

export async function listMovements({ branchId, sellerId, date }) {
  const conditions = [];
  const params = [];

  if (branchId) {
    params.push(branchId);
    conditions.push(`sm.branch_id = $${params.length}`);
  }
  if (sellerId) {
    params.push(sellerId);
    conditions.push(`sm.seller_id = $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`sm.movement_date = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT sm.id, sm.branch_id, sm.seller_id, su.name AS seller_name,
            sm.product_id, p.name AS product_name,
            sm.movement_date, sm.qty_out, sm.qty_returned, sm.returned_at, sm.created_at
     FROM stock_movements sm
     JOIN sellers s ON s.id = sm.seller_id
     JOIN users su ON su.id = s.user_id
     JOIN products p ON p.id = sm.product_id
     ${whereClause}
     ORDER BY sm.movement_date DESC, su.name ASC, p.name ASC`,
    params
  );

  return rows.map(mapMovementRow);
}

function mapMovementRow(row) {
  const qtyOut = row.qty_out;
  const qtyReturned = row.qty_returned ?? 0;

  return {
    id: row.id,
    branchId: row.branch_id,
    sellerId: row.seller_id,
    sellerName: row.seller_name ?? null,
    productId: row.product_id,
    productName: row.product_name ?? null,
    movementDate: row.movement_date,
    qtyOut,
    qtyReturned,
    qtySold: qtyOut - qtyReturned,
    returnedAt: row.returned_at,
    createdAt: row.created_at,
  };
}
