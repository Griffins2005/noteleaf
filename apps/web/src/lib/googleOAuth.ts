const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Same query the API used for GET /api/auth/google — account picker, no backend hop. */
export function buildGoogleAuthorizeUrl(clientId: string, appOrigin: string): string {
  const origin = appOrigin.replace(/\/$/, '');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export function resolveAppOrigin(): string {
  const fromEnv = process.env['NEXT_PUBLIC_APP_URL']?.replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (process.env['VERCEL_URL']) return `https://${process.env['VERCEL_URL']}`;
  return 'http://localhost:3000';
}
