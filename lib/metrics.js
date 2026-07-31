// Metric aggregation. This is the file to edit when tuning metric definitions.
//
// Current definitions (v1 — adjust freely):
//   revenue      = sum of completed HCP job totals in period
//   jobs         = count of HCP jobs scheduled in period
//   utilization  = scheduled job hours / (tech count × work hours/day × business days)
//   call volume  = Ringba inbound calls + HCP-sourced calls (v1: HCP portion is 0
//                  unless you wire up a source — see README "Call volume")
//   lead volume  = HCP estimates created + Ringba unique inbound callers
//   break-even   = monthly target (editable in UI), prorated onto the period

import { getRange, countBusinessDays, prorateMonthlyTarget } from './periods';
import * as hcp from './housecall';
import * as ringba from './ringba';
import { mockMetrics } from './mock';
import { getBreakEvenMonthly, getTechNames } from './settings';

export async function computeMetrics(period) {
  const range = getRange(period);
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

  let invoices = null;
  let prevInvoices = null;
  try {
    [invoices, prevInvoices] = await Promise.all([
      hcp.getInvoices(start, end),
      prevStart ? hcp.getInvoices(prevStart, prevEnd) : Promise.resolve(null),
    ]);
  } catch (e) {
    warnings.push(`Invoices unavailable (${e.message.slice(0, 80)}) — revenue uses job totals instead.`);
  }

  const invoiceSum = (list) => list.reduce((s, inv) => s + hcp.invoiceAmount(inv), 0);

  const revenue = invoices ? invoiceSum(invoices) : revenueOf(jobs);
  const prevRevenue = invoices
    ? (prevInvoices ? Math.round(invoiceSum(prevInvoices)) : null)
    : (prevJobs ? Math.round(revenueOf(prevJobs)) : null);

  const series = buckets.map((b) => ({
    label: b.label,
    revenue: Math.round(
      invoices
        ? invoiceSum(invoices.filter((inv) => {
            const d = hcp.invoiceDate(inv);
            return d >= b.start && d < b.end;
          }))
        : revenueOf(jobs.filter((j) => {
            const d = hcp.jobDate(j);
            return d >= b.start && d < b.end;
          }))
    ),
  }));

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
        // Count the job's hours once per selected tech assigned to it.
        const matches = assigned.filter((a) =>
          techIds.has(a?.id ?? a?.employee_id ?? a)
        ).length;
        return s + h * matches;
      }
      return s + h; // no assignment data -> count once
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

  return {
    revenue: {
      value: Math.round(revenue),
      prev: prevRevenue,
      series,
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
    techCount,
  };
}
