import cron from 'node-cron';
import pool from '../config/db.js';
import * as MailService from '../services/MailService.js';

const REMINDER_DAYS = [7, 3, 1];

async function checkLicenses() {
  const { rows } = await pool.query(
    `SELECT l.id, l.branch_id, l.status, l.expires_at, b.name AS branch_name,
            (SELECT email FROM users u JOIN roles r ON r.id = u.role_id WHERE u.branch_id = l.branch_id AND r.name = 'owner' LIMIT 1) AS owner_email
     FROM licenses l
     JOIN branches b ON b.id = l.branch_id
     WHERE l.status = 'active' AND l.expires_at IS NOT NULL`
  );

  const now = new Date();

  for (const license of rows) {
    const expiresAt = new Date(license.expires_at);
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    if (daysLeft < 0) {
      await pool.query(`UPDATE licenses SET status = 'expired', updated_at = now() WHERE id = $1`, [license.id]);

      try {
        await MailService.sendExpiredEmail({ clientEmail: license.owner_email, branchName: license.branch_name });
      } catch (err) {
        console.error(`Gagal kirim email expired untuk branch ${license.branch_id}:`, err.message);
      }
      continue;
    }

    if (REMINDER_DAYS.includes(daysLeft)) {
      try {
        await MailService.sendReminderEmail({
          clientEmail: license.owner_email,
          branchName: license.branch_name,
          daysLeft,
          expiresAt: license.expires_at,
        });
      } catch (err) {
        console.error(`Gagal kirim email reminder untuk branch ${license.branch_id}:`, err.message);
      }
    }
  }
}

export function startLicenseCron() {
  // Runs every day at 7:00 AM server time.
  cron.schedule('0 7 * * *', () => {
    checkLicenses().catch((err) => console.error('LicenseCron gagal jalan:', err.message));
  });
}

// Exported separately so it can be called manually during verification/testing
// without waiting for the scheduled cron job.
export { checkLicenses };
