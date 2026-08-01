'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '../components/Nav';
import PeriodPicker from '../components/PeriodPicker';

const usd = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const num = (n) => new Intl.NumberFormat('en-US').format(n || 0);
const day = (s) =>
  s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—';

function statusClass(s) {
  if (/approv|accept|won/i.test(s)) return 'pill green';
  if (/declin|lost|reject/i.test(s)) return 'pill red';
  return 'pill';
}

export default function Estimates() {
  const [sel, setSel] = useState({ preset: 'month', period: 'month' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async (s) => {
    setError('');
    const qs =
      s.period === 'custom'
        ? `period=custom&from=${s.from}&to=${s.to}`
        : `period=${s.period}`;
    try {
      const res = await fetch(`/api/estimates?${qs}`, { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { setData(null); load(sel); }, [sel, load]);

  const rows = (data?.estimates || []).filter((e) => {
    if (!q.trim()) return true;
    const hay = `${e.customer} ${e.city} ${e.number} ${e.status}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const t = data?.totals;

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>ESTIMATE TRACKER</h1>
          <div className="sub">
            {data ? `${num(data.estimates.length)} estimates · Housecall Pro${data.mode === 'mock' ? ' (mock)' : ''}` : 'Loading…'}
          </div>
        </div>
        <PeriodPicker
          preset={sel.preset}
          range={{ from: sel.from, to: sel.to }}
          onApply={setSel}
        />
      </div>

      <Nav />

      {error && <div className="error-banner">⚠ {error}</div>}
      {!data && !error && <div className="spinner">Loading estimates…</div>}

      {data && (
        <div className="dash-stack">
          <div className="grid">
            <div className="card">
              <div className="label">Estimates Sent</div>
              <div className="value">{num(t.count)}</div>
              <div className="detail">{usd(t.value)} total value</div>
            </div>
            <div className="card">
              <div className="label">Approved</div>
              <div className="value">{num(t.approvedCount)}</div>
              <div className="detail">{usd(t.approvedValue)} won</div>
            </div>
            <div className="card">
              <div className="label">Win Rate</div>
              <div className="value">{t.winRate == null ? '—' : `${Math.round(t.winRate * 100)}%`}</div>
              <div className="detail">of decided estimates</div>
            </div>
            <div className="card">
              <div className="label">Avg Estimate</div>
              <div className="value">{usd(t.avgTicket)}</div>
              <div className="detail">{num(t.pendingCount)} still pending</div>
            </div>
          </div>

          <div className="card wide">
            <div className="breakeven-row" style={{ marginBottom: 12 }}>
              <div className="label">All Estimates</div>
              <input
                className="search-input"
                placeholder="Filter by customer, city, status…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {rows.length === 0 ? (
              <div className="detail">No estimates in this range.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Estimate</th>
                      <th>Customer</th>
                      <th>City</th>
                      <th>Status</th>
                      <th className="right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((e) => (
                      <tr key={e.id}>
                        <td>{day(e.createdAt)}</td>
                        <td>{e.number || '—'}</td>
                        <td>{e.customer || '—'}</td>
                        <td>{e.city || '—'}</td>
                        <td><span className={statusClass(e.status)}>{e.status || 'unknown'}</span></td>
                        <td className="right">{usd(e.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
