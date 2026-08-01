import { NextResponse } from 'next/server';
import { getTasks, saveTasks, isPersistent } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const STATUSES = ['open', 'in_progress', 'done'];

function clean(t) {
  return {
    id: t.id,
    title: String(t.title || '').slice(0, 300),
    status: STATUSES.includes(t.status) ? t.status : 'open',
    assignee: String(t.assignee || '').slice(0, 100),
    due: t.due || null,
    notes: String(t.notes || '').slice(0, 1000),
    createdAt: t.createdAt || new Date().toISOString(),
    completedAt: t.completedAt || null,
  };
}

export async function GET() {
  const tasks = await getTasks();
  return NextResponse.json({ tasks, persistent: isPersistent() });
}

export async function POST(req) {
  try {
    const body = await req.json();
    if (!String(body.title || '').trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    const tasks = await getTasks();
    const task = clean({
      ...body,
      id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    });
    const next = [task, ...tasks];
    await saveTasks(next);
    return NextResponse.json({ tasks: next });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const tasks = await getTasks();
    const i = tasks.findIndex((t) => t.id === body.id);
    if (i === -1) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const merged = clean({ ...tasks[i], ...body });
    // Stamp completion time when a task first reaches done.
    if (merged.status === 'done' && tasks[i].status !== 'done') {
      merged.completedAt = new Date().toISOString();
    }
    if (merged.status !== 'done') merged.completedAt = null;

    const next = [...tasks];
    next[i] = merged;
    await saveTasks(next);
    return NextResponse.json({ tasks: next });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}

export async function DELETE(req) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    const tasks = await getTasks();
    const next = tasks.filter((t) => t.id !== id);
    await saveTasks(next);
    return NextResponse.json({ tasks: next });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
