// Ringba API client — call volume + unique callers for a date range.
// Docs: https://developers.ringba.com
// Auth: API token from Ringba portal (Integrations → API Tokens).

const BASE = () => process.env.RINGBA_BASE_URL || 'https://api.ringba.com/v2';

export function ringbaConfigured() {
  return Boolean(process.env.RINGBA_API_TOKEN && process.env.RINGBA_ACCOUNT_ID);
}

// Internal fetch. `withCampaign` adds the campaign column (the lead source).
// Kept separate so getCalls can retry without it if Ringba rejects the column,
// ensuring an extra reporting column can never break core call volume.
async function fetchCalls(start, end, withCampaign) {
  const account = process.env.RINGBA_ACCOUNT_ID;
  const url = `${BASE()}/${account}/calllogs`;

  const valueColumns = [
    { column: 'callDt' },
    { column: 'inboundPhoneNumber' },
  ];
  if (withCampaign) valueColumns.push({ column: 'campaignName' });

  const rows = [];
  let offset = 0;
  const size = 1000;

  for (let page = 0; page < 20; page++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${process.env.RINGBA_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reportStart: new Date(start).toISOString(),
        reportEnd: new Date(end).toISOString(),
        offset,
        size,
        valueColumns,
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ringba calllogs -> ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = await res.json();
    const records = json?.report?.records || json?.records || [];
    rows.push(...records);
    if (records.length < size) break;
    offset += size;
  }

  const uniqueCallers = new Set(
    rows.map((r) => r.inboundPhoneNumber || r.inbound_phone_number).filter(Boolean)
  );

  return { total: rows.length, uniqueCallers: uniqueCallers.size, rows };
}

export async function getCalls(start, end) {
  // Prefer the enriched request (with campaign for lead-source reporting).
  // If Ringba rejects the extra column (4xx), fall back to the minimal set so
  // call volume keeps working — campaigns just show as "Untracked" then.
  try {
    return await fetchCalls(start, end, true);
  } catch (e) {
    if (/-> 4\d\d/.test(String(e.message))) {
      return await fetchCalls(start, end, false);
    }
    throw e;
  }
}

// Count calls per Ringba campaign (the lead source). Blank/missing → "Untracked".
export function callsByCampaign(rows = []) {
  const counts = new Map();
  for (const r of rows) {
    const name =
      (r.campaignName || r.campaign_name || r.campaign || '').toString().trim() || 'Untracked';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return counts;
}
