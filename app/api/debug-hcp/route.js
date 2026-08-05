import { NextResponse } from 'next/server';

// TEMP diagnostic: probes HCP API endpoints for voice / call-tracking / lead
// data so we can wire HCP phone-number calls into Call Volume. Safe to delete
// once the Lead Sources / Call Volume work is done. Returns status + shape
// only (no PII bodies beyond small samples).

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BASE = process.env.HCP_BASE_URL || 'https://api.housecallpro.com';

function headers() {
  const scheme = process.env.HCP_AUTH_SCHEME || 'Bearer';
  return { Authorization: `${scheme} ${process.env.HCP_API_KEY}`, Accept: 'application/json' };
}

// Candidate endpoints to test. HCP nests some resources under /company.
const CANDIDATES = [
  '/phone_numbers',
  '/company/phone_numbers',
  '/voice/phone_numbers',
  '/inbox/phone_numbers',
  '/calls',
  '/voice/calls',
  '/voice/call_logs',
  '/call_logs',
  '/leads',
  '/company/leads',
  '/lead_sources',
  '/company/lead_sources',
];

function shape(v, depth = 0) {
  if (Array.isArray(v)) {
    return { _array: v.length, sample: v.length && depth < 3 ? shape(v[0], depth + 1) : null };
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 40)) o[k] = depth < 3 ? shape(v[k], depth + 1) : typeof v[k];
    return o;
  }
  return v === null ? 'null' : typeof v;
}

export async function GET() {
  if (!process.env.HCP_API_KEY) {
    return NextResponse.json({ error: 'HCP_API_KEY not set' }, { status: 400 });
  }
  const results = [];
  for (const path of CANDIDATES) {
    try {
      const res = await fetch(`${BASE}${path}?page=1&page_size=5`, { headers: headers(), cache: 'no-store' });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      results.push({
        path,
        status: res.status,
        ok: res.ok,
        topKeys:
          json && typeof json === 'object' && !Array.isArray(json)
            ? Object.keys(json).slice(0, 25)
            : Array.isArray(json)
            ? `array(${json.length})`
            : null,
        shape: json ? shape(json) : text.slice(0, 200),
      });
    } catch (e) {
      results.push({ path, error: String(e).slice(0, 200) });
    }
  }
  return NextResponse.json({ base: BASE, results });
}
