'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth.store';
import { AuthProductIntro } from './AuthProductIntro';
import { LeafMark } from './LeafMark';

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

  useEffect(() => {
    if (isInit && user) router.replace('/');
  }, [isInit, user, router]);

  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError === 'google_cancelled') {
      setError('Google sign-in was cancelled.');
    } else if (urlError === 'google_failed') {
      setError('Google sign-in failed. Please try again.');
    }
  }, [searchParams]);

  useEffect(() => {
    if (step === 'sent') {
      setTimeout(() => codeRef.current?.focus(), 60);
    }
  }, [step]);

  useEffect(() => {
    const wake = () => {
      void fetch('/api/health', { credentials: 'include', cache: 'no-store' }).catch(() => { /* warmup */ });
    };
    wake();
    const id = window.setInterval(wake, 4 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);

  async function handleSendCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSending(true);

    try {
      const res = await fetch('/api/auth/email/send', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body:    JSON.stringify({ email }),
      });

      const json = (await res.json()) as ApiResp<{ sent: boolean; devCode?: string }>;

      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to send code. Please try again.');
        return;
      }

      setDevCode(json.data?.devCode ?? null);
      setStep('sent');
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setVerifying(true);

    try {
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

      if (!res.ok || !json.success || !json.data) {
        setError(json.error?.message ?? 'Incorrect code. Please try again.');
        return;
      }

      setAuth(json.data.user, json.data.tokenExpiresAt);
      router.replace('/');
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handleGoogleSignIn() {
    void fetch('/api/health', { credentials: 'include', cache: 'no-store' }).catch(() => { /* warmup */ });
    window.location.href = '/api/auth/google';
  }

  const isLoading = sending || verifying;

  return (
    <div className="min-h-screen flex flex-col lg:h-screen lg:grid lg:grid-cols-2 lg:overflow-hidden">
      <AuthProductIntro className="order-2 lg:order-1 lg:min-h-0 lg:h-full lg:overflow-y-auto" />

      <div className="order-1 lg:order-2 flex flex-col bg-[var(--nl-color-paper-sunken)] lg:h-full lg:overflow-y-auto">
        <div className="flex-1 flex flex-col justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-16">
          <div
            className="w-full max-w-[420px] mx-auto rounded-[18px] border border-[var(--nl-border-default)]
                       bg-[var(--nl-color-paper-raised)] px-6 py-8 sm:px-8 sm:py-9
                       shadow-[0_12px_40px_rgba(30,58,95,0.10)]"
          >
            <div className="flex items-center gap-2.5 mb-6">
              <LeafMark size={36} />
              <p
                className="font-serif text-[17px] font-bold leading-none text-[var(--nl-color-ink-primary)]"
                style={{ letterSpacing: '-0.2px' }}
              >
                Noteleaf
              </p>
            </div>

            <h2 className="text-[26px] sm:text-[28px] font-serif font-medium text-[var(--nl-color-ink-primary)] leading-[1.15]">
              {step === 'sent' ? 'Check your email' : 'Sign in to start capturing'}
            </h2>
            {step === 'sent' && (
              <p className="text-[13px] font-sans text-[var(--nl-color-ink-tertiary)] mt-2 leading-relaxed">
                We sent a 6-digit code to {email}
              </p>
            )}

            {error && (
              <div className="mt-5 rounded-[var(--nl-radius-md)] bg-[var(--nl-color-danger-subtle)] border border-red-200 px-3 py-2.5">
                <p className="text-xs text-[var(--nl-color-danger)] leading-relaxed">{error}</p>
              </div>
            )}

            {devCode && (
              <div className="mt-5 rounded-[var(--nl-radius-md)] bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-xs text-amber-700 leading-relaxed">
                  Dev mode — your code is <strong className="font-mono tracking-widest">{devCode}</strong>
                </p>
              </div>
            )}

            <div className="mt-7 space-y-4">
              {step !== 'sent' ? (
                <>
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                    className="w-full flex items-center justify-center gap-2.5 h-12 rounded-[10px]
                               bg-white border border-[var(--nl-border-strong)] text-[14px] font-medium
                               text-[var(--nl-color-ink-primary)] shadow-[var(--nl-shadow-sm)]
                               transition-[background-color,border-color,box-shadow] duration-150
                               hover:bg-[var(--nl-color-paper-base)] hover:border-[var(--nl-color-ink-tertiary)]
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <GoogleIcon />
                    Continue with Google
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[var(--nl-border-default)]" />
                    <span className="text-[10px] text-[var(--nl-color-ink-disabled)] uppercase tracking-wider">
                      or
                    </span>
                    <div className="flex-1 h-px bg-[var(--nl-border-default)]" />
                  </div>

                  <form onSubmit={handleSendCode} className="space-y-3">
                    <label className="block">
                      <span className="sr-only">Email address</span>
                      <input
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        disabled={isLoading}
                        className="w-full h-12 px-3.5 rounded-[10px] border border-[var(--nl-border-default)]
                                   bg-white text-[14px] text-[var(--nl-color-ink-primary)]
                                   placeholder:text-[var(--nl-color-ink-disabled)] outline-none
                                   focus:border-[var(--nl-color-accent-primary)] focus:ring-2 focus:ring-[var(--nl-color-accent-subtle)]
                                   transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
                        style={{ fontFamily: 'var(--nl-font-mono)' }}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-12 rounded-[10px] bg-[var(--nl-color-accent-primary)]
                                 text-white text-[14px] font-medium transition-[background-color,opacity] duration-150
                                 hover:bg-[var(--nl-color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Sending…' : 'Continue with email'}
                    </button>
                  </form>
                </>
              ) : (
                <form onSubmit={handleVerifyCode} className="space-y-3">
                  <label className="block">
                    <span className="sr-only">6-digit sign-in code</span>
                  <input
                    ref={codeRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    disabled={verifying}
                    className="w-full px-3 rounded-[10px] border border-[var(--nl-border-default)]
                               bg-white text-center text-lg font-bold tracking-[0.35em]
                               text-[var(--nl-color-ink-primary)] placeholder:text-[var(--nl-color-ink-disabled)]
                               placeholder:tracking-widest outline-none focus:border-[var(--nl-color-accent-primary)]
                               focus:ring-2 focus:ring-[var(--nl-color-accent-subtle)]
                               transition-[border-color,box-shadow] duration-150 disabled:opacity-50"
                    style={{ fontFamily: 'var(--nl-font-mono)', height: 52 }}
                  />
                  </label>
                  <button
                    type="submit"
                    disabled={verifying || code.length < 6}
                    className="w-full h-12 rounded-[10px] bg-[var(--nl-color-accent-primary)]
                               text-white text-[14px] font-medium transition-[background-color,opacity] duration-150
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

            <p className="mt-7 text-[11px] font-mono text-[var(--nl-color-ink-disabled)] leading-relaxed">
              Audio is transcribed on this device and never stored. Your notes are private and never sold.
              By signing in you agree to our{' '}
              <Link href="/terms" className="underline hover:text-[var(--nl-color-ink-tertiary)] transition-colors">
                Terms &amp; Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
