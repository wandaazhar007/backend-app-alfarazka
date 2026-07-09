import pool from '../config/db.js';

export const list = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, address, is_active, created_at FROM branches ORDER BY created_at ASC`
  );
  res.json(rows.map(mapBranch));
};

export const create = async (req, res) => {
  const { name, address, isActive } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'name wajib diisi' });
  }

  const { rows } = await pool.query(
    `INSERT INTO branches (name, address, is_active)
     VALUES ($1, $2, COALESCE($3, true))
     RETURNING id, name, address, is_active, created_at`,
    [name, address ?? null, isActive]
  );

  res.status(201).json(mapBranch(rows[0]));
};

function mapBranch(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
