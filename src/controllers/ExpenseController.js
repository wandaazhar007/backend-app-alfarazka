import pool from '../config/db.js';
import { logAudit } from '../middlewares/AuditLogger.js';
import { getPagination, extractTotal } from '../utils/pagination.js';

export const list = async (req, res) => {
  const { date, category_id: categoryId } = req.query;
  const pagination = getPagination(req);

  const params = [];
  const conditions = [];

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    conditions.push(`e.branch_id = $${params.length}`);
  }
  if (date) {
    params.push(date);
    conditions.push(`e.expense_date = $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`e.category_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT e.id, e.branch_id, e.category_id, ec.name AS category_name, e.amount, e.description,
            e.expense_date, e.created_by, e.created_at${pagination ? ', COUNT(*) OVER() AS full_count' : ''}
     FROM expenses e
     JOIN expense_categories ec ON ec.id = e.category_id
     ${whereClause}
     ORDER BY e.expense_date DESC, e.created_at DESC`;

  if (pagination) {
    params.push(pagination.limit, pagination.offset);
    query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }

  const { rows } = await pool.query(query, params);

  if (pagination) {
    return res.json({ data: rows.map(mapExpense), total: extractTotal(rows), page: pagination.page, pageSize: pagination.pageSize });
  }
  res.json(rows.map(mapExpense));
};

export const create = async (req, res) => {
  const { categoryId, amount, description, expenseDate } = req.body;

  if (!categoryId || typeof amount !== 'number' || amount < 0 || !expenseDate) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'categoryId, amount (>= 0), dan expenseDate wajib diisi',
    });
  }

  const { rows } = await pool.query(
    `INSERT INTO expenses (branch_id, category_id, amount, description, expense_date, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, branch_id, category_id, amount, description, expense_date, created_by, created_at`,
    [req.user.branchId, categoryId, amount, description ?? null, expenseDate, req.user.id]
  );

  const expense = rows[0];

  await logAudit(null, {
    userId: req.user.id,
    action: 'create',
    entity: 'expenses',
    entityId: expense.id,
    details: { categoryId, amount, expenseDate },
  });

  const { rows: withCategory } = await pool.query(
    `SELECT e.id, e.branch_id, e.category_id, ec.name AS category_name, e.amount, e.description,
            e.expense_date, e.created_by, e.created_at
     FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE e.id = $1`,
    [expense.id]
  );

  res.status(201).json(mapExpense(withCategory[0]));
};

export const remove = async (req, res) => {
  const { id } = req.params;

  const { rows: existing } = await pool.query(
    'SELECT * FROM expenses WHERE id = $1 AND branch_id = $2',
    [id, req.user.branchId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Pengeluaran tidak ditemukan' });
  }

  await pool.query('DELETE FROM expenses WHERE id = $1', [id]);

  await logAudit(null, {
    userId: req.user.id,
    action: 'delete',
    entity: 'expenses',
    entityId: id,
    details: {
      categoryId: existing[0].category_id,
      amount: Number(existing[0].amount),
      expenseDate: existing[0].expense_date,
    },
  });

  res.status(204).send();
};

function mapExpense(row) {
  return {
    id: row.id,
    branchId: row.branch_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    amount: Number(row.amount),
    description: row.description,
    expenseDate: row.expense_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
