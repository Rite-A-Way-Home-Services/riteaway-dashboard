'use client';

import { useCallback, useEffect, useState } from 'react';
import Nav from '../components/Nav';

const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', done: 'Done' };
const ORDER = ['open', 'in_progress', 'done'];

const day = (s) =>
  s ? new Date(`${s}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function Tasks() {
  const [tasks, setTasks] = useState(null);
  const [error, setError] = useState('');
  const [persistent, setPersistent] = useState(true);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks', { cache: 'no-store' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTasks(json.tasks || []);
      setPersistent(json.persistent !== false);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function send(method, body, query = '') {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/tasks${query}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'request failed');
      setTasks(json.tasks || []);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await send('POST', { title, assignee, due: due || null });
    if (ok) { setTitle(''); setAssignee(''); setDue(''); }
  }

  const cycle = (s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length];

  const shown = (tasks || []).filter((t) =>
    filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'
  );
  const counts = {
    open: (tasks || []).filter((t) => t.status === 'open').length,
    in_progress: (tasks || []).filter((t) => t.status === 'in_progress').length,
    done: (tasks || []).filter((t) => t.status === 'done').length,
  };

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1>TASK TRACKER</h1>
          <div className="sub">
            {tasks
              ? `${counts.open} open · ${counts.in_progress} in progress · ${counts.done} done`
              : 'Loading…'}
          </div>
        </div>
        <div className="period-filter">
          {['active', 'done', 'all'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {f === 'active' ? 'Active' : f === 'done' ? 'Done' : 'All'}
            </button>
          ))}
        </div>
      </div>

      <Nav />

      {error && <div className="error-banner">⚠ {error}</div>}
      {!persistent && (
        <div className="error-banner" style={{ borderColor: 'var(--amber)', color: 'var(--amber)', background: '#fef3c7' }}>
          Tasks aren’t persisting — Upstash Redis isn’t configured for this environment.
        </div>
      )}

      <div className="dash-stack">
        <form className="card wide task-form" onSubmit={add}>
          <input
            className="search-input"
            style={{ flex: 2, minWidth: 220 }}
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="search-input"
            style={{ flex: 1, minWidth: 130 }}
            placeholder="Assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          />
          <input
            className="search-input"
            type="date"
            style={{ width: 150 }}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <button className="btn-small" type="submit" disabled={busy || !title.trim()}>
            Add task
          </button>
        </form>

        <div className="card wide">
          {!tasks && <div className="detail">Loading tasks…</div>}
          {tasks && shown.length === 0 && (
            <div className="detail">
              {filter === 'done' ? 'Nothing completed yet.' : 'No tasks — add one above.'}
            </div>
          )}
          {tasks && shown.length > 0 && (
            <div className="task-list">
              {shown.map((t) => {
                const overdue =
                  t.due && t.status !== 'done' && new Date(`${t.due}T23:59:59`) < new Date();
                return (
                  <div key={t.id} className={`task-row ${t.status === 'done' ? 'is-done' : ''}`}>
                    <button
                      className={`status-chip ${t.status}`}
                      onClick={() => send('PATCH', { id: t.id, status: cycle(t.status) })}
                      title="Click to advance status"
                    >
                      {STATUS_LABEL[t.status]}
                    </button>
                    <span className="task-title">{t.title}</span>
                    {t.assignee && <span className="task-meta">{t.assignee}</span>}
                    {t.due && (
                      <span className={`task-meta ${overdue ? 'overdue' : ''}`}>
                        due {day(t.due)}
                      </span>
                    )}
                    <button
                      className="btn-ghost task-delete"
                      onClick={() => send('DELETE', null, `?id=${encodeURIComponent(t.id)}`)}
                      aria-label="Delete task"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
