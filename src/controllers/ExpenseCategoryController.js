import pool from '../config/db.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { search } = req.query;
  const pagination = getPagination(req);
  const params = [];
  let query = `
    SELECT ec.id, ec.name,
           EXISTS (SELECT 1 FROM expenses e WHERE e.category_id = ec.id) AS has_usage${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
    FROM expense_categories ec
  `;

  if (search) {
    params.push(`%${search}%`);
    query += ` WHERE ec.name ILIKE $${params.length}`;
  }

  // Tabel Kelola Kategori Pengeluaran (paginated) tampilkan yang terbaru dulu — tabel
  // ini tidak punya kolom created_at, jadi `id` SERIAL dipakai sebagai proksi urutan
  // waktu insert. Dropdown Kategori di ExpensesPage (panggil endpoint ini TANPA `page`)
  // tetap alfabetis, lebih gampang dicari manual saat mengetik.
  query += pagination ? ` ORDER BY ec.id DESC` : ` ORDER BY ec.name ASC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return res.json({ data: rows.map(mapCategory), total: extractTotal(rows), page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(rows.map(mapCategory));
};

export const create = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name wajib diisi' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO expense_categories (name) VALUES ($1) RETURNING id, name`,
      [name]
    );

    res.status(201).json(mapCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Nama kategori sudah ada.' });
    }
    throw err;
  }
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE expense_categories SET name = COALESCE($1, name) WHERE id = $2 RETURNING id, name`,
      [name, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Kategori tidak ditemukan' });
    }

    res.json(mapCategory(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'DUPLICATE_CATEGORY', message: 'Nama kategori sudah ada.' });
    }
    throw err;
  }
};

export const remove = async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await pool.query('SELECT id FROM expense_categories WHERE id = $1', [id]);

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Kategori tidak ditemukan' });
  }

  try {
    await pool.query('DELETE FROM expense_categories WHERE id = $1', [id]);
    res.status(204).send();
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'CATEGORY_IN_USE',
        message: 'Kategori masih dipakai di data pengeluaran, tidak bisa dihapus.',
      });
    }
    throw err;
  }
};

function mapCategory(row) {
  return {
    id: row.id,
    name: row.name,
    hasUsage: Boolean(row.has_usage),
  };
}
