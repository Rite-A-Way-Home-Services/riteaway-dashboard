// Break-even target storage.
// Uses Upstash Redis (REST) when configured -> shared, persistent across the team.
// Falls back to in-memory + env default otherwise (fine for trying things out;
// serverless instances recycle, so set up Upstash for production).

const KEY = 'riteaway:breakEvenMonthly';

function upstash() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function envDefault() {
  const n = Number(process.env.BREAK_EVEN_MONTHLY);
  return Number.isFinite(n) && n > 0 ? n : 85000;
}

export async function getBreakEvenMonthly() {
  const kv = upstash();
  if (kv) {
    try {
      const res = await fetch(`${kv.url}/get/${KEY}`, {
        headers: { Authorization: `Bearer ${kv.token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      const n = Number(json.result);
      if (Number.isFinite(n) && n > 0) return n;
    } catch (e) {
      console.error('Upstash read failed:', e.message);
    }
  }
  if (Number.isFinite(globalThis.__breakEvenMonthly)) return globalThis.__breakEvenMonthly;
  return envDefault();
}

export async function setBreakEvenMonthly(value) {
  // Accept "175,000", "$175000", 175000 — anything a human would type.
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) throw new Error('Break-even target must be a positive number');

  const kv = upstash();
  if (kv) {
    const res = await fetch(`${kv.url}/set/${KEY}/${n}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    if (!res.ok) throw new Error('Failed to persist to Upstash');
  }
  globalThis.__breakEvenMonthly = n;
  return n;
}

export function isPersistent() {
  return Boolean(upstash());
}

// ── Generic JSON value helpers (Upstash-backed, memory fallback) ──

async function kvGetJSON(key, fallback) {
  const kv = upstash();
  if (kv) {
    try {
      const res = await fetch(`${kv.url}/get/${key}`, {
        headers: { Authorization: `Bearer ${kv.token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.result) return JSON.parse(json.result);
    } catch (e) {
      console.error(`Upstash read ${key} failed:`, e.message);
    }
  }
  if (globalThis.__mem?.[key] !== undefined) return globalThis.__mem[key];
  return fallback;
}

async function kvSetJSON(key, value) {
  const kv = upstash();
  if (kv) {
    const res = await fetch(`${kv.url}/set/${key}/${encodeURIComponent(JSON.stringify(value))}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    if (!res.ok) throw new Error('Failed to persist to Upstash');
  }
  if (!globalThis.__mem) globalThis.__mem = {};
  globalThis.__mem[key] = value;
  return value;
}

// ── Manual review entry (service-area GBP listings) ────────────
// Google's public API can't see service-area listings, so these two numbers
// are entered by hand and folded into the headline rating.

const MANUAL_REVIEWS_KEY = 'riteaway:manualReviews';

export async function getManualReviews() {
  const v = await kvGetJSON(MANUAL_REVIEWS_KEY, { count: 0, rating: 0 });
  return {
    count: Number(v?.count) || 0,
    rating: Number(v?.rating) || 0,
  };
}

export async function setManualReviews({ count, rating }) {
  const c = Number(String(count ?? '').replace(/[^0-9.]/g, ''));
  const r = Number(String(rating ?? '').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(c) || c < 0) throw new Error('Review count must be 0 or more');
  if (!Number.isFinite(r) || r < 0 || r > 5) throw new Error('Rating must be between 0 and 5');
  return kvSetJSON(MANUAL_REVIEWS_KEY, { count: Math.round(c), rating: r });
}

// ── Task tracker ──────────────────────────────────────────────

const TASKS_KEY = 'riteaway:tasks';

export async function getTasks() {
  const list = await kvGetJSON(TASKS_KEY, []);
  return Array.isArray(list) ? list : [];
}

export async function saveTasks(list) {
  return kvSetJSON(TASKS_KEY, list);
}

// ── Technician selection (for utilization) ─────────────────────
// Stored as a JSON array of employee display names. Empty = auto-detect.

const TECH_KEY = 'riteaway:techNames';

function envTechNames() {
  return (process.env.TECH_NAMES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getTechNames() {
  const kv = upstash();
  if (kv) {
    try {
      const res = await fetch(`${kv.url}/get/${TECH_KEY}`, {
        headers: { Authorization: `Bearer ${kv.token}` },
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.result) {
        const arr = JSON.parse(json.result);
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {
      console.error('Upstash tech read failed:', e.message);
    }
  }
  if (Array.isArray(globalThis.__techNames)) return globalThis.__techNames;
  return envTechNames();
}

export async function setTechNames(names) {
  if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) {
    throw new Error('techNames must be an array of strings');
  }
  const clean = names.map((n) => n.trim()).filter(Boolean);
  const kv = upstash();
  if (kv) {
    const res = await fetch(`${kv.url}/set/${TECH_KEY}/${encodeURIComponent(JSON.stringify(clean))}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    if (!res.ok) throw new Error('Failed to persist to Upstash');
  }
  globalThis.__techNames = clean;
  return clean;
}
