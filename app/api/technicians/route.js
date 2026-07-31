import { NextResponse } from 'next/server';
import { getEmployees, employeeName, hcpConfigured } from '@/lib/housecall';
import { getTechNames } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60_000; // employee list changes rarely

export async function GET() {
  const selected = await getTechNames();

  if (!hcpConfigured()) {
    const mock = ['Nathan Perkins', 'Conner Howard', 'Alex Rivera', 'Sam Okafor'];
    return NextResponse.json({
      technicians: mock.map((name) => ({ id: name, name })),
      selected,
      mode: 'mock',
    });
  }

  try {
    const hit = globalThis.__employeeCache;
    let employees;
    if (hit && Date.now() - hit.ts < TTL_MS) {
      employees = hit.data;
    } else {
      employees = await getEmployees();
      globalThis.__employeeCache = { data: employees, ts: Date.now() };
    }
    return NextResponse.json({
      technicians: employees.map((e) => ({ id: e.id, name: employeeName(e) })),
      selected,
      mode: 'live',
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
