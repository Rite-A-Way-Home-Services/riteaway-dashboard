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
  const n = Number(value);
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
