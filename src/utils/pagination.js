// Opt-in pagination: if the `page` query parameter is not provided, the endpoint
// continues to return a plain array (used by dropdowns/pickers that need the
// full dataset, e.g. the product selector in the store sales form). If `page`
// is provided, the endpoint returns { data, total, page, pageSize } and uses
// LIMIT/OFFSET in the query.
export function getPagination(req) {
  if (req.query.page === undefined) return null;

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(req.query.pageSize, 10) || 10));

  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

// `rows` must include a `full_count` column from `COUNT(*) OVER()` in the SELECT query.
export function extractTotal(rows) {
  return rows.length > 0 ? Number(rows[0].full_count) : 0;
}
