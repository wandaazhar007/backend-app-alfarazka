import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const pagination = getPagination(req);
  const params = [];
  let query = `
    SELECT p.id, p.branch_id, p.name, p.category_id, pc.name AS category_name,
           p.unit_price, p.is_active, p.created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
  `;

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    query += ` WHERE p.branch_id = $1`;
  }

  query += ` ORDER BY p.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return res.json({ data: rows.map(mapProduct), total: extractTotal(rows), page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(rows.map(mapProduct));
};

export const create = async (req, res) => {
  const { name, categoryId, unitPrice, isActive } = req.body;

  if (!name || unitPrice === undefined) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name dan unitPrice wajib diisi' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO products (branch_id, name, category_id, unit_price, is_active)
       VALUES ($1, $2, $3, $4, COALESCE($5, true))
       RETURNING id, branch_id, name, category_id, unit_price, is_active, created_at`,
      [req.user.branchId, name, categoryId ?? null, unitPrice, isActive]
    );

    res.status(201).json(mapProduct(await withCategoryName(rows[0])));
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'categoryId tidak valid' });
    }
    throw err;
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name, categoryId, unitPrice, isActive } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         category_id = COALESCE($2, category_id),
         unit_price = COALESCE($3, unit_price),
         is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, branch_id, name, category_id, unit_price, is_active, created_at`,
      [name, categoryId, unitPrice, isActive, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Produk tidak ditemukan' });
    }

    res.json(mapProduct(await withCategoryName(rows[0])));
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'categoryId tidak valid' });
    }
    throw err;
  }
};

async function withCategoryName(row) {
  if (!row.category_id) {
    return { ...row, category_name: null };
  }
  const { rows } = await pool.query('SELECT name FROM product_categories WHERE id = $1', [row.category_id]);
  return { ...row, category_name: rows[0]?.name ?? null };
}

function mapProduct(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    categoryId: row.category_id,
    categoryName: row.category_name,
    unitPrice: Number(row.unit_price),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
