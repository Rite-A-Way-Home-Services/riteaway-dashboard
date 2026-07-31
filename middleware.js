import { NextResponse } from 'next/server';

// Protect everything except the login page, the auth endpoint, and Next.js internals.
export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)'],
};

async function sha256Hex(input) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(req) {
  const password = process.env.DASHBOARD_PASSWORD;
  // No password configured -> open access (useful for local dev; set one in production!)
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get('ra_auth')?.value;
  const expected = await sha256Hex(`${password}::riteaway-dash`);
  if (cookie === expected) return NextResponse.next();

  // API requests get a 401 instead of a redirect
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}
