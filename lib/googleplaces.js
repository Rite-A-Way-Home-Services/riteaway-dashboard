// Google Business Profile ratings via the public Places API (key only —
// no OAuth, no allowlisting). Supports MULTIPLE listings.
//
// Configure with either (place IDs strongly preferred — exact, no ambiguity):
//   GOOGLE_PLACE_IDS="ChIJ...,ChIJ...,ChIJ..."
//   GOOGLE_PLACE_QUERIES="Rite-A-Way Garage Doors Tempe AZ|Rite-A-Way ... Mesa AZ"
//     (pipe-separated, since queries contain commas)
//   GOOGLE_PLACE_LABELS="Tempe,Mesa,Phoenix,Peoria,Ash Ave"  (optional display names)
//
// Ratings/counts are CURRENT values — not period-scoped.

const BASE = 'https://places.googleapis.com/v1';
const CACHE_TTL = 10 * 60_000;

export function placesConfigured() {
  return Boolean(
    process.env.GOOGLE_PLACES_API_KEY &&
      (process.env.GOOGLE_PLACE_IDS ||
        process.env.GOOGLE_PLACE_QUERIES ||
        process.env.GOOGLE_PLACE_ID ||
        process.env.GOOGLE_PLACE_QUERY)
  );
}

function splitList(raw, sep) {
  return (raw || '').split(sep).map((s) => s.trim()).filter(Boolean);
}

function labels() {
  return splitList(process.env.GOOGLE_PLACE_LABELS, ',');
}

async function apiGet(path, fieldMask) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Places ${res.status}: ${(await res.text()).slice(0, 150)}`);
  return res.json();
}

// Exposed for the lookup endpoint: find candidate places for a text query.
export async function searchPlaces(textQuery, max = 3) {
  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount',
    },
    body: JSON.stringify({ textQuery, maxResultCount: max }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Places searchText ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  const json = await res.json();
  return (json.places || []).map((p) => ({
    id: p.id,
    name: p.displayName?.text || null,
    address: p.formattedAddress || null,
    rating: typeof p.rating === 'number' ? p.rating : null,
    count: Number(p.userRatingCount || 0),
  }));
}

async function resolveIds() {
  const explicit = [
    ...splitList(process.env.GOOGLE_PLACE_IDS, ','),
    ...(process.env.GOOGLE_PLACE_ID ? [process.env.GOOGLE_PLACE_ID.trim()] : []),
  ];
  if (explicit.length) return explicit;

  if (globalThis.__placeIds?.length) return globalThis.__placeIds;

  const queries = [
    ...splitList(process.env.GOOGLE_PLACE_QUERIES, '|'),
    ...(process.env.GOOGLE_PLACE_QUERY ? [process.env.GOOGLE_PLACE_QUERY.trim()] : []),
  ];
  const ids = [];
  for (const q of queries) {
    const hits = await searchPlaces(q, 1);
    if (hits[0]?.id) ids.push(hits[0].id);
  }
  globalThis.__placeIds = ids;
  return ids;
}

async function getOnePlace(placeId) {
  const json = await apiGet(
    `/places/${placeId}`,
    'displayName,formattedAddress,rating,userRatingCount'
  );
  return {
    id: placeId,
    name: json.displayName?.text || null,
    address: json.formattedAddress || null,
    rating: typeof json.rating === 'number' ? json.rating : null,
    count: Number(json.userRatingCount || 0),
  };
}

export async function getReviewSummary() {
  const cached = globalThis.__reviewCache;
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const ids = await resolveIds();
  if (!ids.length) throw new Error('No place IDs configured or resolvable');

  const settled = await Promise.allSettled(ids.map(getOnePlace));
  const nameOverrides = labels();

  const locations = [];
  const failures = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      locations.push({ ...r.value, label: nameOverrides[i] || r.value.name });
    } else {
      failures.push(`${ids[i]}: ${r.reason?.message || 'failed'}`);
    }
  });

  // Weighted average: a 5.0 from 3 reviews shouldn't outrank a 4.7 from 300.
  const rated = locations.filter((l) => l.rating != null && l.count > 0);
  const totalCount = rated.reduce((s, l) => s + l.count, 0);
  const weighted =
    totalCount > 0 ? rated.reduce((s, l) => s + l.rating * l.count, 0) / totalCount : null;

  const data = {
    rating: weighted,
    count: totalCount,
    locations: locations.sort((a, b) => (b.count || 0) - (a.count || 0)),
    failures,
  };

  globalThis.__reviewCache = { data, ts: Date.now() };
  return data;
}
