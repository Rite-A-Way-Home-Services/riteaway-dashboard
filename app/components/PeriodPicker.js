'use client';

import { useEffect, useRef, useState } from 'react';

// Google-Ads-style range picker: preset list on the left, date inputs on the
// right. Emits either a named period or a custom from/to pair.

const d = (date) => date.toISOString().slice(0, 10);
const today = () => d(new Date());
const shift = (n) => d(new Date(Date.now() + n * 864e5));

function monthBounds(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: d(start), to: d(end) };
}

export const PRESETS = [
  { id: 'day', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday', range: () => ({ from: shift(-1), to: shift(-1) }) },
  { id: 'week', label: 'This week' },
  { id: 'last7', label: 'Last 7 days', range: () => ({ from: shift(-6), to: today() }) },
  { id: 'month', label: 'This month' },
  { id: 'last30', label: 'Last 30 days', range: () => ({ from: shift(-29), to: today() }) },
  { id: 'lastmonth', label: 'Last month', range: () => monthBounds(-1) },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
  { id: 'all', label: 'All time' },
];

const NAMED = new Set(['day', 'week', 'month', 'quarter', 'year', 'all']);

export function labelFor(presetId, range) {
  const p = PRESETS.find((x) => x.id === presetId);
  if (p) return p.label;
  if (range?.from && range?.to) {
    const fmt = (s) =>
      new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      });
    return `${fmt(range.from)} – ${fmt(range.to)}`;
  }
  return 'Custom';
}

export default function PeriodPicker({ preset, range, onApply }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(preset || 'month');
  const [from, setFrom] = useState(range?.from || shift(-29));
  const [to, setTo] = useState(range?.to || today());
  const box = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (open && box.current && !box.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function pick(p) {
    setSel(p.id);
    if (p.range) {
      const r = p.range();
      setFrom(r.from);
      setTo(r.to);
    }
  }

  const valid = from && to && from <= to;

  function apply() {
    const p = PRESETS.find((x) => x.id === sel);
    if (p && NAMED.has(p.id)) onApply({ preset: p.id, period: p.id });
    else if (p && p.range) {
      const r = p.range();
      onApply({ preset: p.id, period: 'custom', from: r.from, to: r.to });
    } else {
      if (!valid) return;
      onApply({ preset: 'custom', period: 'custom', from, to });
    }
    setOpen(false);
  }

  return (
    <div className="picker" ref={box}>
      <button className="picker-trigger" onClick={() => setOpen(!open)}>
        <span>{labelFor(preset, range)}</span>
        <span className="picker-caret">▾</span>
      </button>

      {open && (
        <div className="picker-panel">
          <div className="picker-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className={sel === p.id ? 'preset active' : 'preset'}
                onClick={() => pick(p)}
              >
                {p.label}
              </button>
            ))}
            <button
              className={sel === 'custom' ? 'preset active' : 'preset'}
              onClick={() => setSel('custom')}
            >
              Custom
            </button>
          </div>

          <div className="picker-dates">
            <label className="picker-field">
              <span>Start date</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => { setFrom(e.target.value); setSel('custom'); }}
              />
            </label>
            <span className="picker-dash">—</span>
            <label className="picker-field">
              <span>End date</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => { setTo(e.target.value); setSel('custom'); }}
              />
            </label>

            <div className="picker-actions">
              <button className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-small" onClick={apply} disabled={sel === 'custom' && !valid}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
