// Google Business Profile ratings via the public Places API (key only —
// no OAuth, no allowlisting). Pulls MULTIPLE listings live by Place ID.
//
// The listings are fixed below (DEFAULT_PLACES) so every location is pulled
// automatically — no hand-entry. Override without a code change via env:
//   GOOGLE_PLACE_IDS="ChIJ...,ChIJ..."            (comma-separated Place IDs)
//   GOOGLE_PLACE_LABELS="Tempe,North Scottsdale"  (optional display names, in order)
//
// Ratings/counts are CURRENT values — not period-scoped.

const BASE = 'https://places.googleapis.com/v1';
const CACHE_TTL = 10 * 60_000;

// Rite-A-Way's Google Business Profile listings (Place IDs are public, exact
// identifiers — no query ambiguity). Update here if a listing is added/removed.
const DEFAULT_PLACES = [
  { label: 'Tempe (Ash Ave)', id: 'ChIJx-PdjGixK4cRcaembC3Q1Kw' },
  { label: 'North Scottsdale', id: 'ChIJYbPFLoUf-YQR9hlqtRVeCAA' },
  { label: 'Biltmore', id: 'ChIJS-T5Io1SpK8RTSxxmGRgdko' },
  { label: 'Peoria', id: 'ChIJy12fP5U_zawRKigo8t9978I' },
  { label: 'Old Town', id: 'ChIJS7GLzVCzRysReK9laahk2O4' },
];

export function placesConfigured() {
  // Listings are built in, so reviews work as soon as the API key is present.
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

function splitList(raw, sep) {
  return (raw || '').split(sep).map((s) => s.trim()).filter(Boolean);
}

// Env override (Place IDs + optional labels), else the built-in listing set.
function resolvePlaces() {
  const envIds = splitList(process.env.GOOGLE_PLACE_IDS, ',');
  if (envIds.length) {
    const lbls = splitList(process.env.GOOGLE_PLACE_LABELS, ',');
    return envIds.map((id, i) => ({ id, label: lbls[i] || null }));
  }
  return DEFAULT_PLACES;
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

  const places = resolvePlaces();
  if (!places.length) throw new Error('No place IDs configured');

  const settled = await Promise.allSettled(places.map((p) => getOnePlace(p.id)));

  const locations = [];
  const failures = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      locations.push({ ...r.value, label: places[i].label || r.value.name });
    } else {
      failures.push(`${places[i].id}: ${r.reason?.message || 'failed'}`);
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
