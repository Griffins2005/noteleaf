import { NextResponse } from 'next/server';
import { buildGoogleAuthorizeUrl, resolveAppOrigin } from '@/lib/googleOAuth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Instant 302 to Google. Render only handles the callback after the user picks an account,
 * so a cold API does not show its boot screen on "Continue with Google".
 */
export function GET() {
  const origin = resolveAppOrigin();
  const clientId =
    process.env['GOOGLE_CLIENT_ID'] ?? process.env['NEXT_PUBLIC_GOOGLE_CLIENT_ID'] ?? '';

  if (clientId) {
    return NextResponse.redirect(buildGoogleAuthorizeUrl(clientId, origin));
  }

  const api = process.env['API_INTERNAL_URL']?.replace(/\/$/, '');
  if (api) {
    return NextResponse.redirect(`${api}/api/auth/google`);
  }

  return NextResponse.redirect(new URL('/auth?error=google_failed', origin));
}
