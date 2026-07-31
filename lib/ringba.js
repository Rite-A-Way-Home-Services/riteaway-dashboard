// Ringba API client — call volume + unique callers for a date range.
// Docs: https://developers.ringba.com
// Auth: API token from Ringba portal (Integrations → API Tokens).

const BASE = () => process.env.RINGBA_BASE_URL || 'https://api.ringba.com/v2';

export function ringbaConfigured() {
  return Boolean(process.env.RINGBA_API_TOKEN && process.env.RINGBA_ACCOUNT_ID);
}

export async function getCalls(start, end) {
  const account = process.env.RINGBA_ACCOUNT_ID;
  const url = `${BASE()}/${account}/calllogs`;

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
        valueColumns: [
          { column: 'callDt' },
          { column: 'inboundPhoneNumber' },
        ],
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
