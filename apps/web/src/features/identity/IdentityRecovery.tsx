/**
 * @file IdentityRecovery.tsx
 * @description UI for linking a recovery email or recovering a UUID on a new device.
 *
 * Two flows share this component:
 *
 *   Link (new email):
 *     User enters an email they don't yet have linked → verify code →
 *     server writes the link, returns their current UUID → no UUID change.
 *
 *   Recover (existing email):
 *     User enters an email that IS already linked → verify code →
 *     server returns the linked UUID → app swaps to that UUID so the user
 *     sees all their previous cloud sessions.
 */

'use client';

import { useState } from 'react';
import { http } from '@/lib/http.client';
import type { SendCodeResponse, VerifyCodeResponse } from '@noteleaf/shared-types';
import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'idle' | 'sending' | 'awaiting-code' | 'verifying' | 'done' | 'error';

interface IdentityRecoveryProps {
  currentUuid: string;
  linkedEmail: string | null;
  /** Called when a UUID is returned from the server (same or different from current). */
  onSuccess: (uuid: string, email: string, isRecovery: boolean) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IdentityRecovery({
  currentUuid,
  linkedEmail,
  onSuccess,
}: IdentityRecoveryProps) {
  const [step, setStep]           = useState<Step>('idle');
  const [email, setEmail]         = useState(linkedEmail ?? '');
  const [code, setCode]           = useState('');
  const [devCode, setDevCode]     = useState<string | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');

  async function handleSendCode() {
    if (!email.trim()) return;
    setStep('sending');
    setErrorMsg('');

    try {
      const res = await http.post<SendCodeResponse>('/api/identity/send-code', {
        email: email.trim().toLowerCase(),
      });
      setDevCode(res.devCode ?? null);
      setStep('awaiting-code');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send code.';
      setErrorMsg(msg);
      setStep('error');
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return;
    setStep('verifying');
    setErrorMsg('');

    try {
      const res = await http.post<VerifyCodeResponse>('/api/identity/verify-code', {
        email: email.trim().toLowerCase(),
        code:  code.trim(),
        // Only send currentUuid when the email is new (first-time link).
        // If the email is already linked the server returns its UUID directly.
        currentUuid,
      });

      const isRecovery = !res.isNewLink && res.uuid !== currentUuid;
      setStep('done');
      onSuccess(res.uuid, email.trim().toLowerCase(), isRecovery);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed.';
      setErrorMsg(msg);
      setStep('error');
    }
  }

  // ── Already linked ────────────────────────────────────────────────────────

  if (step === 'done') {
    return (
      <p className="text-[11px] font-mono text-[var(--nl-color-accent-primary)]">
        ✓ Linked to {email}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Email input */}
      <div>
        <label className="block text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mb-1">
          {linkedEmail ? 'Linked email' : 'Recovery email'}
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          disabled={step === 'sending' || step === 'awaiting-code' || step === 'verifying'}
          className={cn(
            'w-full px-3 py-2 rounded-[var(--nl-radius-sm)]',
            'text-[12px] font-mono text-[var(--nl-color-ink-primary)]',
            'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-default)]',
            'placeholder:text-[var(--nl-color-ink-disabled)]',
            'focus:outline-none focus:border-[var(--nl-color-accent-primary)]',
            'disabled:opacity-50',
          )}
        />
      </div>

      {/* Code input — shown after send */}
      {(step === 'awaiting-code' || step === 'verifying') && (
        <div>
          <label className="block text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mb-1">
            6-digit code
            {devCode && (
              <span className="ml-2 text-[var(--nl-color-accent-primary)]">
                (dev: {devCode})
              </span>
            )}
          </label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            autoFocus
            className={cn(
              'w-full px-3 py-2 rounded-[var(--nl-radius-sm)]',
              'text-[12px] font-mono text-[var(--nl-color-ink-primary)] tracking-widest',
              'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-default)]',
              'placeholder:text-[var(--nl-color-ink-disabled)]',
              'focus:outline-none focus:border-[var(--nl-color-accent-primary)]',
            )}
          />
          <p className="mt-1 text-[10px] font-mono text-[var(--nl-color-ink-tertiary)]">
            Check your email — the code expires in 10 minutes.
          </p>
        </div>
      )}

      {/* Error message */}
      {step === 'error' && (
        <p className="text-[11px] font-mono text-[var(--nl-color-danger)]">{errorMsg}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {(step === 'idle' || step === 'error') && (
          <button
            type="button"
            onClick={() => void handleSendCode()}
            disabled={!email.trim()}
            className={cn(
              'px-3 py-1.5 rounded-[var(--nl-radius-sm)]',
              'text-[11px] font-mono font-medium',
              'bg-[var(--nl-color-accent-primary)] text-white',
              'hover:bg-[var(--nl-color-accent-hover)]',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              'transition-colors',
            )}
          >
            Send code
          </button>
        )}

        {step === 'sending' && (
          <span className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] py-1.5">
            Sending…
          </span>
        )}

        {(step === 'awaiting-code' || step === 'verifying') && (
          <>
            <button
              type="button"
              onClick={() => void handleVerifyCode()}
              disabled={code.length !== 6 || step === 'verifying'}
              className={cn(
                'px-3 py-1.5 rounded-[var(--nl-radius-sm)]',
                'text-[11px] font-mono font-medium',
                'bg-[var(--nl-color-accent-primary)] text-white',
                'hover:bg-[var(--nl-color-accent-hover)]',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                'transition-colors',
              )}
            >
              {step === 'verifying' ? 'Verifying…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('idle'); setCode(''); setDevCode(null); }}
              className="px-3 py-1.5 text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)]"
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
