import pool from '../config/db.js';

export const list = async (req, res) => {
  const { rows } = await pool.query(`SELECT id, name FROM expense_categories ORDER BY id ASC`);
  res.json(rows);
};
