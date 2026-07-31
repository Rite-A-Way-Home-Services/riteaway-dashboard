import { NextResponse } from 'next/server';
import { getJobs, getEmployees, employeeName } from '@/lib/housecall';
import { getRange } from '@/lib/periods';

export const dynamic = 'force-dynamic';

// TEMPORARY diagnostic: reveals the SHAPE of HCP job records so technician
// assignment matching can be written against reality. Redacts customer data.
// Delete this route once utilization is verified.

function shapeOf(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return depth > 2
      ? `array(${value.length})`
      : { _array: value.length, sample: value.length ? shapeOf(value[0], depth + 1) : null };
  }
  if (typeof value === 'object') {
    if (depth > 2) return 'object';
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = shapeOf(v, depth + 1);
    return out;
  }
  return typeof value;
}

export async function GET() {
  try {
    const range = getRange('month');
    const [jobs, employees] = await Promise.all([
      getJobs(range.start, range.end),
      getEmployees(),
    ]);

    const job = jobs[0] || null;

    // Any key that might carry technician assignment
    const assignmentKeys = job
      ? Object.keys(job).filter((k) =>
          /assign|employee|tech|dispatch|worker|crew|staff|user/i.test(k)
        )
      : [];

    const assignmentSamples = {};
    for (const k of assignmentKeys) assignmentSamples[k] = job[k];

    return NextResponse.json({
      jobCount: jobs.length,
      allJobKeys: job ? Object.keys(job) : [],
      jobShape: job ? shapeOf(job) : null,
      assignmentKeys,
      assignmentSamples,
      scheduleBlock: job ? (job.schedule ?? null) : null,
      employeeSample: employees[0]
        ? { keys: Object.keys(employees[0]), id: employees[0].id, name: employeeName(employees[0]) }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
