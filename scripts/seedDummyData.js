import 'dotenv/config';
import pool from '../src/config/db.js';

// Dummy data for testing consolidated reports — NOT a migration (can be run
// multiple times; categories/products/sales reps are idempotent, but
// stock_movements and expenses will insert new rows on every run because
// those tables don't have a natural unique constraint for deduplication).

const SELLER_NAMES = [
  'Agus Setiawan',
  'Budi Santoso',
  'Citra Dewi',
  'Dedi Kurniawan',
  'Eka Putri',
  'Fajar Ramadhan',
  'Gita Lestari',
  'Hendra Wijaya',
  'Indah Permata',
  'Joko Susilo',
];

const CATEGORY_NAMES = ['Roti Manis', 'Roti Tawar', 'Donat', 'Kue Kering', 'Pastry'];

const PRODUCTS = [
  { name: 'Roti Coklat', category: 'Roti Manis', price: 6000 },
  { name: 'Roti Keju', category: 'Roti Manis', price: 7000 },
  { name: 'Roti Tawar Gandum', category: 'Roti Tawar', price: 15000 },
  { name: 'Roti Tawar Original', category: 'Roti Tawar', price: 13000 },
  { name: 'Donat Gula', category: 'Donat', price: 4000 },
  { name: 'Donat Coklat', category: 'Donat', price: 5000 },
  { name: 'Nastar', category: 'Kue Kering', price: 45000 },
  { name: 'Kastengel', category: 'Kue Kering', price: 50000 },
  { name: 'Croissant', category: 'Pastry', price: 12000 },
  { name: 'Danish Pastry', category: 'Pastry', price: 14000 },
];

// Sengaja EXCLUDE 'uang_makan_penjual' — kategori itu dihitung otomatis
// (7 penjual x Rp20.000) lewat alur lain, bukan input manual acak.
const EXPENSE_CATEGORY_NAMES = ['bahan_baku', 'gaji', 'sewa', 'listrik_air', 'maintenance', 'lain_lain'];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function randomDateWithinLastDays(days) {
  const d = new Date();
  d.setDate(d.getDate() - randInt(0, days));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function run() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows: branchRows } = await client.query('SELECT id FROM branches ORDER BY created_at LIMIT 1');
    if (branchRows.length === 0) {
      throw new Error('Tidak ada branch di database — jalankan `npm run db:migrate` dulu (seed.sql insert branch default).');
    }
    const branchId = branchRows[0].id;

    const { rows: roleRows } = await client.query(`SELECT id FROM roles WHERE name = 'seller'`);
    if (roleRows.length === 0) {
      throw new Error("Role 'seller' tidak ditemukan — jalankan `npm run db:migrate` dulu.");
    }
    const sellerRoleId = roleRows[0].id;

    const { rows: adminRows } = await client.query(
      `SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name IN ('admin', 'owner') ORDER BY u.created_at LIMIT 1`
    );
    const createdBy = adminRows[0]?.id ?? null;

    // ---- 5 kategori produk ----
    const categoryIdByName = {};
    for (const name of CATEGORY_NAMES) {
      const { rows } = await client.query(
        `INSERT INTO product_categories (branch_id, name) VALUES ($1, $2)
         ON CONFLICT (branch_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [branchId, name]
      );
      categoryIdByName[name] = rows[0].id;
    }

    // ---- 10 produk ----
    const productIds = [];
    for (const p of PRODUCTS) {
      const { rows: existing } = await client.query(`SELECT id FROM products WHERE branch_id = $1 AND name = $2`, [
        branchId,
        p.name,
      ]);
      if (existing.length > 0) {
        productIds.push(existing[0].id);
        continue;
      }
      const { rows } = await client.query(
        `INSERT INTO products (branch_id, name, category_id, unit_price) VALUES ($1, $2, $3, $4) RETURNING id`,
        [branchId, p.name, categoryIdByName[p.category], p.price]
      );
      productIds.push(rows[0].id);
    }

    // ---- 10 penjual (users + sellers) ----
    const sellerIds = [];
    for (let i = 0; i < SELLER_NAMES.length; i++) {
      const name = SELLER_NAMES[i];
      const email = `seed.seller${i + 1}@dummy.local`;
      const firebaseUid = `seed-seller-${i + 1}`;

      const { rows: userRows } = await client.query(
        `INSERT INTO users (firebase_uid, branch_id, role_id, name, email)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [firebaseUid, branchId, sellerRoleId, name, email]
      );
      const userId = userRows[0].id;

      const { rows: sellerRows } = await client.query(
        `INSERT INTO sellers (user_id, branch_id, qris_terminal_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE SET qris_terminal_id = EXCLUDED.qris_terminal_id
         RETURNING id`,
        [userId, branchId, `QRIS-${String(i + 1).padStart(3, '0')}`]
      );
      sellerIds.push(sellerRows[0].id);
    }

    // ---- 20 mobile inventory transactions (morning qty_out + evening qty_returned) ----
    // One stock_movements row = one complete mobile inventory transaction (morning & evening),
    // based on the table design in docs/01_DATA_MODEL.md.
    for (let i = 0; i < 20; i++) {
      const sellerId = pick(sellerIds);
      const productId = pick(productIds);
      const date = randomDateWithinLastDays(9);
      const qtyOut = randInt(10, 40);
      const qtyReturned = randInt(0, Math.floor(qtyOut * 0.3));

      await client.query(
        `INSERT INTO stock_movements (branch_id, seller_id, product_id, movement_date, qty_out, qty_returned, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [branchId, sellerId, productId, date, qtyOut, qtyReturned, createdBy]
      );
    }

    // ---- 5 pengeluaran ----
    const { rows: expenseCategoryRows } = await client.query(`SELECT id, name FROM expense_categories WHERE name = ANY($1)`, [
      EXPENSE_CATEGORY_NAMES,
    ]);
    for (let i = 0; i < 5; i++) {
      const cat = pick(expenseCategoryRows);
      const amount = randInt(50, 500) * 1000;
      const date = randomDateWithinLastDays(9);

      await client.query(
        `INSERT INTO expenses (branch_id, category_id, amount, description, expense_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [branchId, cat.id, amount, `Pengeluaran ${cat.name} (dummy seed)`, date, createdBy]
      );
    }

    await client.query('COMMIT');

    console.log('Dummy data berhasil di-seed:');
    console.log(`- ${CATEGORY_NAMES.length} kategori produk`);
    console.log(`- ${productIds.length} produk`);
    console.log(`- ${sellerIds.length} penjual`);
    console.log('- 20 stock_movements (pagi + sore)');
    console.log('- 5 pengeluaran');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Gagal seed dummy data:', err.message);
  process.exit(1);
});
