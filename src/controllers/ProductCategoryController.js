import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const pagination = getPagination(req);
  const params = [];
  let query = `SELECT id, branch_id, name, is_active, created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''} FROM product_categories`;

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    query += ` WHERE branch_id = $1`;
  }

  query += ` ORDER BY name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return res.json({
      data: rows.map(mapProductCategory),
      total: extractTotal(rows),
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  }
  res.json(rows.map(mapProductCategory));
};

export const create = async (req, res) => {
  const { name, isActive } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name wajib diisi' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO product_categories (branch_id, name, is_active)
       VALUES ($1, $2, COALESCE($3, true))
       RETURNING id, branch_id, name, is_active, created_at`,
      [req.user.branchId, name, isActive]
    );

    res.status(201).json(mapProductCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Kategori dengan nama ini sudah ada.' });
    }
    throw err;
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name, isActive } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE product_categories SET
         name = COALESCE($1, name),
         is_active = COALESCE($2, is_active)
       WHERE id = $3
       RETURNING id, branch_id, name, is_active, created_at`,
      [name, isActive, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Kategori tidak ditemukan' });
    }

    res.json(mapProductCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Kategori dengan nama ini sudah ada.' });
    }
    throw err;
  }
};

function mapProductCategory(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
