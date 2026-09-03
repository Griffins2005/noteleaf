import { describe, expect, it } from 'vitest';
import { buildGoogleAuthorizeUrl } from '../googleOAuth';

describe('buildGoogleAuthorizeUrl', () => {
  it('sends the browser to Google with the Vercel callback', () => {
    const url = new URL(
      buildGoogleAuthorizeUrl('client-123', 'https://noteleaf.vercel.app/'),
    );

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://noteleaf.vercel.app/api/auth/google/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });
});
