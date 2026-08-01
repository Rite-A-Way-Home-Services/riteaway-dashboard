import { NextResponse } from 'next/server';
import { getEstimates, hcpConfigured } from '@/lib/housecall';
import { getRange, PERIODS } from '@/lib/periods';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 300_000;

function cache() {
  if (!globalThis.__estCache) globalThis.__estCache = new Map();
  return globalThis.__estCache;
}

function money(cents) {
  const n = Number(cents || 0);
  return Number.isFinite(n) ? n / 100 : 0;
}

function personName(p) {
  if (!p) return '';
  return [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.company || '';
}

// HCP option totals live under estimate.options[]; fall back to flat fields.
function estimateTotal(e) {
  if (Array.isArray(e.options) && e.options.length) {
    const approved = e.options.find((o) => o.approved) || e.options[0];
    return money(approved?.total_amount ?? approved?.total ?? 0);
  }
  return money(e.total_amount ?? e.total ?? 0);
}

function mock() {
  const names = ['J. Alvarez', 'M. Chen', 'D. Whitfield', 'S. Patel', 'R. Nguyen', 'K. Boone'];
  const cities = ['Tempe', 'Mesa', 'Phoenix', 'Peoria', 'Chandler'];
  const statuses = ['pro sent', 'approved', 'declined', 'pro sent'];
  return names.map((n, i) => ({
    id: `mock_${i}`,
    number: `EST-10${20 + i}`,
    customer: n,
    city: cities[i % cities.length],
    total: 400 + i * 735,
    status: statuses[i % statuses.length],
    createdAt: new Date(Date.now() - i * 2 * 864e5).toISOString(),
  }));
}

export async function GET(req) {
  const params = req.nextUrl.searchParams;
  const period = params.get('period') || 'month';
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: 'bad period' }, { status: 400 });
  }
  const custom =
    period === 'custom' ? { from: params.get('from'), to: params.get('to') } : null;

  const key = custom ? `custom:${custom.from}:${custom.to}` : period;
  const hit = cache().get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  try {
    const range = getRange(period, new Date(), custom);

    if (!hcpConfigured()) {
      const data = { mode: 'mock', estimates: mock(), totals: summarize(mock()) };
      return NextResponse.json(data);
    }

    const raw = await getEstimates(range.start, range.end);
    const estimates = raw
      .map((e) => ({
        id: e.id,
        number: e.estimate_number || e.number || '',
        customer: personName(e.customer),
        city: e.address?.city || '',
        total: estimateTotal(e),
        status: String(e.work_status || e.status || '').replace(/_/g, ' '),
        createdAt: e.created_at || null,
      }))
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    const data = { mode: 'live', estimates, totals: summarize(estimates) };
    cache().set(key, { data, ts: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    if (/date|from and to/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

function summarize(list) {
  const isApproved = (s) => /approv|accept|won/i.test(s || '');
  const isDeclined = (s) => /declin|lost|reject/i.test(s || '');
  const value = list.reduce((s, e) => s + e.total, 0);
  const approved = list.filter((e) => isApproved(e.status));
  const declined = list.filter((e) => isDeclined(e.status));
  const decided = approved.length + declined.length;
  return {
    count: list.length,
    value,
    approvedCount: approved.length,
    approvedValue: approved.reduce((s, e) => s + e.total, 0),
    pendingCount: list.length - decided,
    winRate: decided > 0 ? approved.length / decided : null,
    avgTicket: list.length ? value / list.length : 0,
  };
}
