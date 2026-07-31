import { NextResponse } from 'next/server';
import { getBreakEvenMonthly, setBreakEvenMonthly, isPersistent } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  const monthlyBreakEven = await getBreakEvenMonthly();
  return NextResponse.json({ monthlyBreakEven, persistent: isPersistent() });
}

export async function POST(req) {
  try {
    const { monthlyBreakEven } = await req.json();
    const saved = await setBreakEvenMonthly(monthlyBreakEven);
    return NextResponse.json({ monthlyBreakEven: saved, persistent: isPersistent() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
