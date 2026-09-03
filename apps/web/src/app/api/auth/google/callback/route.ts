import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Google returns here. Show Noteleaf immediately — do not proxy the browser to Render,
 * or they will see Render's "loading application" page on a cold start.
 */
export function GET(request: Request) {
  const q = JSON.stringify(new URL(request.url).search);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Signing in — Noteleaf</title>
  <style>
    html, body { height: 100%; margin: 0; background: #f6f1e8; }
    body {
      display: flex; align-items: center; justify-content: center;
      font-family: ui-serif, Georgia, serif; color: #1a1a1a;
    }
    .wrap { text-align: center; padding: 24px; }
    .mark {
      width: 40px; height: 40px; border-radius: 11px; margin: 0 auto 16px;
      background: linear-gradient(145deg, #1fa463 0%, #0d7a47 100%);
      box-shadow: 0 3px 12px rgba(13,122,71,0.35);
    }
    h1 { font-size: 22px; font-weight: 500; margin: 0 0 8px; }
    p { font-size: 13px; font-family: ui-monospace, monospace; color: #6b6560; margin: 0; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="mark" aria-hidden="true"></div>
    <h1>Signing you in…</h1>
    <p>Finishing Google sign-in</p>
  </div>
  <script>
    fetch('/api/auth/google/complete' + ${q}, { credentials: 'include', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { location.replace((d && d.redirect) || '/'); })
      .catch(function () { location.replace('/auth?error=google_failed'); });
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
