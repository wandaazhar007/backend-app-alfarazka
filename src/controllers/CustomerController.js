import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { type, search } = req.query;
  const pagination = getPagination(req);

  const params = [req.user.branchId];
  const conditions = ['c.branch_id = $1'];

  if (type) {
    params.push(type);
    conditions.push(`c.customer_type = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`c.name ILIKE $${params.length}`);
  }

  let query = `
    SELECT c.id, c.branch_id, c.name, c.phone, c.address, c.customer_type, c.created_at,
           (
             EXISTS (SELECT 1 FROM sales s WHERE s.customer_id = c.id)
             OR EXISTS (SELECT 1 FROM receivables r WHERE r.customer_id = c.id)
           ) AS has_usage${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM customers c
    WHERE ${conditions.join(' AND ')}
  `;

  // Tabel Kelola Pelanggan (paginated) tampilkan yang terbaru dulu. Dropdown Pelanggan
  // di PaketSalePage (panggil endpoint ini TANPA `page`) tetap alfabetis, lebih gampang
  // dicari manual saat mengetik.
  query += pagination ? ` ORDER BY c.created_at DESC` : ` ORDER BY c.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return res.json({ data: rows.map(mapCustomer), total: extractTotal(rows), page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(rows.map(mapCustomer));
};

export const create = async (req, res) => {
  const { name, phone, address, customerType } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name wajib diisi' });
  }

  const { rows } = await pool.query(
    `INSERT INTO customers (branch_id, name, phone, address, customer_type)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'individual'))
     RETURNING id, branch_id, name, phone, address, customer_type, created_at`,
    [req.user.branchId, name, phone ?? null, address ?? null, customerType]
  );

  res.status(201).json(mapCustomer(rows[0]));
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name, phone, address, customerType } = req.body;

  const { rows } = await pool.query(
    `UPDATE customers SET
       name = COALESCE($1, name),
       phone = COALESCE($2, phone),
       address = COALESCE($3, address),
       customer_type = COALESCE($4, customer_type)
     WHERE id = $5 AND branch_id = $6
     RETURNING id, branch_id, name, phone, address, customer_type, created_at`,
    [name, phone, address, customerType, id, req.user.branchId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Pelanggan tidak ditemukan' });
  }

  res.json(mapCustomer(rows[0]));
};

export const remove = async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await pool.query(
    'SELECT id FROM customers WHERE id = $1 AND branch_id = $2',
    [id, req.user.branchId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Pelanggan tidak ditemukan' });
  }

  try {
    await pool.query('DELETE FROM customers WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'CUSTOMER_IN_USE',
        message: 'Pelanggan masih punya riwayat penjualan/piutang, tidak bisa dihapus.',
      });
    }
    throw err;
  }
};

function mapCustomer(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    customerType: row.customer_type,
    hasUsage: Boolean(row.has_usage),
    createdAt: row.created_at,
  };
}
