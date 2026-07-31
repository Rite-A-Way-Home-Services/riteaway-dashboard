// Housecall Pro API client.
// All endpoint/auth specifics live here so adjustments are one-line changes.
// Docs: https://docs.housecallpro.com (requires HCP MAX plan or API add-on for a key)

const BASE = () => process.env.HCP_BASE_URL || 'https://api.housecallpro.com';
const PAGE_SIZE = 200;
const MAX_PAGES = 50; // safety cap

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

async function fetchAllPages(path, params = {}, listKeys = []) {
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
    if (list.length < PAGE_SIZE) break;
  }
  return items;
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
    const d = new Date(j.scheduled_start || j.created_at || 0);
    return d >= start && d <= end;
  });
}

export async function getEstimates(start, end) {
  const estimates = await fetchAllPages('/estimates', {}, ['estimates']);
  return estimates.filter((e) => {
    const d = new Date(e.created_at || 0);
    return d >= start && d <= end;
  });
}

export async function getEmployees() {
  return fetchAllPages('/employees', {}, ['employees']);
}

// Revenue from a job record. HCP reports total_amount in cents.
export function jobRevenue(job) {
  const cents = Number(job.total_amount ?? job.outstanding_balance ?? 0);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

export function isCompleted(job) {
  const s = String(job.work_status || '').toLowerCase();
  return s.includes('complete') || s === 'finished' || s === 'done';
}

// Scheduled duration in hours (for utilization).
export function jobHours(job) {
  const s = new Date(job.scheduled_start || 0);
  const e = new Date(job.scheduled_end || 0);
  const h = (e - s) / 36e5;
  return Number.isFinite(h) && h > 0 && h < 24 ? h : 0;
}
