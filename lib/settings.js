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
