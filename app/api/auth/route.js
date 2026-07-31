import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(req) {
  const { password } = await req.json();
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected) {
    return NextResponse.json({ ok: true, note: 'no password configured' });
  }
  if (password !== expected) {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }

  const hash = crypto.createHash('sha256').update(`${expected}::riteaway-dash`).digest('hex');
  const res = NextResponse.json({ ok: true });
  res.cookies.set('ra_auth', hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
  return res;
}
