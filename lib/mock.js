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

export function mockMetrics(period, range) {
  const rand = mulberry32(hashCode(`riteaway-${period}`));

  let revenue = 0, jobs = 0, calls = 0, leads = 0;
  const series = range.buckets.map((b) => {
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

  return {
    revenue: { value: revenue, prev: Math.round(revenue * prevFactor), series },
    jobs: { value: jobs, prev: Math.round(jobs * (0.8 + rand() * 0.35)) },
    utilization: { value: utilization, prev: utilization * (0.85 + rand() * 0.25) },
    leads: { value: leads, prev: Math.round(leads * (0.8 + rand() * 0.35)) },
    calls: {
      value: calls,
      prev: Math.round(calls * (0.8 + rand() * 0.35)),
      breakdown: { ringba: ringbaCalls, housecall: calls - ringbaCalls },
    },
    techCount: 5,
  };
}
