'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';

const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All-Time' },
  { id: 'custom', label: 'Custom' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const num = (n) => new Intl.NumberFormat('en-US').format(n || 0);
const pct = (n) => `${Math.round((n || 0) * 100)}%`;

function Delta({ value, prev, invert = false }) {
  if (prev == null || prev === 0) return <div className="delta flat">— vs prior period</div>;
  const change = (value - prev) / prev;
  const up = change >= 0;
  const good = invert ? !up : up;
  return (
    <div className={`delta ${good ? 'up' : 'down'}`}>
      {up ? '▲' : '▼'} {Math.abs(change * 100).toFixed(1)}% vs prior period
    </div>
  );
}

function MetricCard({ label, value, delta, detail }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {delta}
      {detail && <div className="detail">{detail}</div>}
    </div>
  );
}

function ReviewsCard({ reviews }) {
  const [open, setOpen] = useState(false);
  const many = (reviews.locations || []).length > 1;

  return (
    <div className="card">
      <div className="label">Google Rating</div>
      <div className="value">{reviews.rating.toFixed(2)} ★</div>
      <div className="delta flat">{num(reviews.count)} reviews</div>
      <div className="detail">
        {many ? `${reviews.locations.length} listings · weighted` : 'current total'}
        {many && (
          <>
            {' · '}
            <button
              className="btn-ghost"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setOpen(!open)}
            >
              {open ? 'hide' : 'by location'}
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          {reviews.locations.map((l) => (
            <div
              key={l.id}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '3px 0' }}
            >
              <span style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l.label || l.name}
              </span>
              <span style={{ whiteSpace: 'nowrap' }}>
                {l.rating != null ? `${l.rating.toFixed(1)} ★` : '—'}{' '}
                <span style={{ color: 'var(--text-dim)' }}>({num(l.count)})</span>
              </span>
            </div>
          ))}
          {reviews.failures?.length > 0 && (
            <div className="detail" style={{ color: 'var(--amber)', marginTop: 6 }}>
              {reviews.failures.length} listing(s) couldn’t be read
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UtilizationCard({ data, onSaved, onPickerOpen }) {
  const [open, setOpen] = useState(false);
  const [techs, setTechs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState('');
  const [saved, setSaved] = useState(false);

  function close() {
    setOpen(false);
    onPickerOpen(false);
  }

  async function openPicker() {
    setOpen(true);
    setSaved(false);
    onPickerOpen(true); // pause auto-refresh so the list can't reset under you
    setPickError('');
    setTechs(null);
    try {
      const res = await fetch('/api/technicians', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const selected = json.selected || [];
      setTechs(
        (json.technicians || []).map((t) => ({
          ...t,
          checked: selected.length ? selected.includes(t.name) : false,
        }))
      );
    } catch (e) {
      setPickError(e.message);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const names = techs.filter((t) => t.checked).map((t) => t.name);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ techNames: names }),
      });
      if (!res.ok) throw new Error('save failed');
      const json = await res.json();
      // Reflect exactly what the server stored, so a failed write can't look
      // like a success.
      const stored = json.techNames || [];
      setTechs((cur) => cur.map((t) => ({ ...t, checked: stored.includes(t.name) })));
      setSaved(true);
      onSaved();
    } catch (e) {
      setPickError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="label">Tech Utilization</div>
      <div className="value">{pct(data.utilization.value)}</div>
      <Delta value={data.utilization.value} prev={data.utilization.prev} />
      <div className="detail">
        {data.techCount} technician{data.techCount === 1 ? '' : 's'}
        {' · '}
        <button
          className="btn-ghost"
          style={{ padding: '2px 8px', fontSize: 11 }}
          onClick={() => (open ? close() : openPicker())}
        >
          {open ? 'close' : 'choose techs'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {pickError && <div className="detail" style={{ color: 'var(--red)' }}>{pickError}</div>}
          {!techs && !pickError && <div className="detail">Loading technicians…</div>}
          {techs && (
            <>
              {techs.map((t, i) => (
                <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '3px 0', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={t.checked}
                    onChange={(e) => {
                      const next = [...techs];
                      next[i] = { ...t, checked: e.target.checked };
                      setTechs(next);
                    }}
                  />
                  {t.name}
                </label>
              ))}
              <div className="detail" style={{ margin: '6px 0' }}>
                Unchecked everyone = automatic detection
              </div>
              <button className="btn-small" onClick={save} disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              {saved && (
                <span style={{ color: 'var(--green)', fontSize: 12, marginLeft: 8 }}>
                  ✓ Saved ({techs.filter((t) => t.checked).length} selected)
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function BreakEven({ breakEven, revenue, onSave, onEditOpen }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [draft, setDraft] = useState('');
  const progress = Math.min(breakEven.progress, 1);
  const over = breakEven.progress >= 1;

  // Tolerate "$175,000" style input.
  const parsed = Number(String(draft).replace(/[^0-9.]/g, ''));
  const valid = Number.isFinite(parsed) && parsed > 0;

  function close() {
    setEditing(false);
    setErr('');
    onEditOpen(false);
  }

  async function commit() {
    if (!valid) { setErr('enter a number'); return; }
    setBusy(true);
    setErr('');
    try {
      const ok = await onSave(parsed);
      if (ok === false) throw new Error('save failed');
      setSaved(true);
      close();
    } catch (e) {
      setErr(e.message || 'save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card wide">
      <div className="breakeven-row">
        <div className="label">Break-Even Target</div>
        {editing ? (
          <span className="editable-target">
            <input
              type="text"
              inputMode="numeric"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid) commit(); }}
              placeholder="Monthly $"
              autoFocus
            />
            <button className="btn-small" onClick={commit} disabled={busy || !valid}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn-ghost" onClick={close}>Cancel</button>
            {err && <span style={{ color: 'var(--red)', fontSize: 12 }}>{err}</span>}
          </span>
        ) : (
          <span className="editable-target">
            <button
              className="btn-ghost"
              onClick={() => {
                setDraft(String(breakEven.monthlyTarget));
                setErr(''); setSaved(false); setEditing(true);
                onEditOpen(true); // pause auto-refresh while typing
              }}
            >
              {usd(breakEven.monthlyTarget)}/mo — edit
            </button>
            {saved && <span style={{ color: 'var(--green)', fontSize: 12 }}>✓ Saved</span>}
          </span>
        )}
      </div>
      <div className="breakeven-bar">
        <div
          className="fill"
          style={{
            width: `${progress * 100}%`,
            background: over ? 'var(--green)' : progress > 0.7 ? 'var(--amber)' : 'var(--accent)',
          }}
        />
      </div>
      <div className="breakeven-row">
        <span className="detail" style={{ color: 'var(--text-dim)', fontSize: 13 }}>
          {usd(revenue)} of {usd(breakEven.periodTarget)} target this period
        </span>
        <span style={{ fontWeight: 700, color: over ? 'var(--green)' : 'var(--text)' }}>
          {pct(breakEven.progress)}{over ? ' ✓ past break-even' : ''}
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const [from, setFrom] = useState(daysAgoStr(29));
  const [to, setTo] = useState(todayStr());
  // Only the applied range triggers fetches — typing a date shouldn't.
  const [applied, setApplied] = useState({ from: daysAgoStr(29), to: todayStr() });

  const load = useCallback(async (p, range) => {
    setError('');
    const qs =
      p === 'custom'
        ? `period=custom&from=${range.from}&to=${range.to}`
        : `period=${p}`;
    try {
      const res = await fetch(`/api/metrics?${qs}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      try { localStorage.setItem(`metrics:${qs}`, JSON.stringify(json)); } catch {}
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    // Instant paint: show the last numbers we saw for this period while
    // fresh data loads in the background.
    let cachedShown = false;
    const key =
      period === 'custom'
        ? `metrics:period=custom&from=${applied.from}&to=${applied.to}`
        : `metrics:period=${period}`;
    try {
      const cached = localStorage.getItem(key);
      if (cached) { setData(JSON.parse(cached)); cachedShown = true; }
    } catch {}
    if (!cachedShown) setData(null);

    load(period, applied);
    if (paused) return; // a settings picker is open — don't refresh under it
    const t = setInterval(() => load(period, applied), 300_000); // every 5 minutes
    return () => clearInterval(t);
  }, [period, load, paused, applied]);

  async function saveBreakEven(monthly) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyBreakEven: monthly }),
    });
    if (!res.ok) return false;
    await load(period, applied);
    return true;
  }

  const customValid = from && to && from <= to;

  // Chart ceiling: tallest bar or the break-even line, whichever is higher.
  const chartMax = data
    ? Math.ceil(
        (Math.max(
          ...data.revenue.series.map((s) => s.revenue || 0),
          data.breakEven.monthlyTarget || 0
        ) *
          1.08) /
          1000
      ) * 1000
    : 0;

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>
            RITE-A-WAY MISSION CONTROL
            {data && <span className={`badge ${data.mode}`}>{data.mode.toUpperCase()}</span>}
          </h1>
          <div className="sub">
            {data
              ? `${new Date(data.range.start).toLocaleDateString('en-US', { timeZone: 'UTC' })} → ${new Date(data.range.end).toLocaleDateString('en-US', { timeZone: 'UTC' })} · updated ${new Date(data.generatedAt).toLocaleTimeString()}`
              : 'Loading…'}
          </div>
        </div>
        <div>
          <div className="period-filter">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                className={period === p.id ? 'active' : ''}
                onClick={() => setPeriod(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <div className="date-range">
              <input
                type="date"
                value={from}
                max={to || todayStr()}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="Start date"
              />
              <span className="detail">→</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                aria-label="End date"
              />
              <button
                className="btn-small"
                disabled={!customValid}
                onClick={() => setApplied({ from, to })}
              >
                Apply
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}
      {data?.warnings?.map((w, i) => (
        <div key={i} className="error-banner" style={{ borderColor: 'var(--amber)', color: 'var(--amber)', background: 'rgba(251,191,36,0.08)' }}>
          {w}
        </div>
      ))}

      {!data && !error && <div className="spinner">Loading metrics…</div>}

      {data && (
        <div className="dash-stack">
          <BreakEven
            breakEven={data.breakEven}
            revenue={data.revenue.value}
            onSave={saveBreakEven}
            onEditOpen={setPaused}
          />

          <div className="grid">
            <MetricCard
              label="Revenue"
              value={usd(data.revenue.value)}
              delta={<Delta value={data.revenue.value} prev={data.revenue.prev} />}
            />
            <MetricCard
              label="Jobs"
              value={num(data.jobs.value)}
              delta={<Delta value={data.jobs.value} prev={data.jobs.prev} />}
            />
            <UtilizationCard data={data} onSaved={() => load(period, applied)} onPickerOpen={setPaused} />
            <MetricCard
              label="Lead Volume"
              value={num(data.leads.value)}
              delta={<Delta value={data.leads.value} prev={data.leads.prev} />}
            />
            <MetricCard
              label="Call Volume"
              value={num(data.calls.value)}
              delta={<Delta value={data.calls.value} prev={data.calls.prev} />}
              detail={`Ringba ${num(data.calls.breakdown.ringba)} · HCP ${num(data.calls.breakdown.housecall)}`}
            />

            {data.ads && (
              <>
                <MetricCard
                  label="Ad Spend"
                  value={usd(data.ads.spend)}
                  delta={<Delta value={data.ads.spend} prev={data.ads.prevSpend} invert />}
                  detail={
                    data.ads.costPerLead != null
                      ? `${usd(data.ads.costPerLead)} per lead`
                      : 'no leads yet this period'
                  }
                />
                <MetricCard
                  label="Ad Clicks"
                  value={num(data.ads.clicks)}
                  delta={<Delta value={data.ads.clicks} prev={data.ads.prevClicks} />}
                  detail={`${num(data.ads.impressions)} impressions · ${(data.ads.ctr * 100).toFixed(1)}% CTR`}
                />
              </>
            )}

            {data.reviews && data.reviews.rating != null && (
              <ReviewsCard reviews={data.reviews} />
            )}
          </div>

          <div className="card wide chart-card">
            <div className="label">
              Revenue Trend {data.trendStartLabel ? `· monthly since ${data.trendStartLabel}` : ''}
            </div>
            <div style={{ width: '100%', height: 260, marginTop: 16 }}>
              <ResponsiveContainer>
                <BarChart data={data.revenue.series} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" stroke="#5c6b82" fontSize={11} tickLine={false} />
                  {/* Domain always includes the break-even line so it stays visible. */}
                  <YAxis
                    stroke="#5c6b82"
                    fontSize={11}
                    tickLine={false}
                    domain={[0, chartMax]}
                    tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                  />
                  <Tooltip
                    formatter={(v) => [usd(v), 'Revenue']}
                    cursor={{ fill: 'rgba(3,105,161,0.06)' }}
                    contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, color: '#131a26', boxShadow: '0 4px 12px rgba(16,24,40,0.08)' }}
                  />
                  {/* Green bars cleared break-even that month, blue fell short.
                      Animation off: it can leave bars stuck at zero height. */}
                  <Bar
                    dataKey="revenue"
                    fill="#0369a1"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={48}
                    isAnimationActive={false}
                  >
                    {data.revenue.series.map((d, i) => (
                      <Cell
                        key={i}
                        fill={d.revenue >= data.breakEven.monthlyTarget ? '#15803d' : '#0369a1'}
                      />
                    ))}
                  </Bar>
                  {/* Monthly break-even line — months above it cleared costs. */}
                  <ReferenceLine
                    y={data.breakEven.monthlyTarget}
                    stroke="#15803d"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    ifOverflow="extendDomain"
                    label={{
                      value: `break-even ${usd(data.breakEven.monthlyTarget)}`,
                      position: 'insideTopLeft',
                      fill: '#15803d',
                      fontSize: 11,
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="footer">
            Auto-refreshes every 5 min · Sources: Housecall Pro{data.mode === 'live' ? '' : ' (mock)'} + Ringba
          </div>
        </div>
      )}
    </div>
  );
}
