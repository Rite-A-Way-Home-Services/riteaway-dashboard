import { NextResponse } from 'next/server';

// TEMP diagnostic (v3): inspect HCP Job Type so we can split revenue into
// Garage vs Gates. Safe to delete once that work ships.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = process.env.HCP_BASE_URL || 'https://api.housecallpro.com';

function headers() {
  const scheme = process.env.HCP_AUTH_SCHEME || 'Bearer';
  return { Authorization: `${scheme} ${process.env.HCP_API_KEY}`, Accept: 'application/json' };
}

async function j(path) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: 'no-store' });
  const t = await res.text();
  try { return { status: res.status, body: JSON.parse(t) }; } catch { return { status: res.status, body: t.slice(0, 150) }; }
}

export async function GET() {
  const out = {};

  // Candidate job-type config endpoints (UUID -> name mapping)
  out.job_types = await j('/job_types?page=1&page_size=50');
  out.company_job_types = await j('/company/job_types?page=1&page_size=50');

  // Recent jobs — inspect job_fields, tags, description for the type signal
  const jobs = await j('/jobs?page=1&page_size=30&sort_by=created_at&sort_direction=desc');
  const list = jobs.body?.jobs || [];
  out.jobsStatus = jobs.status;

  out.jobSample = list.slice(0, 30).map((jb) => ({
    id: jb.id,
    total_amount: jb.total_amount,
    work_status: jb.work_status,
    job_fields: jb.job_fields,
    tags: jb.tags,
    desc: (jb.description || '').slice(0, 50),
  }));

  // Distribution of whatever job_fields.job_type looks like
  const types = {};
  list.forEach((jb) => {
    const jt = jb.job_fields?.job_type;
    const key = jt == null ? 'null' : typeof jt === 'object' ? JSON.stringify(jt) : String(jt);
    types[key] = (types[key] || 0) + 1;
  });
  out.jobTypeDistribution = types;

  return NextResponse.json(out);
}
