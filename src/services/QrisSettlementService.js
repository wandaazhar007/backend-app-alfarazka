import pool from '../config/db.js';

export async function upsertBatch({ branchId, settlementDate, items, createdBy }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const results = [];
    for (const item of items) {
      const { rows: sellerRows } = await client.query('SELECT qris_terminal_id FROM sellers WHERE id = $1', [
        item.sellerId,
      ]);

      if (sellerRows.length === 0) {
        throw Object.assign(new Error(`Seller ${item.sellerId} tidak ditemukan`), { status: 404 });
      }

      const terminalId = sellerRows[0].qris_terminal_id;

      const { rows } = await client.query(
        `INSERT INTO qris_settlements (branch_id, seller_id, settlement_date, terminal_id, amount, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (seller_id, settlement_date)
         DO UPDATE SET amount = EXCLUDED.amount, terminal_id = EXCLUDED.terminal_id, created_by = EXCLUDED.created_by
         RETURNING *`,
        [branchId, item.sellerId, settlementDate, terminalId, item.amount, createdBy]
      );

      results.push(rows[0]);
    }

    await client.query('COMMIT');
    return results.map(mapSettlement);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function mapSettlement(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    sellerId: row.seller_id,
    settlementDate: row.settlement_date,
    terminalId: row.terminal_id,
    amount: Number(row.amount),
    createdAt: row.created_at,
  };
}
