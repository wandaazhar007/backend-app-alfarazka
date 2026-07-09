import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { type } = req.query;
  const pagination = getPagination(req);

  const params = [req.user.branchId];
  const conditions = ['branch_id = $1'];

  if (type) {
    params.push(type);
    conditions.push(`customer_type = $${params.length}`);
  }

  let query = `SELECT id, branch_id, name, phone, address, customer_type, created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
     FROM customers WHERE ${conditions.join(' AND ')} ORDER BY name ASC`;

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

function mapCustomer(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    phone: row.phone,
    address: row.address,
    customerType: row.customer_type,
    createdAt: row.created_at,
  };
}
