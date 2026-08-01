import { NextResponse } from 'next/server';
import { searchPlaces } from '@/lib/googleplaces';

export const dynamic = 'force-dynamic';

// Helper for finding the exact place ID of each Google listing.
//   /api/place-lookup?q=Rite-A-Way Garage Doors Tempe AZ
//   /api/place-lookup?q=query one|query two|query three
// Returns candidates (id, name, address, rating, count) so the right IDs can
// be pinned into GOOGLE_PLACE_IDS. Safe to leave in place — read-only.

export async function GET(req) {
  const raw = req.nextUrl.searchParams.get('q');
  if (!raw) return NextResponse.json({ error: 'pass ?q=search text' }, { status: 400 });
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not set' }, { status: 400 });
  }

  const queries = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const results = {};
  for (const q of queries) {
    try {
      results[q] = await searchPlaces(q, 3);
    } catch (e) {
      results[q] = { error: e.message };
    }
  }
  return NextResponse.json(results);
}
