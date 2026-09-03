import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function apiBase(): string {
  return (process.env['API_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001')
    .replace(/\/$/, '');
}

/**
 * Server-side exchange with Render. Cookies are copied onto this Vercel response
 * so the browser never visits onrender.com.
 */
export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const dest = `${apiBase()}/api/auth/google/callback?${incoming.searchParams.toString()}`;

  let upstream: Response;
  try {
    upstream = await fetch(dest, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        cookie: request.headers.get('cookie') ?? '',
        'x-forwarded-host': incoming.host,
        'x-forwarded-proto': incoming.protocol.replace(':', ''),
      },
    });
  } catch {
    return NextResponse.json({ redirect: '/auth?error=google_failed' });
  }

  let redirectTo = '/';
  const loc = upstream.headers.get('location');
  if (loc) {
    try {
      const resolved = new URL(loc, incoming.origin);
      redirectTo = `${resolved.pathname}${resolved.search}`;
    } catch {
      redirectTo = loc.startsWith('/') ? loc : '/';
    }
  } else if (!upstream.ok) {
    redirectTo = '/auth?error=google_failed';
  }

  const res = NextResponse.json({ redirect: redirectTo });
  const cookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : [];
  for (const cookie of cookies) {
    res.headers.append('set-cookie', cookie.replace(/;\s*Domain=[^;]+/i, ''));
  }
  return res;
}
