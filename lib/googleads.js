// Google Ads: spend, clicks, impressions, CTR for a date range.
//
// Requires (all from Google, see README):
//   GOOGLE_ADS_DEVELOPER_TOKEN   — Ads account → API Center (needs approval)
//   GOOGLE_ADS_CLIENT_ID / _SECRET / _REFRESH_TOKEN  — OAuth2 credentials
//   GOOGLE_ADS_CUSTOMER_ID       — target account, digits only (no dashes)
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID — optional, manager (MCC) account id
//
// Until those exist the dashboard simply omits ad metrics.

const API_VERSION = 'v18';

export function adsConfigured() {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN &&
      process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}

// Access tokens last ~1h; cache until shortly before expiry.
async function accessToken() {
  const cached = globalThis.__adsToken;
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`OAuth refresh ${res.status}: ${(await res.text()).slice(0, 150)}`);
  }
  const json = await res.json();
  globalThis.__adsToken = {
    token: json.access_token,
    expires: Date.now() + (json.expires_in || 3600) * 1000,
  };
  return json.access_token;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

export async function getAdMetrics(start, end) {
  const token = await accessToken();
  const customerId = String(process.env.GOOGLE_ADS_CUSTOMER_ID).replace(/\D/g, '');

  const headers = {
    Authorization: `Bearer ${token}`,
    'developer-token': process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    'Content-Type': 'application/json',
  };
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    headers['login-customer-id'] = String(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID).replace(/\D/g, '');
  }

  const query = `
    SELECT metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
    FROM customer
    WHERE segments.date BETWEEN '${ymd(start)}' AND '${ymd(end)}'
  `;

  const res = await fetch(
    `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
    { method: 'POST', headers, body: JSON.stringify({ query }), cache: 'no-store' }
  );
  if (!res.ok) {
    throw new Error(`Google Ads ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const json = await res.json();
  let spend = 0, clicks = 0, impressions = 0, conversions = 0;
  for (const row of json.results || []) {
    const m = row.metrics || {};
    spend += Number(m.costMicros || 0) / 1e6;
    clicks += Number(m.clicks || 0);
    impressions += Number(m.impressions || 0);
    conversions += Number(m.conversions || 0);
  }

  return {
    spend,
    clicks,
    impressions,
    conversions,
    ctr: impressions > 0 ? clicks / impressions : 0,
  };
}
