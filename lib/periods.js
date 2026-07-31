// Period → date range + chart buckets + previous-period range for deltas.

export const PERIODS = ['day', 'week', 'month', 'quarter', 'year', 'all'];

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

function businessStart() {
  const raw = process.env.BUSINESS_START || '2024-01-01';
  const d = new Date(`${raw}T00:00:00`);
  return isNaN(d) ? new Date('2024-01-01T00:00:00') : d;
}

export function getRange(period, now = new Date()) {
  const today = startOfDay(now);
  let start, prevStart, prevEnd;

  switch (period) {
    case 'day':
      start = today;
      prevStart = addDays(today, -1);
      prevEnd = today;
      break;
    case 'week': {
      // Week starts Monday
      const dow = (today.getDay() + 6) % 7;
      start = addDays(today, -dow);
      prevStart = addDays(start, -7);
      prevEnd = start;
      break;
    }
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      prevStart = addMonths(start, -1);
      prevEnd = start;
      break;
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), q * 3, 1);
      prevStart = addMonths(start, -3);
      prevEnd = start;
      break;
    }
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      prevStart = new Date(today.getFullYear() - 1, 0, 1);
      prevEnd = start;
      break;
    case 'all':
    default:
      start = businessStart();
      prevStart = null;
      prevEnd = null;
      break;
  }

  return { start, end: now, prevStart, prevEnd, buckets: makeBuckets(period, start, now) };
}

function makeBuckets(period, start, end) {
  const buckets = [];
  const push = (s, e, label) => buckets.push({ start: s, end: e, label });

  if (period === 'day') {
    for (let h = 0; h < 24; h += 2) {
      const s = new Date(start); s.setHours(h);
      const e = new Date(start); e.setHours(h + 2);
      if (s > end) break;
      push(s, e, `${h}:00`);
    }
  } else if (period === 'week') {
    for (let i = 0; i < 7; i++) {
      const s = addDays(start, i);
      if (s > end) break;
      push(s, addDays(s, 1), s.toLocaleDateString('en-US', { weekday: 'short' }));
    }
  } else if (period === 'month') {
    const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (let i = 0; i < days; i++) {
      const s = addDays(start, i);
      if (s > end) break;
      push(s, addDays(s, 1), String(i + 1));
    }
  } else if (period === 'quarter') {
    let s = new Date(start);
    let i = 1;
    while (s < end) {
      const e = addDays(s, 7);
      push(s, e, `W${i++}`);
      s = e;
    }
  } else {
    // year & all-time: monthly buckets (capped at 48 for sanity)
    let s = new Date(start.getFullYear(), start.getMonth(), 1);
    let count = 0;
    while (s < end && count < 48) {
      const e = addMonths(s, 1);
      push(s, e, s.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
      s = e;
      count++;
    }
  }
  return buckets;
}

export function countBusinessDays(start, end) {
  let count = 0;
  const d = startOfDay(start);
  while (d < end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

export function monthsBetween(start, end) {
  return Math.max(
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1,
    1
  );
}

// Prorate a monthly break-even target onto an arbitrary period.
export function prorateMonthlyTarget(monthly, period, range) {
  const annual = monthly * 12;
  switch (period) {
    case 'day': return annual / 365;
    case 'week': return annual / 52;
    case 'month': return monthly;
    case 'quarter': return monthly * 3;
    case 'year': return annual;
    case 'all': return monthly * monthsBetween(range.start, range.end);
    default: return monthly;
  }
}
