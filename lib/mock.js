// Deterministic mock data so the dashboard is fully demo-able before API keys
// are configured. Seeded by bucket label so numbers are stable across refreshes.

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Baseline: ~$120k/mo revenue business, ~90 jobs/mo, 5 techs.
const DAILY = {
  revenue: 4000,
  jobs: 3,
  calls: 14,
  leads: 6,
};

function bucketDays(bucket) {
  return Math.max((bucket.end - bucket.start) / 864e5, 0.02);
}

// Split a total across labeled shares, rounding and dropping empties, so mock
// lead-source panels look like real ranked breakdowns.
function splitSources(total, shares) {
  return shares
    .map(([source, share]) => ({ source, count: Math.round(total * share) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function mockMetrics(period, range, trendStart = new Date('2025-10-01T00:00:00')) {
  const rand = mulberry32(hashCode(`riteaway-${period}`));

  // Trend is always monthly from trendStart → now, matching live behaviour.
  const trendBuckets = [];
  {
    let s = new Date(trendStart.getFullYear(), trendStart.getMonth(), 1);
    const now = new Date();
    let guard = 0;
    while (s <= now && guard++ < 120) {
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      trendBuckets.push({
        start: s, end: e,
        label: s.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      });
      s = e;
    }
  }
  const trendSeries = trendBuckets.map((b) => {
    const r = mulberry32(hashCode(b.label + 'trend'));
    const seasonal = 1 + 0.25 * Math.sin((b.start.getMonth() / 12) * Math.PI * 2 + 1);
    return { label: b.label, revenue: Math.round(115000 * seasonal * (0.75 + r() * 0.5)) };
  });

  let revenue = 0, jobs = 0, calls = 0, leads = 0;
  range.buckets.map((b) => {
    const r = mulberry32(hashCode(b.label + period));
    const days = bucketDays(b);
    const seasonal = 1 + 0.25 * Math.sin(b.start.getMonth() / 12 * Math.PI * 2 + 1);
    const v = Math.round(DAILY.revenue * days * seasonal * (0.6 + r() * 0.8));
    revenue += v;
    jobs += Math.round(DAILY.jobs * days * (0.5 + r()));
    calls += Math.round(DAILY.calls * days * (0.5 + r()));
    leads += Math.round(DAILY.leads * days * (0.5 + r()));
    return { label: b.label, revenue: v };
  });

  const prevFactor = 0.82 + rand() * 0.3; // previous period for delta arrows
  const utilization = 0.55 + rand() * 0.3;

  const ringbaCalls = Math.round(calls * 0.6);
  const adSpend = Math.round(revenue * 0.12);
  const adClicks = Math.round(leads * 3.5);
  const adImpressions = adClicks * 22;

  return {
    revenue: { value: revenue, prev: Math.round(revenue * prevFactor), series: trendSeries },
    jobs: { value: jobs, prev: Math.round(jobs * (0.8 + rand() * 0.35)) },
    utilization: { value: utilization, prev: utilization * (0.85 + rand() * 0.25) },
    leads: { value: leads, prev: Math.round(leads * (0.8 + rand() * 0.35)) },
    calls: {
      value: calls,
      prev: Math.round(calls * (0.8 + rand() * 0.35)),
      breakdown: { ringba: ringbaCalls, housecall: calls - ringbaCalls },
    },
    leadSources: {
      byCampaign: splitSources(ringbaCalls, [
        ['Google LSA', 0.42],
        ['Google Ads', 0.28],
        ['Google Business Profile', 0.16],
        ['Referral', 0.09],
        ['Yelp', 0.05],
      ]),
      byHcpSource: splitSources(jobs, [
        ['Google', 0.46],
        ['Repeat / Referral', 0.32],
        ['Untracked', 0.22],
      ]),
      totalCalls: ringbaCalls,
      totalJobs: jobs,
    },
    ads: {
      spend: adSpend,
      prevSpend: Math.round(adSpend * (0.8 + rand() * 0.35)),
      clicks: adClicks,
      prevClicks: Math.round(adClicks * (0.8 + rand() * 0.35)),
      impressions: adImpressions,
      ctr: adClicks / adImpressions,
      conversions: Math.round(leads * 0.6),
      costPerLead: leads > 0 ? adSpend / leads : null,
    },
    reviews: {
      rating: 4.82,
      count: 412,
      locations: [
        { id: 'm1', label: 'Tempe', rating: 4.9, count: 183 },
        { id: 'm2', label: 'Mesa', rating: 4.8, count: 121 },
        { id: 'm3', label: 'Phoenix', rating: 4.7, count: 108 },
      ],
      failures: [],
    },
    techCount: 5,
  };
}
