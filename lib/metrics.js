// Metric aggregation. This is the file to edit when tuning metric definitions.
//
// Current definitions (v1 — adjust freely):
//   revenue      = sum of completed HCP job totals in period
//   jobs         = count of HCP jobs scheduled in period
//   utilization  = scheduled job hours / (tech count × work hours/day × business days)
//   call volume  = Ringba inbound calls + HCP-sourced calls (v1: HCP portion is 0
//                  unless you wire up a source — see README "Call volume")
//   lead volume  = HCP estimates created + Ringba unique inbound callers
//   lead sources = Ringba calls grouped by campaign + HCP jobs grouped by lead_source
//   break-even   = monthly target (editable in UI), prorated onto the period

import { getRange, countBusinessDays, prorateMonthlyTarget } from './periods';
import * as hcp from './housecall';
import * as ringba from './ringba';
import * as ads from './googleads';
import * as places from './googleplaces';
import { mockMetrics } from './mock';
import { getBreakEvenMonthly, getTechNames, getTrendMonths, saveTrendMonths } from './settings';

// Revenue trend always starts here (default Oct 1 2025).
export function trendStartDate() {
  const raw = process.env.TREND_START || '2025-10-01';
  const d = new Date(`${raw}T00:00:00`);
  return isNaN(d) ? new Date('2025-10-01T00:00:00') : d;
}

function monthlyBuckets(from, to) {
  const out = [];
  let s = new Date(from.getFullYear(), from.getMonth(), 1);
  let guard = 0;
  while (s <= to && guard++ < 120) {
    const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
    out.push({
      start: s,
      end: e,
      label: s.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    });
    s = e;
  }
  return out;
}

