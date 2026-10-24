'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LeafMark } from './LeafMark';
import { useAuthStore } from '@/store/auth.store';

const POINTS = [
  {
    title: 'Your notes stay yours',
    body: 'Notes, transcripts, and recaps are saved in your account. They are not sold.',
  },
  {
    title: 'Audio is sent to be transcribed',
    body: 'While you record, the microphone audio goes to Noteleaf’s speech service. The recording is not kept.',
  },
  {
    title: 'A closed tab can keep a short stretch',
    body: 'Audio that has not been transcribed yet can stay in this browser until it is transcribed or you dismiss it.',
  },
  {
    title: 'A backup recognizer may be used',
    body: 'If the speech service cannot be reached, the browser’s own recognizer takes over. That can send audio to the browser’s speech service, and the app tells you when it happens.',
  },
  {
    title: 'Check the notes before you act',
    body: 'A note, a recap, or an owner and deadline can be wrong. Read them before you rely on them.',
  },
];

export function TermsAcceptance() {
  const router = useRouter();
  const acceptTerms = useAuthStore((s) => s.acceptTerms);
  const signOut = useAuthStore((s) => s.signOut);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAgree() {
    if (!agreed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await acceptTerms();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your agreement. Try again.');
      setSaving(false);
    }
  }

  async function handleNotNow() {
    await signOut();
    router.replace('/auth');
  }

  return (
    <div className="min-h-screen bg-[var(--nl-color-paper-bg)] flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <LeafMark size={28} />
          <span className="font-serif text-[18px] font-bold tracking-tight text-[var(--nl-color-ink-primary)]">
            Noteleaf
          </span>
        </div>

        <h1 className="font-serif text-[28px] font-medium leading-tight text-[var(--nl-color-ink-primary)] mb-2">
          Before you continue
        </h1>
        <p className="text-[14px] font-sans leading-relaxed text-[var(--nl-color-ink-tertiary)] mb-6">
          This is the first time these terms apply to your account. Read the short version, then agree to open the notepad.
        </p>

        <ul className="space-y-3 mb-6">
          {POINTS.map((point) => (
            <li
              key={point.title}
              className="rounded-[var(--nl-radius-md)] border border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-raised)] px-4 py-3"
            >
              <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)]">{point.title}</p>
              <p className="text-[13px] font-sans leading-relaxed text-[var(--nl-color-ink-tertiary)] mt-0.5">{point.body}</p>
            </li>
          ))}
        </ul>

        <p className="text-[12px] font-sans text-[var(--nl-color-ink-tertiary)] mb-4">
          The full policy is on the{' '}
          <Link href="/terms" target="_blank" className="underline hover:text-[var(--nl-color-ink-primary)]">
            Terms &amp; Privacy
          </Link>{' '}
          page.
        </p>

        <label className="flex items-start gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--nl-color-accent-primary)]"
          />
          <span className="text-[13px] font-sans text-[var(--nl-color-ink-primary)] leading-relaxed">
            I agree to the Terms &amp; Privacy Policy.
          </span>
        </label>

        {error && (
          <p role="alert" className="mb-3 text-[12px] font-mono text-[var(--nl-color-danger)]">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void handleAgree()}
          disabled={!agreed || saving}
          className="w-full h-12 rounded-[10px] bg-[var(--nl-color-accent-primary)] text-white text-[14px] font-medium transition-[background-color,opacity] duration-150 hover:bg-[var(--nl-color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Agree and continue'}
        </button>
        <button
          type="button"
          onClick={() => void handleNotNow()}
          className="w-full mt-3 text-center text-[12px] font-sans text-[var(--nl-color-ink-tertiary)] hover:text-[var(--nl-color-ink-primary)] py-1"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
