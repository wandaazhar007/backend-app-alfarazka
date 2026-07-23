import pool from '../config/db.js';

export async function insertPings({ sellerId, branchId, pings }) {
  const values = [];
  const placeholders = pings.map((ping, i) => {
    const base = i * 9;
    values.push(
      sellerId,
      branchId,
      ping.latitude,
      ping.longitude,
      ping.accuracy ?? null,
      ping.speed ?? null,
      ping.heading ?? null,
      ping.batteryLevel ?? null,
      ping.recordedAt
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
  });

  const { rows } = await pool.query(
    `INSERT INTO seller_locations
       (seller_id, branch_id, latitude, longitude, accuracy, speed, heading, battery_level, recorded_at)
     VALUES ${placeholders.join(', ')}
     RETURNING id, recorded_at`,
    values
  );

  return rows.map((row) => ({ id: row.id, recordedAt: row.recorded_at }));
}

// Posisi TERAKHIR per penjual (bukan semua baris) — dipakai peta/list Owner.
//
// `recorded_at` adalah TIMESTAMPTZ (instant presisi, beda dari kolom *_date lain
// di app ini yang DATE polos) — server Postgres jalan di UTC, jadi `::date` polos
// tanpa AT TIME ZONE akan salah setiap kali jam WIB (UTC+7) sudah masuk hari
// berikutnya padahal UTC masih hari sebelumnya (mis. jam 03:00 WIB = 20:00 UTC hari
// sebelumnya) — ping yang sebenarnya "hari ini" di WIB jadi tidak ketemu sama sekali.
export async function getLatestPositions({ branchId, date }) {
  const params = [date];
  let branchFilter = '';
  if (branchId) {
    params.push(branchId);
    branchFilter = ` AND se.branch_id = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (sl.seller_id)
            sl.seller_id, u.name AS seller_name, sl.latitude, sl.longitude,
            sl.accuracy, sl.speed, sl.heading, sl.battery_level, sl.recorded_at
     FROM seller_locations sl
     JOIN sellers se ON se.id = sl.seller_id
     JOIN users u ON u.id = se.user_id
     WHERE (sl.recorded_at AT TIME ZONE 'Asia/Jakarta')::date = $1 ${branchFilter}
     ORDER BY sl.seller_id, sl.recorded_at DESC`,
    params
  );

  return rows.map(mapPosition);
}

// Breadcrumb 1 penjual/hari, dipakai polyline peta — LIMIT keras jaga-jaga tracking
// interval yang lebih rapat dari default (60 detik) menghasilkan terlalu banyak titik.
export async function getTrail({ sellerId, date }) {
  const { rows } = await pool.query(
    `SELECT seller_id, latitude, longitude, accuracy, speed, heading, battery_level, recorded_at
     FROM seller_locations
     WHERE seller_id = $1 AND (recorded_at AT TIME ZONE 'Asia/Jakarta')::date = $2
     ORDER BY recorded_at ASC
     LIMIT 2000`,
    [sellerId, date]
  );

  return rows.map(mapPosition);
}

function mapPosition(row) {
  return {
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: row.accuracy !== null ? Number(row.accuracy) : null,
    speed: row.speed !== null ? Number(row.speed) : null,
    heading: row.heading !== null ? Number(row.heading) : null,
    batteryLevel: row.battery_level !== null ? Number(row.battery_level) : null,
    recordedAt: row.recorded_at,
  };
}
