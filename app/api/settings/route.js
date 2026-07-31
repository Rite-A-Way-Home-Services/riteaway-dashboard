import { NextResponse } from 'next/server';
import {
  getBreakEvenMonthly, setBreakEvenMonthly,
  getTechNames, setTechNames, isPersistent,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

async function currentSettings() {
  return {
    monthlyBreakEven: await getBreakEvenMonthly(),
    techNames: await getTechNames(),
    persistent: isPersistent(),
  };
}

export async function GET() {
  return NextResponse.json(await currentSettings());
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (body.monthlyBreakEven !== undefined) await setBreakEvenMonthly(body.monthlyBreakEven);
    if (body.techNames !== undefined) await setTechNames(body.techNames);
    // Settings affect computed metrics -> drop the metrics cache.
    globalThis.__metricsCache = new Map();
    return NextResponse.json(await currentSettings());
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
