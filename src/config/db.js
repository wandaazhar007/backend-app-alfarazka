import pg from 'pg';

const { Pool, types } = pg;

// Return DATE columns as the raw 'YYYY-MM-DD' string instead of a JS Date
// object — pg's default parser builds a Date at local midnight, which then
// serializes with a timezone-dependent offset (e.g. shifts the calendar day).
types.setTypeParser(types.builtins.DATE, (val) => val);

// max eksplisit di bawah limit sesi pooler Supabase (15) supaya selalu ada
// headroom untuk koneksi lain (dashboard Supabase, script verifikasi manual,
// dll) — bukan cuma mengandalkan default pg (10) yang pas-pasan kalau ada
// beberapa request lain nempel di limit yang sama.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 8,
  idleTimeoutMillis: 10000,
});

export default pool;
