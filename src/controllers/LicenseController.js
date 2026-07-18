import crypto from 'crypto';
import midtransClient from 'midtrans-client';
import pool from '../config/db.js';
import * as LicenseService from '../services/LicenseService.js';
import * as MailService from '../services/MailService.js';

const isDevBypassActive = () => process.env.DISABLE_LICENSE_CHECK === 'true' && process.env.NODE_ENV !== 'production';

export const status = async (req, res) => {
  const license = await LicenseService.getStatus(req.user.branchId);
  const devBypass = isDevBypassActive();
  res.json({
    ...(license ?? { status: 'inactive', planName: null, activatedAt: null, expiresAt: null, daysLeft: null }),
    devBypass,
  });
};

export const plans = async (req, res) => {
  const rows = await LicenseService.listPlans();
  res.json(rows);
};

export const checkout = async (req, res) => {
  const { planId } = req.body;

  if (!planId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'planId wajib diisi' });
  }

  const allPlans = await LicenseService.listPlans();
  const plan = allPlans.find((p) => p.id === planId);
  if (!plan) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Paket lisensi tidak ditemukan' });
  }

  const { rows: licenseRows } = await pool.query('SELECT id FROM licenses WHERE branch_id = $1', [
    req.user.branchId,
  ]);
  if (licenseRows.length === 0) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'Lisensi untuk organisasi ini tidak ditemukan' });
  }

  // Midtrans order_id max 50 karakter — branchId penuh (UUID, 36 karakter) bikin ini
  // kepanjangan (54 karakter), jadi dipotong ke 8 karakter pertama saja (tetap cukup
  // unik dikombinasikan dengan timestamp, dan masih bisa dikenali manual di dashboard).
  const orderId = `LIC-${req.user.branchId.slice(0, 8)}-${Date.now()}`;

  const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
  });

  try {
    const transaction = await snap.createTransaction({
      transaction_details: { order_id: orderId, gross_amount: plan.price },
      customer_details: { email: req.user.email, first_name: req.user.name },
    });

    await pool.query(
      `INSERT INTO license_payments (license_id, plan_id, midtrans_order_id, amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [licenseRows[0].id, planId, orderId, plan.price]
    );

    res.json({ snapToken: transaction.token, redirectUrl: transaction.redirect_url, orderId });
  } catch (err) {
    res.status(502).json({ error: 'MIDTRANS_ERROR', message: err.message });
  }
};

// Midtrans mewajibkan webhook SELALU dijawab HTTP 200 supaya dianggap "terkirim sukses"
// (termasuk oleh fitur "Test Notification URL" di dashboard mereka) — notifikasi yang
// tidak valid (payload kurang lengkap, signature tidak cocok, order tidak dikenal) harus
// di-IGNORE secara internal, BUKAN ditolak dengan status error, walau begitu Midtrans akan
// menganggap pengiriman gagal dan retry terus/melaporkan endpoint bermasalah.
// Ref: https://docs.midtrans.com/reference/handle-notifications
export const midtransCallback = async (req, res) => {
  try {
    const { order_id: orderId, status_code: statusCode, gross_amount: grossAmount, signature_key: signatureKey } =
      req.body;

    if (!orderId || !statusCode || !grossAmount || !signatureKey) {
      console.warn('Midtrans webhook diabaikan: payload tidak lengkap', req.body);
      return res.status(200).json({ received: true, ignored: 'incomplete_payload' });
    }

    const expectedSignature = crypto
      .createHash('sha512')
      .update(`${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`)
      .digest('hex');

    if (signatureKey !== expectedSignature) {
      console.warn('Midtrans webhook diabaikan: signature tidak valid untuk order', orderId);
      return res.status(200).json({ received: true, ignored: 'invalid_signature' });
    }

    const { rows: paymentRows } = await pool.query('SELECT * FROM license_payments WHERE midtrans_order_id = $1', [
      orderId,
    ]);
    if (paymentRows.length === 0) {
      console.warn('Midtrans webhook diabaikan: order tidak ditemukan', orderId);
      return res.status(200).json({ received: true, ignored: 'order_not_found' });
    }
    const payment = paymentRows[0];

    const transactionStatus = req.body.transaction_status;

    const isPaid = ['settlement', 'capture'].includes(transactionStatus);

    await pool.query(
      `UPDATE license_payments
       SET status = $1,
           midtrans_transaction_id = $2,
           payment_method = $3,
           paid_at = CASE WHEN $6 THEN now() ELSE paid_at END,
           raw_notification = $4
       WHERE id = $5`,
      [
        transactionStatus,
        req.body.transaction_id ?? null,
        req.body.payment_type ?? null,
        JSON.stringify(req.body),
        payment.id,
        isPaid,
      ]
    );

    if (isPaid) {
      const { rows: licenseRows } = await pool.query('SELECT * FROM licenses WHERE id = $1', [payment.license_id]);
      const branchId = licenseRows[0].branch_id;

      const extended = await LicenseService.extendLicense({ branchId, planId: payment.plan_id });

      const { rows: ownerRows } = await pool.query(
        `SELECT u.email, b.name AS branch_name
         FROM users u
         JOIN branches b ON b.id = u.branch_id
         JOIN roles r ON r.id = u.role_id
         WHERE u.branch_id = $1 AND r.name = 'owner'
         LIMIT 1`,
        [branchId]
      );

      try {
        await MailService.sendPaymentSuccessEmail({
          clientEmail: ownerRows[0]?.email,
          branchName: ownerRows[0]?.branch_name ?? 'Alfarazka Bakery',
          planName: extended.planName,
          amount: payment.amount,
          expiresAt: extended.expiresAt,
        });
      } catch (err) {
        console.error('Gagal kirim email sukses bayar:', err.message);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Tetap balas 200 ke Midtrans supaya tidak dianggap gagal terkirim/di-retry terus —
    // errornya sendiri tetap harus terlihat di log server untuk investigasi manual.
    console.error('Midtrans webhook: error tak terduga saat memproses notifikasi:', err);
    res.status(200).json({ received: true, error: 'internal_error_logged' });
  }
};

export const payments = async (req, res) => {
  const { rows: licenseRows } = await pool.query('SELECT id FROM licenses WHERE branch_id = $1', [
    req.user.branchId,
  ]);
  if (licenseRows.length === 0) {
    return res.json([]);
  }

  const { rows } = await pool.query(
    `SELECT lp.id, lp.plan_id, plans.name AS plan_name, lp.midtrans_order_id, lp.midtrans_transaction_id,
            lp.payment_method, lp.amount, lp.status, lp.paid_at, lp.created_at
     FROM license_payments lp
     JOIN license_plans plans ON plans.id = lp.plan_id
     WHERE lp.license_id = $1
     ORDER BY lp.created_at DESC`,
    [licenseRows[0].id]
  );

  res.json(
    rows.map((row) => ({
      id: row.id,
      planId: row.plan_id,
      planName: row.plan_name,
      orderId: row.midtrans_order_id,
      transactionId: row.midtrans_transaction_id,
      paymentMethod: row.payment_method,
      amount: Number(row.amount),
      status: row.status,
      paidAt: row.paid_at,
      createdAt: row.created_at,
    }))
  );
};