// Turn a Map<source, count> into a ranked [{ source, count }] list (desc),
// capped so the panel stays readable.
function rankSources(counts, limit = 8) {
  return [...counts.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function computeMetrics(period, custom = null) {
  const range = getRange(period, new Date(), custom);
  const live = hcp.hcpConfigured();
  const warnings = [];

  let core;
  if (live) {
    core = await computeLive(range, warnings);
  } else {
    core = mockMetrics(period, range);
    warnings.push('Running in MOCK mode — set HCP_API_KEY to go live.');
  }

  const monthly = await getBreakEvenMonthly();
  const target = Math.round(prorateMonthlyTarget(monthly, period, range));

  return {
    period,
    mode: live ? 'live' : 'mock',
    generatedAt: new Date().toISOString(),
    range: { start: range.start.toISOString(), end: range.end.toISOString() },
    trendStartLabel: trendStartDate().toLocaleDateString('en-US', {
      month: 'short', year: 'numeric', timeZone: 'UTC',
    }),
    warnings,
    breakEven: {
      monthlyTarget: monthly,
      periodTarget: target,
      progress: target > 0 ? core.revenue.value / target : 0,
    },
    ...core,
  };
}

async function computeLive(range, warnings) {
  const { start, end, prevStart, prevEnd, buckets } = range;

  const trendStartEarly = trendStartDate();
  const sweepFrom = trendStartEarly < start ? trendStartEarly : start;
  const invoiceSweep = hcp.getInvoicesSince(sweepFrom).catch((e) => {
    warnings.push(`Invoices unavailable (${e.message.slice(0, 70)}) — revenue uses job totals.`);
    return null;
  });

  const [jobs, estimates, employees, prevJobs, prevEstimates] = await Promise.all([
    hcp.getJobs(start, end),
    hcp.getEstimates(start, end),
    hcp.getEmployees().catch((e) => { warnings.push(`Employees fetch failed: ${e.message}`); return []; }),
    prevStart ? hcp.getJobs(prevStart, prevEnd) : Promise.resolve(null),
    prevStart ? hcp.getEstimates(prevStart, prevEnd) : Promise.resolve(null),
  ]);

  // Ringba (optional — dashboard still works without it)
  let calls = { total: 0, uniqueCallers: 0 };
  let prevCalls = null;
  if (ringba.ringbaConfigured()) {
    try {
      [calls, prevCalls] = await Promise.all([
        ringba.getCalls(start, end),
        prevStart ? ringba.getCalls(prevStart, prevEnd) : Promise.resolve(null),
      ]);
    } catch (e) {
      warnings.push(`Ringba unavailable: ${e.message}`);
    }
  } else {
    warnings.push('Ringba not configured — call volume shows HCP-sourced calls only.');
  }

  // Revenue: invoice-based (matches HCP's own dashboard revenue), with a
  // fallback to non-canceled job totals if the invoices endpoint is
  // unavailable on this API plan.
  const revenueOf = (js) => js.filter((j) => !hcp.isCanceled(j)).reduce((s, j) => s + hcp.jobRevenue(j), 0);

  // The revenue trend chart is always month-over-month from TREND_START,
  // regardless of the selected period. One wide invoice fetch serves both the
  // period figure and the trend (HCP returns all invoices either way).
  const trendStart = trendStartDate();

  const now = new Date();
  const trendEnd = end > now ? end : now; // trend always runs through today

  const allInvoices = await invoiceSweep;
  let invoices = null;
  let prevInvoices = null;
  if (allInvoices) {
    const within = (list, a, b) =>
      list.filter((inv) => {
        const d = hcp.invoiceDate(inv);
        return d && d >= a && d <= b;
      });
    invoices = within(allInvoices, start, end);
    if (prevStart) prevInvoices = within(allInvoices, prevStart, prevEnd);
  }

  const invoiceSum = (list) => list.reduce((s, inv) => s + hcp.invoiceAmount(inv), 0);

  const revenue = invoices ? invoiceSum(invoices) : revenueOf(jobs);
  const prevRevenue = invoices
    ? (prevInvoices ? Math.round(invoiceSum(prevInvoices)) : null)
    : (prevJobs ? Math.round(revenueOf(prevJobs)) : null);

  // Revenue by service line (Garage vs Gates). HCP's Job Type field is mostly
  // blank, so hcp.jobCategory() falls back to garage/gate keywords in the job
  // description. These are job-total (booked) sums, so they're subsets of the
  // invoice-based total — they won't add up to it exactly.
  let garageRev = 0;
  let gateRev = 0;
  for (const jb of jobs) {
    if (hcp.isCanceled(jb)) continue;
    const cat = hcp.jobCategory(jb);
    if (cat === 'garage') garageRev += hcp.jobRevenue(jb);
    else if (cat === 'gate') gateRev += hcp.jobRevenue(jb);
  }

  // Month-over-month series, invoice-based so it agrees with the revenue card.
  // Each month is fetched directly with created_at_min/max (proven to work on
  // HCP's /invoices endpoint) rather than paging back through ~4,000 records.
  // Finished months are cached permanently in Upstash; to keep any single
  // request quick we backfill at most BACKFILL_PER_REQUEST uncached months,
  // so a couple of page loads fill the whole chart.
  const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonthKey = monthKey(now);
  const cachedMonths = await getTrendMonths();
  const months = monthlyBuckets(trendStart, trendEnd);

  // How far back the sweep actually reached — months older than this can't be
  // trusted from it, so they fall back to the permanent cache.
  const oldestSeen = allInvoices?.length
    ? allInvoices.reduce((min, inv) => {
        const d = hcp.invoiceDate(inv);
        return d && (!min || d < min) ? d : min;
      }, null)
    : null;

  const updates = {};
  const series = months.map((b) => {
    const key = monthKey(b.start);
    const isCurrent = key === thisMonthKey;
    const covered = oldestSeen && oldestSeen <= b.start;

    if (allInvoices && (covered || isCurrent)) {
      const value = Math.round(
        invoiceSum(
          allInvoices.filter((inv) => {
            const d = hcp.invoiceDate(inv);
            return d && d >= b.start && d < b.end;
          })
        )
      );
      if (!isCurrent) updates[key] = value; // finished months are immutable
      return { label: b.label, revenue: value };
    }
    if (cachedMonths[key] != null) return { label: b.label, revenue: cachedMonths[key] };
    return { label: b.label, revenue: null };
  });

  if (Object.keys(updates).length) {
    try {
      await saveTrendMonths({ ...cachedMonths, ...updates });
    } catch (e) {
      console.error('trend cache write failed:', e.message);
    }
  }

  const missing = series.filter((p) => p.revenue == null).length;
  if (missing) warnings.push(`${missing} early month(s) unavailable from Housecall Pro.`);

  // Utilization — restricted to the selected technicians when a selection
  // exists (dashboard "choose techs" picker, or TECH_NAMES env fallback).
  const techNames = await getTechNames();
  const selectedTechs = techNames.length
    ? employees.filter((e) => techNames.includes(hcp.employeeName(e)))
    : [];

  const techCount =
    selectedTechs.length ||
    Number(process.env.TECH_COUNT) ||
    employees.filter((e) => {
      const r = `${e.role || ''} ${e.permissions?.role || ''}`.toLowerCase();
      return r.includes('tech') || r.includes('field');
    }).length ||
    employees.length ||
    1;

  const hoursPerDay = Number(process.env.WORK_HOURS_PER_DAY) || 8;
  const available = techCount * hoursPerDay * countBusinessDays(start, end);

  let scheduled;
  if (selectedTechs.length) {
    const techIds = new Set(selectedTechs.map((e) => e.id));
    scheduled = jobs.reduce((s, j) => {
      const h = hcp.jobHours(j);
      if (!h) return s;
      const assigned = j.assigned_employees;
      if (Array.isArray(assigned) && assigned.length) {
        const matches = assigned.filter((a) =>
          techIds.has(a?.id ?? a?.employee_id ?? a)
        ).length;
        return s + h * matches;
      }
      return s + h;
    }, 0);
  } else {
    scheduled = jobs.reduce((s, j) => s + hcp.jobHours(j), 0);
  }

  const utilization = available > 0 ? Math.min(scheduled / available, 1.5) : 0;

  // Call volume: Ringba + HCP-sourced (v1: HCP portion = 0; wire up when a source exists)
  const hcpCalls = 0;
  const callVolume = calls.total + hcpCalls;

  // Lead volume (v1): estimates created + unique Ringba callers
  const leadVolume = estimates.length + calls.uniqueCallers;

  // Lead sources (#2) — ranked by volume. Ringba campaigns are the primary
  // signal for where leads come from; HCP's lead_source field folds in for
  // booked jobs wherever the team has filled it (blank → "Untracked").
  const byCampaign = rankSources(ringba.callsByCampaign(calls.rows || []));
  const hcpSourceCounts = new Map();
  for (const j of jobs) {
    const key = hcp.jobLeadSource(j) || 'Untracked';
    hcpSourceCounts.set(key, (hcpSourceCounts.get(key) || 0) + 1);
  }
  const leadSources = {
    byCampaign,
    byHcpSource: rankSources(hcpSourceCounts),
    totalCalls: calls.total || 0,
    totalJobs: jobs.length,
  };

  // Google Ads (optional) — spend, clicks, impressions, CTR
  let adMetrics = null;
  let prevAdMetrics = null;
  if (ads.adsConfigured()) {
    try {
      [adMetrics, prevAdMetrics] = await Promise.all([
        ads.getAdMetrics(start, end),
        prevStart ? ads.getAdMetrics(prevStart, prevEnd) : Promise.resolve(null),
      ]);
    } catch (e) {
      warnings.push(`Google Ads unavailable: ${e.message.slice(0, 100)}`);
    }
  }

  // Google reviews (optional) — current snapshot, not period-scoped.
  let reviews = null;
  if (places.placesConfigured()) {
    try {
      reviews = await places.getReviewSummary();
    } catch (e) {
      warnings.push(`Google reviews unavailable: ${e.message.slice(0, 100)}`);
    }
  }

  return {
    revenue: {
      value: Math.round(revenue),
      prev: prevRevenue,
      series,
      garage: Math.round(garageRev),
      gate: Math.round(gateRev),
    },
    jobs: { value: jobs.length, prev: prevJobs ? prevJobs.length : null },
    utilization: { value: utilization, prev: null },
    leads: {
      value: leadVolume,
      prev: prevEstimates && prevCalls ? prevEstimates.length + prevCalls.uniqueCallers : null,
    },
    calls: {
      value: callVolume,
      prev: prevCalls ? prevCalls.total + hcpCalls : null,
      breakdown: { ringba: calls.total, housecall: hcpCalls },
    },
    leadSources,
    ads: adMetrics
      ? {
          spend: Math.round(adMetrics.spend),
          prevSpend: prevAdMetrics ? Math.round(prevAdMetrics.spend) : null,
          clicks: adMetrics.clicks,
          prevClicks: prevAdMetrics ? prevAdMetrics.clicks : null,
          impressions: adMetrics.impressions,
          ctr: adMetrics.ctr,
          conversions: adMetrics.conversions,
          costPerLead: leadVolume > 0 ? adMetrics.spend / leadVolume : null,
        }
      : null,
    reviews,
    techCount,
  };
}
