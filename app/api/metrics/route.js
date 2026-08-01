import { NextResponse } from 'next/server';
import { computeMetrics } from '@/lib/metrics';
import { PERIODS } from '@/lib/periods';

export const dynamic = 'force-dynamic';
// Pulling ~10 months of invoice history can exceed the default 10s limit.
export const maxDuration = 60;

// 5-minute in-memory cache per period: the first viewer pays the API cost,
// everyone else on the same server instance gets an instant response.
const TTL_MS = 300_000;
function cache() {
  if (!globalThis.__metricsCache) globalThis.__metricsCache = new Map();
  return globalThis.__metricsCache;
}

export async function GET(req) {
  const params = req.nextUrl.searchParams;
  const period = params.get('period') || 'month';
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: `period must be one of: ${PERIODS.join(', ')}` }, { status: 400 });
  }

  const custom =
    period === 'custom' ? { from: params.get('from'), to: params.get('to') } : null;
  const cacheKey = custom ? `custom:${custom.from}:${custom.to}` : period;

  // fresh=1 skips the cache entirely. The client sends it right after saving a
  // setting, since this instance's cache (or another instance's) would
  // otherwise keep serving pre-save numbers for up to 5 minutes.
  const fresh = params.get('fresh') === '1';

  const hit = cache().get(cacheKey);
  if (!fresh && hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  try {
    const metrics = await computeMetrics(period, custom);
    cache().set(cacheKey, { data: metrics, ts: Date.now() });
    return NextResponse.json(metrics);
  } catch (e) {
    console.error('metrics error:', e);
    // Bad custom dates are the caller's fault, not an upstream failure.
    if (/date|from and to/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    // Serve stale data (up to 10 min old) rather than an error if we have it.
    if (hit && Date.now() - hit.ts < 10 * TTL_MS) {
      return NextResponse.json({ ...hit.data, cached: true, stale: true });
    }
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
