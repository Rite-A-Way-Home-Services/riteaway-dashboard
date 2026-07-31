// Google Business Profile rating + review count via the public Places API.
// Needs only GOOGLE_PLACES_API_KEY (Cloud console → enable "Places API (New)").
// No OAuth, no allowlisting.
//
// Set GOOGLE_PLACE_ID directly, or leave it blank and set GOOGLE_PLACE_QUERY
// (e.g. "Rite-A-Way Garage Doors Phoenix") and we'll resolve the ID once and
// cache it in memory.
//
// Note: rating/review count are CURRENT values, not period-scoped.

const BASE = 'https://places.googleapis.com/v1';

export function placesConfigured() {
  return Boolean(
    process.env.GOOGLE_PLACES_API_KEY &&
      (process.env.GOOGLE_PLACE_ID || process.env.GOOGLE_PLACE_QUERY)
  );
}

async function resolvePlaceId() {
  if (process.env.GOOGLE_PLACE_ID) return process.env.GOOGLE_PLACE_ID;
  if (globalThis.__placeId) return globalThis.__placeId;

  const res = await fetch(`${BASE}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName',
    },
    body: JSON.stringify({ textQuery: process.env.GOOGLE_PLACE_QUERY }),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Places searchText ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  const json = await res.json();
  const id = json.places?.[0]?.id;
  if (!id) throw new Error(`No place found for "${process.env.GOOGLE_PLACE_QUERY}"`);
  globalThis.__placeId = id;
  return id;
}

export async function getReviewSummary() {
  const placeId = await resolvePlaceId();

  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_PLACES_API_KEY,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Places details ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  const json = await res.json();

  return {
    name: json.displayName?.text || null,
    rating: typeof json.rating === 'number' ? json.rating : null,
    count: Number(json.userRatingCount || 0),
    // Up to 5 most-recent snippets Google exposes publicly
    recent: (json.reviews || []).slice(0, 5).map((r) => ({
      rating: r.rating ?? null,
      text: r.text?.text || r.originalText?.text || '',
      when: r.publishTime || null,
      author: r.authorAttribution?.displayName || null,
    })),
  };
}
