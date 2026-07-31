# Rite-A-Way Mission Control

Team dashboard for **missioncontrol.callriteaway.com** — revenue, jobs, tech utilization, break-even progress, lead volume, and call volume, filterable by day / week / month / quarter / year / all-time. Pulls live from Housecall Pro and Ringba; runs in demo **MOCK mode** until API keys are set.

## Deploy to Vercel (~10 minutes)

1. **Push this folder to a Git repo** (GitHub is easiest), or use `npx vercel` from this folder.
2. In [vercel.com](https://vercel.com) → **Add New Project** → import the repo. Framework auto-detects as Next.js; no build settings needed.
3. **Set environment variables** (Project → Settings → Environment Variables) — see the table below. Minimum for a protected live dashboard: `DASHBOARD_PASSWORD` and `HCP_API_KEY`.
4. **Point the domain:** Project → Settings → Domains → add `missioncontrol.callriteaway.com`. Then in your DNS provider for callriteaway.com, add a CNAME record: `missioncontrol` → `cname.vercel-dns.com`. Vercel provisions HTTPS automatically.
5. Redeploy after adding env vars (Deployments → ⋯ → Redeploy).

## Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DASHBOARD_PASSWORD` | Yes (prod) | Shared team password. **If unset, the dashboard is public.** |
| `HCP_API_KEY` | For live data | Housecall Pro → Settings → API (MAX plan or API add-on). Without it: mock mode. |
| `HCP_AUTH_SCHEME` | No | `Bearer` (default). If HCP returns 401 with a valid key, set to `Token`. |
| `RINGBA_API_TOKEN` / `RINGBA_ACCOUNT_ID` | For call data | Ringba portal → Integrations → API Tokens. Account ID starts with `RA`. |
| `BREAK_EVEN_MONTHLY` | No | Default monthly break-even (default 85000). Editable live in the UI. |
| `BUSINESS_START` | No | `YYYY-MM-DD`; start of "all-time" (default 2024-01-01). |
| `TECH_COUNT` | No | Override technician headcount for utilization; otherwise counted from HCP employees. |
| `WORK_HOURS_PER_DAY` | No | Default 8. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommended | Free Upstash Redis db so break-even edits persist for the whole team. Without it, edits revert to the env default when serverless instances recycle. |

## Metric definitions (v1 — all in `lib/metrics.js`)

- **Revenue** — sum of completed Housecall Pro job totals in the period.
- **Jobs** — HCP jobs scheduled in the period.
- **Tech utilization** — scheduled job hours ÷ (tech count × work hours/day × business days).
- **Call volume** — Ringba inbound calls + HCP-sourced calls. *v1 note: the HCP portion is 0 — HCP's public API doesn't expose call logs. If you use HCP's call tracking or another phone source, wire it into `computeLive()` where `hcpCalls` is defined.*
- **Lead volume** — HCP estimates created + unique Ringba inbound callers. A v1 heuristic; refine the formula in `lib/metrics.js` as you learn what correlates with real leads.
- **Break-even** — monthly target (editable in the dashboard header), prorated: day = ×12÷365, week = ×12÷52, quarter = ×3, year = ×12, all-time = × months since `BUSINESS_START`.

## Things to verify on first live run

Both vendors' docs are behind JS-rendered portals, so two integration details are marked for verification. Each is a one-line change:

1. **HCP auth header** — `lib/housecall.js` sends `Authorization: Bearer <key>`. If you get 401s, set `HCP_AUTH_SCHEME=Token`.
2. **Ringba call-log request** — `lib/ringba.js` POSTs to `/v2/{accountId}/calllogs` with `reportStart`/`reportEnd`. If the response shape differs, adjust the `records` extraction in that file.

Watch the yellow warning banners on the dashboard — API failures surface there rather than breaking the page.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in what you have
npm run dev                  # http://localhost:3000
```

No keys needed — it runs in mock mode out of the box.

## Security notes

- Everything except `/login` is gated by middleware when `DASHBOARD_PASSWORD` is set (30-day cookie).
- API keys live only in server-side env vars; they never reach the browser.
- This exposes revenue data — set the password before pointing DNS at it.
