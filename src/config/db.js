import pg from 'pg';

const { Pool, types } = pg;

// Return DATE columns as the raw 'YYYY-MM-DD' string instead of a JS Date
// object — pg's default parser builds a Date at local midnight, which then
// serializes with a timezone-dependent offset (e.g. shifts the calendar day).
types.setTypeParser(types.builtins.DATE, (val) => val);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default pool;
