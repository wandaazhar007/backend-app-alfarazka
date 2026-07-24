import cron from 'node-cron';
import pool from '../config/db.js';
import todayJakarta from '../utils/todayJakarta.js';
import * as PushNotificationService from './PushNotificationService.js';

// due_date kolom DATE polos (bukan TIMESTAMPTZ) — beda dari seller_locations.recorded_at,
// jadi perbandingan langsung ke todayJakarta() sudah benar tanpa AT TIME ZONE.
async function checkOverdueReceivables() {
  const date = todayJakarta();

  const { rows } = await pool.query(
    `SELECT s.branch_id, c.name AS customer_name, s.custom_name,
            (r.total_amount - r.amount_paid) AS remaining, r.due_date
     FROM receivables r
     JOIN sales s ON s.id = r.sale_id
     JOIN customers c ON c.id = r.customer_id
     WHERE r.status != 'lunas' AND r.due_date < $1
     ORDER BY s.branch_id, r.due_date ASC`,
    [date]
  );

  const byBranch = new Map();
  for (const row of rows) {
    if (!byBranch.has(row.branch_id)) byBranch.set(row.branch_id, []);
    byBranch.get(row.branch_id).push(row);
  }

  for (const [branchId, receivables] of byBranch) {
    try {
      const formatted = new Intl.NumberFormat('id-ID');
      const lines = receivables
        .map((r) => `${r.customer_name || r.custom_name}: Rp${formatted.format(Number(r.remaining))}`)
        .join(', ');

      await PushNotificationService.notifyRole('owner', branchId, {
        title: 'Piutang Jatuh Tempo',
        body: `${receivables.length} piutang sudah lewat jatuh tempo — ${lines}`,
        data: { type: 'receivable-overdue' },
      });
    } catch (err) {
      console.error(`ReceivableReminderCron gagal notif cabang ${branchId}:`, err.message);
    }
  }
}

export function startReceivableReminderCron() {
  // Jalan tiap hari jam 08:00 WIB — awal jam kerja, supaya Owner bisa langsung
  // tindak lanjut hari itu juga kalau ada piutang yang lewat jatuh tempo.
  cron.schedule(
    '0 8 * * *',
    () => {
      checkOverdueReceivables().catch((err) => console.error('ReceivableReminderCron gagal jalan:', err.message));
    },
    { timezone: 'Asia/Jakarta' }
  );
}

// Diekspor terpisah supaya bisa dites manual tanpa nunggu jadwal cron.
export { checkOverdueReceivables };
