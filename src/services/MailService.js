import nodemailer from 'nodemailer';

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

// All email-sending functions are wrapped in try/catch by the caller (not here)
// so email delivery failures (SMTP down, App Password not configured, etc.)
// never interrupt the main business flow (Midtrans webhook, reminder cron jobs).
async function send({ to, subject, html }) {
  const recipients = Array.isArray(to) ? to.join(',') : to;
  await getTransporter().sendMail({
    from: `Alfarazka Bakery <${process.env.SMTP_USER}>`,
    to: recipients,
    subject,
    html,
  });
}

export async function sendPaymentSuccessEmail({ clientEmail, branchName, planName, amount, expiresAt }) {
  const vendorEmail = process.env.VENDOR_EMAIL;
  const formattedAmount = `Rp ${Number(amount).toLocaleString('id-ID')}`;
  const formattedExpiry = new Date(expiresAt).toLocaleDateString('id-ID');

  await send({
    to: [clientEmail, vendorEmail].filter(Boolean),
    subject: `Lisensi ${branchName} berhasil diperpanjang`,
    html: `
      <p>Pembayaran lisensi untuk <strong>${branchName}</strong> berhasil diproses.</p>
      <ul>
        <li>Paket: ${planName}</li>
        <li>Nominal: ${formattedAmount}</li>
        <li>Aktif sampai: ${formattedExpiry}</li>
      </ul>
    `,
  });
}

export async function sendReminderEmail({ clientEmail, branchName, daysLeft, expiresAt }) {
  const formattedExpiry = new Date(expiresAt).toLocaleDateString('id-ID');

  await send({
    to: clientEmail,
    subject: `Lisensi ${branchName} akan berakhir dalam ${daysLeft} hari`,
    html: `
      <p>Lisensi aplikasi untuk <strong>${branchName}</strong> akan berakhir pada <strong>${formattedExpiry}</strong> (${daysLeft} hari lagi).</p>
      <p>Silakan perpanjang lisensi sebelum tanggal tersebut agar tidak terjadi gangguan penggunaan aplikasi.</p>
    `,
  });
}

export async function sendExpiredEmail({ clientEmail, branchName }) {
  const vendorEmail = process.env.VENDOR_EMAIL;

  await send({
    to: [clientEmail, vendorEmail].filter(Boolean),
    subject: `Lisensi ${branchName} telah berakhir`,
    html: `
      <p>Masa aktif lisensi aplikasi untuk <strong>${branchName}</strong> telah berakhir.</p>
      <p>Data Anda tetap aman dan tidak hilang. Silakan perpanjang lisensi untuk kembali menggunakan seluruh fitur.</p>
    `,
  });
}
