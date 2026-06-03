'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';

// ─── Google icon ──────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'idle' | 'sent';

interface ApiResp<T> {
  success: boolean;
  data?:   T;
  error?:  { code: string; message: string };
}

// ─── SignInPage ────────────────────────────────────────────────────────────────

export function SignInPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const setAuth      = useAuthStore((s) => s.setAuth);
  const isInit       = useAuthStore((s) => s.isInitialized);
  const user         = useAuthStore((s) => s.user);

  const [email,     setEmail]     = useState('');
  const [code,      setCode]      = useState('');
  const [step,      setStep]      = useState<Step>('idle');
  const [sending,   setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [devCode,   setDevCode]   = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isInit && user) router.replace('/');
  }, [isInit, user, router]);

  // Handle Google OAuth errors redirected back to /auth
  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError === 'google_cancelled') {
      setError('Google sign-in was cancelled.');
    } else if (urlError === 'google_failed') {
      setError('Google sign-in failed. Please try again.');
    }
  }, [searchParams]);

  // Focus code input when it appears
  useEffect(() => {
    if (step === 'sent') {
      setTimeout(() => codeRef.current?.focus(), 60);
    }
  }, [step]);

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSending(true);

    const res = await fetch('/api/auth/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:    JSON.stringify({ email }),
    });

    const json = (await res.json()) as ApiResp<{ sent: boolean; devCode?: string }>;

    setSending(false);

    if (!res.ok || !json.success) {
      setError(json.error?.message ?? 'Failed to send code. Please try again.');
      return;
    }

    setDevCode(json.data?.devCode ?? null);
    setStep('sent');
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    const res = await fetch('/api/auth/email/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body:    JSON.stringify({ email, code }),
    });

    const json = (await res.json()) as ApiResp<{
      user: { id: string; email: string | null; name: string | null };
      tokenExpiresAt: number;
    }>;

    setVerifying(false);

    if (!res.ok || !json.success || !json.data) {
      setError(json.error?.message ?? 'Incorrect code. Please try again.');
      return;
    }

    setAuth(json.data.user, json.data.tokenExpiresAt);
    router.replace('/');
  }

  function handleGoogleSignIn() {
    // Full-page redirect — Google OAuth requires it.
    window.location.href = '/api/auth/google';
  }

  const isLoading = sending || verifying;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--nl-color-paper-bg)] px-4">

      {/* Card */}
      <div
        className="w-full max-w-sm bg-[var(--nl-color-paper-base)] rounded-[var(--nl-radius-xl)]
                   border border-[var(--nl-border-subtle)] shadow-[var(--nl-shadow-lg)] overflow-hidden"
      >
        {/* Header */}
        <div className="bg-[var(--nl-sidebar-bg)] px-8 py-6 flex flex-col items-center gap-3">
          <div
            aria-hidden="true"
            style={{
              width: 52, height: 52, borderRadius: 15, flexShrink: 0,
              background: 'linear-gradient(145deg, #1fa463 0%, #0d7a47 100%)',
              boxShadow: '0 3px 14px rgba(13,122,71,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true">
              <path d="M15 27C15 27 6 20.5 6 13C6 8.58 10.03 5 15 5C19.97 5 24 8.58 24 13C24 20.5 15 27 15 27Z" fill="white" opacity="0.95"/>
              <path d="M15 27L15 14" stroke="rgba(13,122,71,0.5)" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M15 18L11 15.5" stroke="rgba(13,122,71,0.35)" strokeWidth="1.3" strokeLinecap="round"/>
              <path d="M15 22L11 19.5" stroke="rgba(13,122,71,0.35)" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="text-center">
            <span
              className="block text-lg font-bold tracking-tight text-[var(--nl-sidebar-text)]"
              style={{ fontFamily: 'var(--nl-font-serif)', letterSpacing: '-0.2px' }}
            >
              Noteleaf
            </span>
            <p className="text-xs text-[var(--nl-sidebar-text-muted)] mt-0.5">
              Focus on the conversation — not the notes
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-8 py-7 space-y-5">

          <div>
            <h1 className="text-base font-semibold text-[var(--nl-color-ink-primary)] leading-tight">
              {step === 'sent' ? 'Check your email' : 'Sign in to Noteleaf'}
            </h1>
            <p className="text-xs text-[var(--nl-color-ink-tertiary)] mt-1 leading-relaxed">
              {step === 'sent'
                ? `We sent a 6-digit code to ${email}`
                : 'AI captures meeting notes from your mic — on calls or in person. No bot joins your meeting.'}
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="rounded-[var(--nl-radius-md)] bg-[var(--nl-color-danger-subtle)]
                            border border-red-200 px-3 py-2.5">
              <p className="text-xs text-[var(--nl-color-danger)] leading-relaxed">{error}</p>
            </div>
          )}

          {/* Dev code hint */}
          {devCode && (
            <div className="rounded-[var(--nl-radius-md)] bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="text-xs text-amber-700 leading-relaxed">
                Dev mode — your code is <strong className="font-mono tracking-widest">{devCode}</strong>
              </p>
            </div>
          )}

          {step !== 'sent' ? (
            <>
              {/* Google sign-in */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2.5 h-10 rounded-[var(--nl-radius-md)]
                           bg-white border border-[var(--nl-border-default)] text-xs font-medium
                           text-[var(--nl-color-ink-primary)] transition-[background-color,border-color]
                           duration-150 hover:bg-[var(--nl-color-paper-raised)] hover:border-[var(--nl-border-strong)]
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-[var(--nl-border-subtle)]" />
                <span className="text-[10px] text-[var(--nl-color-ink-disabled)] uppercase tracking-wider">
                  or
                </span>
                <div className="flex-1 h-px bg-[var(--nl-border-subtle)]" />
              </div>

              {/* Email form */}
              <form onSubmit={handleSendCode} className="space-y-3">
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="w-full h-10 px-3 rounded-[var(--nl-radius-md)] border border-[var(--nl-border-default)]
                             bg-[var(--nl-color-paper-raised)] text-xs text-[var(--nl-color-ink-primary)]
                             placeholder:text-[var(--nl-color-ink-disabled)] outline-none
                             focus:border-[var(--nl-color-accent-primary)] focus:ring-2 focus:ring-blue-100
                             transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
                  style={{ fontFamily: 'var(--nl-font-mono)' }}
                />
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-10 rounded-[var(--nl-radius-md)] bg-[var(--nl-color-accent-primary)]
                             text-white text-xs font-medium transition-[background-color,opacity] duration-150
                             hover:bg-[var(--nl-color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? 'Sending…' : 'Continue with email'}
                </button>
              </form>
            </>
          ) : (
            /* Code entry form */
            <form onSubmit={handleVerifyCode} className="space-y-3">
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                disabled={verifying}
                className="w-full h-12 px-3 rounded-[var(--nl-radius-md)] border border-[var(--nl-border-default)]
                           bg-[var(--nl-color-paper-raised)] text-center text-lg font-bold tracking-[0.35em]
                           text-[var(--nl-color-ink-primary)] placeholder:text-[var(--nl-color-ink-disabled)]
                           placeholder:tracking-widest outline-none focus:border-[var(--nl-color-accent-primary)]
                           focus:ring-2 focus:ring-blue-100 transition-[border-color,box-shadow] duration-150
                           disabled:opacity-50"
                style={{ fontFamily: 'var(--nl-font-mono)' }}
              />
              <button
                type="submit"
                disabled={verifying || code.length < 6}
                className="w-full h-10 rounded-[var(--nl-radius-md)] bg-[var(--nl-color-accent-primary)]
                           text-white text-xs font-medium transition-[background-color,opacity] duration-150
                           hover:bg-[var(--nl-color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {verifying ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('idle'); setCode(''); setError(null); setDevCode(null); setSending(false); setVerifying(false); }}
                className="w-full text-center text-xs text-[var(--nl-color-ink-tertiary)]
                           hover:text-[var(--nl-color-ink-secondary)] transition-colors duration-150 py-1"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-raised)]">
          <p className="text-[10px] text-[var(--nl-color-ink-disabled)] text-center leading-relaxed">
            By signing in you agree to our{' '}
            <Link href="/terms" className="underline hover:text-[var(--nl-color-ink-tertiary)] transition-colors">
              Terms &amp; Privacy Policy
            </Link>
            . Your notes are private and never sold.
          </p>
        </div>
      </div>

      {/* Tagline below card */}
      <p className="mt-6 text-xs text-[var(--nl-color-ink-disabled)] text-center max-w-xs leading-relaxed">
        Ambient AI notetaker — listens through your mic, never joins as a participant.
      </p>
    </div>
  );
}
