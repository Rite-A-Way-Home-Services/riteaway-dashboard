import { NextResponse } from 'next/server';
import { computeMetrics } from '@/lib/metrics';
import { PERIODS } from '@/lib/periods';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const period = req.nextUrl.searchParams.get('period') || 'month';
  if (!PERIODS.includes(period)) {
    return NextResponse.json({ error: `period must be one of: ${PERIODS.join(', ')}` }, { status: 400 });
  }
  try {
    const metrics = await computeMetrics(period);
    return NextResponse.json(metrics);
  } catch (e) {
    console.error('metrics error:', e);
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
