import pool from '../config/db.js';
import { logAudit } from '../middlewares/AuditLogger.js';
import { getPagination, extractTotal } from '../utils/pagination.js';
import * as ReportExportService from '../services/ReportExportService.js';

const MEAL_ALLOWANCE_CATEGORY = 'Uang Makan Penjual';

export const list = async (req, res) => {
  const { date, from, to, category_id: categoryId, seller_id: sellerId } = req.query;
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
  if (from && to) {
    params.push(from, to);
    conditions.push(`e.expense_date BETWEEN $${params.length - 1} AND $${params.length}`);
  }
  if (categoryId) {
    params.push(categoryId);
    conditions.push(`e.category_id = $${params.length}`);
  }
  if (sellerId) {
    params.push(sellerId);
    conditions.push(`e.seller_id = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let query = `SELECT e.id, e.branch_id, e.category_id, ec.name AS category_name, e.amount, e.description,
            e.seller_id, e.expense_date, e.created_by, e.created_at${
              pagination
                ? `, COUNT(*) OVER() AS full_count,
                   SUM(e.amount) OVER() AS total_amount_all,
                   SUM(CASE WHEN ec.name = '${MEAL_ALLOWANCE_CATEGORY}' THEN e.amount ELSE 0 END) OVER() AS total_meal_allowance`
                : ''
            }
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
    const totalAmount = rows.length > 0 ? Number(rows[0].total_amount_all) : 0;
    const totalMealAllowance = rows.length > 0 ? Number(rows[0].total_meal_allowance) : 0;
    return res.json({
      data: rows.map(mapExpense),
      total: extractTotal(rows),
      totalAmount,
      totalMealAllowance,
      totalOther: totalAmount - totalMealAllowance,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  }
  res.json(rows.map(mapExpense));
};

export const exportExpenses = async (req, res) => {
  const { from, to, format } = req.query;

  if (!from || !to) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query param from dan to wajib diisi' });
  }
  if (!['pdf', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: "Query param format wajib 'pdf' atau 'xlsx'" });
  }

  const params = [from, to];
  const conditions = [`e.expense_date BETWEEN $1 AND $2`];

  if (req.user.role !== 'owner') {
    params.push(req.user.branchId);
    conditions.push(`e.branch_id = $${params.length}`);
  }

  const { rows } = await pool.query(
    `SELECT e.id, e.category_id, ec.name AS category_name, e.amount, e.description, e.expense_date
     FROM expenses e
     JOIN expense_categories ec ON ec.id = e.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY e.expense_date ASC, e.created_at ASC`,
    params
  );

  const expenses = rows.map(mapExpense);
  const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalMealAllowance = expenses
    .filter((e) => e.categoryName === MEAL_ALLOWANCE_CATEGORY)
    .reduce((sum, e) => sum + e.amount, 0);
  const totals = { totalAmount, totalMealAllowance, totalOther: totalAmount - totalMealAllowance };

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="pengeluaran-${from}_${to}.pdf"`);
    return ReportExportService.generateExpensesPdfReport(res, { from, to, expenses, totals });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="pengeluaran-${from}_${to}.xlsx"`);
  await ReportExportService.generateExpensesExcelReport(res, { from, to, expenses, totals });
};

export const create = async (req, res) => {
  const { categoryId, amount, description, expenseDate, sellerId } = req.body;

  if (!categoryId || typeof amount !== 'number' || amount < 0 || !expenseDate) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'categoryId, amount (>= 0), dan expenseDate wajib diisi',
    });
  }

  let rows;
  try {
    ({ rows } = await pool.query(
      `INSERT INTO expenses (branch_id, category_id, amount, description, expense_date, seller_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, branch_id, category_id, amount, description, seller_id, expense_date, created_by, created_at`,
      [req.user.branchId, categoryId, amount, description ?? null, expenseDate, sellerId ?? null, req.user.id]
    ));
  } catch (err) {
    // unique_violation (expenses_seller_meal_unique) — penjual ini sudah pernah
    // diinput uang makan di tanggal yang sama.
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'MEAL_ALLOWANCE_ALREADY_GIVEN',
        message: 'Penjual ini sudah mendapatkan uang makan pada tanggal ini.',
      });
    }
    throw err;
  }

  const expense = rows[0];

  await logAudit(null, {
    userId: req.user.id,
    action: 'create',
    entity: 'expenses',
    entityId: expense.id,
    details: { categoryId, amount, expenseDate, sellerId },
  });

  const { rows: withCategory } = await pool.query(
    `SELECT e.id, e.branch_id, e.category_id, ec.name AS category_name, e.amount, e.description,
            e.seller_id, e.expense_date, e.created_by, e.created_at
     FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE e.id = $1`,
    [expense.id]
  );

  res.status(201).json(mapExpense(withCategory[0]));
};

export const update = async (req, res) => {
  const { id } = req.params;
  const { categoryId, amount, description, expenseDate } = req.body;

  if (!categoryId || typeof amount !== 'number' || amount < 0 || !expenseDate) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'categoryId, amount (>= 0), dan expenseDate wajib diisi',
    });
  }

  const { rows: existing } = await pool.query(
    'SELECT * FROM expenses WHERE id = $1 AND branch_id = $2',
    [id, req.user.branchId]
  );

  if (existing.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Pengeluaran tidak ditemukan' });
  }

  await pool.query(
    `UPDATE expenses SET category_id = $1, amount = $2, description = $3, expense_date = $4 WHERE id = $5`,
    [categoryId, amount, description ?? null, expenseDate, id]
  );

  await logAudit(null, {
    userId: req.user.id,
    action: 'update',
    entity: 'expenses',
    entityId: id,
    details: { categoryId, amount, expenseDate },
  });

  const { rows: withCategory } = await pool.query(
    `SELECT e.id, e.branch_id, e.category_id, ec.name AS category_name, e.amount, e.description,
            e.expense_date, e.created_by, e.created_at
     FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id WHERE e.id = $1`,
    [id]
  );

  res.json(mapExpense(withCategory[0]));
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
    sellerId: row.seller_id ?? null,
    expenseDate: row.expense_date,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}
