export default function todayJakarta() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// Calendar-safe: works off the Jakarta Y-M-D string, not the server's local
// timezone, so it's correct regardless of where the process actually runs.
export function yesterdayJakarta() {
  const [y, m, d] = todayJakarta().split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}
