import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { search } = req.query;
  const pagination = getPagination(req);
  const params = [];
  const conditions = [];
  let query = `
    SELECT p.id, p.branch_id, p.name, p.category_id, pc.name AS category_name,
           p.unit_price, p.cost_price, p.commission_per_unit, p.is_active, p.created_at,
           (
             EXISTS (SELECT 1 FROM sale_items si WHERE si.product_id = p.id)
             OR EXISTS (SELECT 1 FROM stock_movements sm WHERE sm.product_id = p.id)
           ) AS has_usage${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM products p
    LEFT JOIN product_categories pc ON pc.id = p.category_id
  `;

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    conditions.push(`p.branch_id = $${params.length}`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`p.name ILIKE $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  // Tabel Kelola Produk (paginated) tampilkan yang terbaru dulu. Dropdown/Combobox
  // pemilihan produk di halaman lain (StockMorningPage, TokoSalePage — panggil endpoint
  // ini TANPA `page`) tetap alfabetis, lebih gampang dicari manual saat mengetik.
  query += pagination ? ` ORDER BY p.created_at DESC` : ` ORDER BY p.name ASC`;

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
  const { name, categoryId, unitPrice, costPrice, commissionPerUnit, isActive } = req.body;

  if (!name || unitPrice === undefined || costPrice === undefined) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name, unitPrice, dan costPrice wajib diisi' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO products (branch_id, name, category_id, unit_price, cost_price, commission_per_unit, is_active)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), COALESCE($7, true))
       RETURNING id, branch_id, name, category_id, unit_price, cost_price, commission_per_unit, is_active, created_at`,
      [req.user.branchId, name, categoryId ?? null, unitPrice, costPrice, commissionPerUnit, isActive]
    );

    res.status(201).json(mapProduct(await withCategoryName(rows[0])));
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'categoryId tidak valid' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_PRODUCT', message: 'Nama produk sudah ada.' });
    }
    throw err;
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name, categoryId, unitPrice, costPrice, commissionPerUnit, isActive } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         category_id = COALESCE($2, category_id),
         unit_price = COALESCE($3, unit_price),
         cost_price = COALESCE($4, cost_price),
         commission_per_unit = COALESCE($5, commission_per_unit),
         is_active = COALESCE($6, is_active)
       WHERE id = $7
       RETURNING id, branch_id, name, category_id, unit_price, cost_price, commission_per_unit, is_active, created_at`,
      [name, categoryId, unitPrice, costPrice, commissionPerUnit, isActive, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Produk tidak ditemukan' });
    }

    res.json(mapProduct(await withCategoryName(rows[0])));
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'INVALID_CATEGORY', message: 'categoryId tidak valid' });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_PRODUCT', message: 'Nama produk sudah ada.' });
    }
    throw err;
  }
};

export const remove = async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await pool.query(
    'SELECT id FROM products WHERE id = $1 AND branch_id = $2',
    [id, req.user.branchId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Produk tidak ditemukan' });
  }

  try {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'PRODUCT_IN_USE',
        message: 'Produk sudah pernah dipakai di transaksi/stok, tidak bisa dihapus.',
      });
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
    costPrice: Number(row.cost_price),
    commissionPerUnit: Number(row.commission_per_unit ?? 0),
    hasUsage: Boolean(row.has_usage),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
