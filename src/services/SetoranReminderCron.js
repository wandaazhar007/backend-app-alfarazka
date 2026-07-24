import cron from 'node-cron';
import pool from '../config/db.js';
import todayJakarta from '../utils/todayJakarta.js';
import * as PushNotificationService from './PushNotificationService.js';

// Penjual yang belum setor jam 7 malam WIB itu sinyal masalah (uang belum
// disetor, penjual belum pulang, dll) — BEDA dari stok pagi yang sengaja TIDAK
// diberi peringatan serupa karena penjual libur = wajar tidak ambil stok pagi.
async function checkUnsettledSellers() {
  const date = todayJakarta();

  const { rows: branches } = await pool.query('SELECT id, name FROM branches WHERE is_active = true');

  for (const branch of branches) {
    try {
      const { rows: unsettled } = await pool.query(
        `SELECT u.name
         FROM sellers se
         JOIN users u ON u.id = se.user_id
         WHERE se.branch_id = $1 AND se.is_active = true
           AND NOT EXISTS (
             SELECT 1 FROM sales s
             WHERE s.seller_id = se.id AND s.sale_date = $2 AND s.sale_type = 'keliling'
           )`,
        [branch.id, date]
      );

      if (unsettled.length === 0) continue;

      const names = unsettled.map((r) => r.name).join(', ');
      await PushNotificationService.notifyRole('owner', branch.id, {
        title: 'Penjual Belum Setor',
        body: `Sampai jam 7 malam, belum setor: ${names}`,
        data: { type: 'unsettled-sellers' },
      });
    } catch (err) {
      console.error(`SetoranReminderCron gagal cek cabang ${branch.id}:`, err.message);
    }
  }
}

export function startSetoranReminderCron() {
  // Jalan tiap hari jam 19:00 WIB.
  cron.schedule(
    '0 19 * * *',
    () => {
      checkUnsettledSellers().catch((err) => console.error('SetoranReminderCron gagal jalan:', err.message));
    },
    { timezone: 'Asia/Jakarta' }
  );
}

// Diekspor terpisah supaya bisa dites manual tanpa nunggu jadwal cron.
export { checkUnsettledSellers };
