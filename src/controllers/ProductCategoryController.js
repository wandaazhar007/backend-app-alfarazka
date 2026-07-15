import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const pagination = getPagination(req);
  const params = [];
  let query = `
    SELECT pc.id, pc.branch_id, pc.name, pc.is_active, pc.created_at,
           EXISTS (SELECT 1 FROM products p WHERE p.category_id = pc.id) AS has_usage${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM product_categories pc
  `;

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    query += ` WHERE pc.branch_id = $1`;
  }

  // Tabel Kelola Kategori Produk (paginated) tampilkan yang terbaru dulu. Dropdown
  // pemilihan kategori di ProductsPage (panggil endpoint ini TANPA `page`) tetap
  // alfabetis, lebih gampang dicari manual saat mengetik.
  query += pagination ? ` ORDER BY pc.created_at DESC` : ` ORDER BY pc.name ASC`;

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
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Nama kategori sudah ada.' });
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
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Nama kategori sudah ada.' });
    }
    throw err;
  }
};

export const remove = async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await pool.query(
    'SELECT id FROM product_categories WHERE id = $1 AND branch_id = $2',
    [id, req.user.branchId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Kategori tidak ditemukan' });
  }

  try {
    await pool.query('DELETE FROM product_categories WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'CATEGORY_IN_USE',
        message: 'Kategori masih dipakai oleh produk, tidak bisa dihapus.',
      });
    }
    throw err;
  }
};

function mapProductCategory(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    name: row.name,
    hasUsage: Boolean(row.has_usage),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
