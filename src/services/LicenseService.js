import pool from '../config/db.js';

export async function getStatus(branchId) {
  const { rows } = await pool.query(
    `SELECT l.id, l.status, l.expires_at, l.activated_at, lp.name AS plan_name, lp.duration_days, lp.price
     FROM licenses l
     LEFT JOIN license_plans lp ON lp.id = l.current_plan_id
     WHERE l.branch_id = $1`,
    [branchId]
  );

  if (rows.length === 0) {
    return null;
  }

  return mapStatus(rows[0]);
}

export async function listPlans() {
  const { rows } = await pool.query(
    `SELECT id, name, duration_days, price FROM license_plans WHERE is_active = true ORDER BY duration_days ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    durationDays: row.duration_days,
    price: Number(row.price),
  }));
}

// Renewing before expiration does not forfeit the remaining days:
// the new expires_at = MAX(now, current expires_at) + the plan duration.
export async function extendLicense({ branchId, planId, client }) {
  const runner = client ?? pool;

  const { rows: planRows } = await runner.query('SELECT * FROM license_plans WHERE id = $1', [planId]);
  if (planRows.length === 0) {
    throw Object.assign(new Error('Paket lisensi tidak ditemukan'), { status: 404 });
  }
  const plan = planRows[0];

  const { rows: licenseRows } = await runner.query('SELECT * FROM licenses WHERE branch_id = $1 FOR UPDATE', [
    branchId,
  ]);
  if (licenseRows.length === 0) {
    throw Object.assign(new Error('Lisensi untuk branch ini tidak ditemukan'), { status: 404 });
  }
  const license = licenseRows[0];

  const now = new Date();
  const base = license.expires_at && new Date(license.expires_at) > now ? new Date(license.expires_at) : now;
  const newExpiresAt = new Date(base.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

  const { rows: updated } = await runner.query(
    `UPDATE licenses
     SET status = 'active', current_plan_id = $1, activated_at = COALESCE(activated_at, now()), expires_at = $2, updated_at = now()
     WHERE branch_id = $3
     RETURNING *`,
    [planId, newExpiresAt, branchId]
  );

  return mapStatus({ ...updated[0], plan_name: plan.name, duration_days: plan.duration_days, price: plan.price });
}

function mapStatus(row) {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  const now = new Date();
  const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;

  return {
    status: row.status,
    planName: row.plan_name ?? null,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
    daysLeft,
  };
}
