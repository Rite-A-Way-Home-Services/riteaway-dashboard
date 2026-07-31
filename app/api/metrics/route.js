import { NextResponse } from 'next/server';
import { computeMetrics } from '@/lib/metrics';
import { PERIODS } from '@/lib/periods';

export const dynamic = 'force-dynamic';

// 60s in-memory cache per period: the first viewer pays the API cost,
// everyone else on the same server instance gets an instant response.
const TTL_MS = 60_000;
function cache() {
  if (!globalThis.__metricsCache) globalThis.__metricsCache = new Map();
  return globalThis.__metricsCache;
}

export async function GET(req) {
  const period = req.nextUrl.searchParams.get('period') || 'month';
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: `period must be one of: ${PERIODS.join(', ')}` }, { status: 400 });
  }

  const hit = cache().get(period);
  if (hit && Date.now() - hit.ts < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  try {
    const metrics = await computeMetrics(period);
    cache().set(period, { data: metrics, ts: Date.now() });
    return NextResponse.json(metrics);
  } catch (e) {
    console.error('metrics error:', e);
    // Serve stale data (up to 10 min old) rather than an error if we have it.
    if (hit && Date.now() - hit.ts < 10 * TTL_MS) {
      return NextResponse.json({ ...hit.data, cached: true, stale: true });
    }
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
