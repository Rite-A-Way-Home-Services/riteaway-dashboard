import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// TEMPORARY probe: works out which date-filter parameters HCP's /invoices
// endpoint actually honours, so the revenue trend can fetch a specific month
// instead of paging through all history. Delete once we know the answer.

const BASE = () => process.env.HCP_BASE_URL || 'https://api.housecallpro.com';

function headers() {
  return {
    Authorization: `${process.env.HCP_AUTH_SCHEME || 'Bearer'} ${process.env.HCP_API_KEY}`,
    Accept: 'application/json',
  };
}

// Candidate parameter pairs to try for "invoices in October 2025".
const CANDIDATES = [
  {},
  { created_after: '2025-10-01', created_before: '2025-10-31' },
  { created_at_min: '2025-10-01', created_at_max: '2025-10-31' },
  { start_date: '2025-10-01', end_date: '2025-10-31' },
  { invoice_date_min: '2025-10-01', invoice_date_max: '2025-10-31' },
  { updated_after: '2025-10-01' },
  { page: '40' },
];

function summarize(list) {
  const dates = list
    .map((i) => i.created_at || i.invoice_date || i.paid_at)
    .filter(Boolean)
    .sort();
  return {
    returned: list.length,
    oldest: dates[0] || null,
    newest: dates[dates.length - 1] || null,
  };
}

export async function GET() {
  if (!process.env.HCP_API_KEY) {
    return NextResponse.json({ error: 'HCP_API_KEY not set' }, { status: 400 });
  }

  const results = [];
  for (const params of CANDIDATES) {
    const qs = new URLSearchParams({ page: '1', page_size: '200', ...params });
    const started = Date.now();
    try {
      const res = await fetch(`${BASE()}/invoices?${qs}`, { headers: headers(), cache: 'no-store' });
      const text = await res.text();
      let list = [];
      let totalPages = null;
      let totalItems = null;
      if (res.ok) {
        const json = JSON.parse(text);
        list = json.invoices || json.data || (Array.isArray(json) ? json : []);
        totalPages = json.total_pages ?? json.totalPages ?? null;
        totalItems = json.total_items ?? json.total ?? null;
      }
      results.push({
        params,
        status: res.status,
        ms: Date.now() - started,
        totalPages,
        totalItems,
        ...(res.ok ? summarize(list) : { body: text.slice(0, 160) }),
      });
    } catch (e) {
      results.push({ params, error: e.message.slice(0, 120) });
    }
  }

  return NextResponse.json({
    note: 'Compare "oldest" per row. If a date-filtered row returns Oct 2025 records, that parameter works.',
    results,
  });
}
