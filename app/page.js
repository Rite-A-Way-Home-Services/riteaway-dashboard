'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

const PERIODS = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'quarter', label: 'Quarter' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All-Time' },
];

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

function BreakEven({ breakEven, revenue, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const progress = Math.min(breakEven.progress, 1);
  const over = breakEven.progress >= 1;

  return (
    <div className="card wide">
      <div className="breakeven-row">
        <div className="label">Break-Even Target</div>
        {editing ? (
          <span className="editable-target">
            <input
              type="number"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Monthly $"
              autoFocus
            />
            <button className="btn-small" onClick={() => { onSave(Number(draft)); setEditing(false); }}>Save</button>
            <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </span>
        ) : (
          <button
            className="btn-ghost"
            onClick={() => { setDraft(String(breakEven.monthlyTarget)); setEditing(true); }}
          >
            {usd(breakEven.monthlyTarget)}/mo — edit
          </button>
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

  const load = useCallback(async (p) => {
    setError('');
    try {
      const res = await fetch(`/api/metrics?period=${p}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      try { localStorage.setItem(`metrics:${p}`, JSON.stringify(json)); } catch {}
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    // Instant paint: show the last numbers we saw for this period while
    // fresh data loads in the background.
    let cachedShown = false;
    try {
      const cached = localStorage.getItem(`metrics:${period}`);
      if (cached) { setData(JSON.parse(cached)); cachedShown = true; }
    } catch {}
    if (!cachedShown) setData(null);

    load(period);
    if (paused) return; // a settings picker is open — don't refresh under it
    const t = setInterval(() => load(period), 300_000); // auto-refresh every 5 minutes
    return () => clearInterval(t);
  }, [period, load, paused]);

  async function saveBreakEven(monthly) {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyBreakEven: monthly }),
    });
    if (res.ok) load(period);
    else setError('Failed to save break-even target');
  }

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
      </div>

      {error && <div className="error-banner">⚠ {error}</div>}
      {data?.warnings?.map((w, i) => (
        <div key={i} className="error-banner" style={{ borderColor: 'var(--amber)', color: 'var(--amber)', background: 'rgba(251,191,36,0.08)' }}>
          {w}
        </div>
      ))}

      {!data && !error && <div className="spinner">Loading metrics…</div>}

      {data && (
        <>
          <BreakEven breakEven={data.breakEven} revenue={data.revenue.value} onSave={saveBreakEven} />

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
            <UtilizationCard data={data} onSaved={() => load(period)} onPickerOpen={setPaused} />
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
              <MetricCard
                label="Google Rating"
                value={`${data.reviews.rating.toFixed(1)} ★`}
                delta={<div className="delta flat">{num(data.reviews.count)} reviews</div>}
                detail="current total, not period-based"
              />
            )}
          </div>

          <div className="card wide chart-card">
            <div className="label">Revenue Trend</div>
            <div style={{ width: '100%', height: 260, marginTop: 16 }}>
              <ResponsiveContainer>
                <AreaChart data={data.revenue.series} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#1e2a45" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#8b9bbd" fontSize={11} tickLine={false} />
                  <YAxis stroke="#8b9bbd" fontSize={11} tickLine={false} tickFormatter={(v) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                  <Tooltip
                    formatter={(v) => [usd(v), 'Revenue']}
                    contentStyle={{ background: '#111a2e', border: '1px solid #1e2a45', borderRadius: 8, color: '#e8eefc' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#38bdf8" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="footer">
            Auto-refreshes every 5 min · Sources: Housecall Pro{data.mode === 'live' ? '' : ' (mock)'} + Ringba
          </div>
        </>
      )}
    </div>
  );
}
