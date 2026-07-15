import cron from 'node-cron';
import pool from '../config/db.js';
import { yesterdayJakarta } from '../utils/todayJakarta.js';
import * as DailyClosingService from './DailyClosingService.js';

async function autoGenerateClosings() {
  const { rows: branches } = await pool.query('SELECT id FROM branches WHERE is_active = true');
  const closingDate = yesterdayJakarta();

  for (const branch of branches) {
    try {
      await DailyClosingService.generateClosing({ branchId: branch.id, closingDate, createdBy: null });
    } catch (err) {
      console.error(`DailyClosingCron gagal generate closing cabang ${branch.id}:`, err.message);
    }
  }
}

export function startDailyClosingCron() {
  // Jalan tiap hari jam 00:10 WIB — sedikit setelah tengah malam supaya tanggal
  // "kemarin" (yang baru saja selesai) datanya sudah lengkap. Jaring pengaman kalau
  // admin lupa klik "Generate / Hitung Ulang" manual di halaman Tutup Buku — idempotent
  // (upsert per branch_id+closing_date), jadi tidak menimpa koreksi manual berikutnya.
  cron.schedule(
    '10 0 * * *',
    () => {
      autoGenerateClosings().catch((err) => console.error('DailyClosingCron gagal jalan:', err.message));
    },
    { timezone: 'Asia/Jakarta' }
  );
}

// Diekspor terpisah supaya bisa dites manual tanpa nunggu jadwal cron.
export { autoGenerateClosings };
