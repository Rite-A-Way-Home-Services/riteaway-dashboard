// Housecall Pro API client.
// All endpoint/auth specifics live here so adjustments are one-line changes.
// Docs: https://docs.housecallpro.com (requires HCP MAX plan or API add-on for a key)

const BASE = () => process.env.HCP_BASE_URL || 'https://api.housecallpro.com';
const PAGE_SIZE = 200;
const MAX_PAGES = 150; // safety cap; paging stops early on an empty page

function headers() {
  const scheme = process.env.HCP_AUTH_SCHEME || 'Bearer';
  return {
    Authorization: `${scheme} ${process.env.HCP_API_KEY}`,
    Accept: 'application/json',
  };
}

export function hcpConfigured() {
  return Boolean(process.env.HCP_API_KEY);
}

async function fetchAllPages(path, params = {}, listKeys = [], opts = {}) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ ...params, page: String(page), page_size: String(PAGE_SIZE) });
    const res = await fetch(`${BASE()}${path}?${qs}`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HCP ${path} -> ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    // HCP nests lists under a resource key ("jobs", "estimates", ...); be defensive.
    const list =
      listKeys.map((k) => json[k]).find(Array.isArray) ||
      (Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : []);
    items.push(...list);

    // Stop only when the data actually runs out. Don't trust total_pages:
    // HCP reports it against its own page size, not the one we asked for,
    // and honoring it silently truncated ~7 months of invoice history.
    if (list.length === 0) break;

    // Early exit: if results are sorted newest-first and this whole page is
    // already older than the window we care about, later pages are too.
    if (opts.stopBefore && opts.dateField && list.length > 1) {
      const first = new Date(list[0]?.[opts.dateField] || 0);
      const last = new Date(list[list.length - 1]?.[opts.dateField] || 0);
      const sortedDesc = first >= last;
      if (sortedDesc && last < opts.stopBefore) break;
    }

    // Hard wall-clock budget so one slow endpoint can't time out the request.
    if (opts.deadline && Date.now() > opts.deadline) break;
  }
  return items;
}

// HCP sometimes nests scheduling info under job.schedule — check both shapes.
export function jobDate(job) {
  return new Date(
    job.scheduled_start || job.schedule?.scheduled_start || job.created_at || 0
  );
}

const iso = (d) => new Date(d).toISOString();

export async function getJobs(start, end) {
  // Filter server-side where supported, then re-filter client-side to be safe.
  const jobs = await fetchAllPages(
    '/jobs',
    { scheduled_start_min: iso(start), scheduled_start_max: iso(end) },
    ['jobs']
  );
  return jobs.filter((j) => {
    const d = jobDate(j);
    return d >= start && d <= end;
  });
}

export async function getEstimates(start, end) {
  // Server-side date window (created_at_min/max - proven on HCP's invoices
  // endpoint) so we fetch just the period instead of paging the whole history.
  // The client-side filter still guarantees exact bounds; the deadline caps
  // wall-clock time so a large window can't time out the serverless request.
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  const estimates = await fetchAllPages(
    '/estimates',
    {
      sort_by: 'created_at',
      sort_direction: 'desc',
      created_at_min: ymd(start),
      created_at_max: ymd(end),
    },
    ['estimates'],
    { stopBefore: start, dateField: 'created_at', deadline: Date.now() + 50_000 }
  );
  return estimates.filter((e) => {
    const d = new Date(e.created_at || 0);
    return d >= start && d <= end;
  });
}

export async function getEmployees() {
  return fetchAllPages('/employees', {}, ['employees']);
}

// ── Invoices (revenue basis matching HCP's own dashboard) ──────

export async function getInvoices(start, end) {
  // Newest-first with an early exit: without this we walk the entire invoice
  // history on every call and blow the serverless time limit.
  const invoices = await fetchAllPages(
    '/invoices',
    { sort_by: 'created_at', sort_direction: 'desc' },
    ['invoices'],
    // 40s budget keeps us inside the route's 60s limit even on a cold start.
    { stopBefore: start, dateField: 'created_at', deadline: Date.now() + 50_000 }
  );
  return invoices.filter((inv) => {
    const d = invoiceDate(inv);
    return d && d >= start && d <= end;
  });
}

// Fetch invoices created inside an explicit window. The probe confirmed HCP
// honours created_at_min / created_at_max here, which avoids paging through
// the entire 4,000-invoice history to reach older months.
export async function getInvoicesCreatedBetween(from, to) {
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  return fetchAllPages(
    '/invoices',
    { created_at_min: ymd(from), created_at_max: ymd(to) },
    ['invoices'],
    { deadline: Date.now() + 12_000 }
  );
}

// One sweep of everything created since `from`. Only created_at_min is
// reliable on HCP's side (created_at_max is applied loosely), so we filter the
// upper bound ourselves. ~21 pages covers the full history in about 20s.
export async function getInvoicesSince(from, ms = 42_000) {
  const ymd = (d) => new Date(d).toISOString().slice(0, 10);
  return fetchAllPages(
    '/invoices',
    { created_at_min: ymd(from) },
    ['invoices'],
    { deadline: Date.now() + ms }
  );
}

export function invoiceDate(inv) {
  const raw =
    inv.paid_at || inv.payment_date || inv.invoice_date ||
    inv.sent_at || inv.due_at || inv.created_at;
  const d = raw ? new Date(raw) : null;
  return d && !isNaN(d) ? d : null;
}

export function invoiceAmount(inv) {
  const cents = Number(inv.amount ?? inv.total_amount ?? inv.total ?? 0);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

export function employeeName(e) {
  return (
    [e.first_name, e.last_name].filter(Boolean).join(' ').trim() ||
    e.name || e.email || String(e.id)
  );
}

// Revenue from a job record. HCP reports total_amount in cents.
export function jobRevenue(job) {
  const cents = Number(job.total_amount ?? job.outstanding_balance ?? 0);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

// Lead source recorded in HCP — on the job or, failing that, its customer.
// Often blank (HCP doesn't require it), so callers should bucket null.
export function jobLeadSource(job) {
  const raw = job?.lead_source ?? job?.customer?.lead_source;
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s || null;
}

// Service line for the revenue split. HCP's Job Type (job_fields.job_type.name
// = "Garage" / "Gate" / "Combo") is usually blank, so fall back to garage/gate
// keywords in the job description. Returns 'garage' | 'gate' | 'combo' | null.
export function jobCategory(job) {
  const t = (job?.job_fields?.job_type?.name || '').toLowerCase();
  if (t.includes('combo')) return 'combo';
  if (t.includes('garage')) return 'garage';
  if (t.includes('gate')) return 'gate';
  const d = (job?.description || '').toLowerCase();
  const garage = /\bgarage\b/.test(d);
  const gate = /\bgates?\b/.test(d);
  if (garage && gate) return 'combo';
  if (garage) return 'garage';
  if (gate) return 'gate';
  return null;
}

export function isCompleted(job) {
  const s = String(job.work_status || '').toLowerCase();
  return s.includes('complete') || s === 'finished' || s === 'done';
}

export function isCanceled(job) {
  const s = String(job.work_status || '').toLowerCase();
  return s.includes('cancel');
}

// Scheduled duration in hours (for utilization). Checks both flat and
// nested (job.schedule.*) shapes.
export function jobHours(job) {
  const s = new Date(job.scheduled_start || job.schedule?.scheduled_start || 0);
  const e = new Date(job.scheduled_end || job.schedule?.scheduled_end || 0);
  const h = (e - s) / 36e5;
  return Number.isFinite(h) && h > 0 && h < 24 ? h : 0;
}
