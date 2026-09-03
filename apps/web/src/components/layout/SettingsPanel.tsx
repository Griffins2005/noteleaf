'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useUserStore } from '@/store/user.store';
import { useAuthStore } from '@/store/auth.store';
import { http } from '@/lib/http.client';
import { SPEECH_LANGUAGES, speechLanguageLabel } from '@/lib/speechLanguages';
import type { UserPreferences } from '@noteleaf/shared-types';
import { cn } from '@/lib/cn';

const RETENTION_OPTIONS = [
  { label: 'Keep forever', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
] as const;

export function SettingsPanel() {
  const { preferences, setPreference } = useUserStore();
  const user    = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const qc      = useQueryClient();

  const [retentionDays, setRetentionDays] = useState<number | null>(preferences.retentionDays);
  const [savedKey, setSavedKey]           = useState<string | null>(null);
  const [prefError, setPrefError]         = useState<string | null>(null);
  const [retentionNote, setRetentionNote] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]           = useState(false);
  const [deleteError, setDeleteError]     = useState<string | null>(null);

  useEffect(() => {
    setRetentionDays(preferences.retentionDays);
  }, [preferences.retentionDays]);

  function flashSaved(key: string) {
    setSavedKey(key);
    setPrefError(null);
    window.setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 2000);
  }

  function handleToggle(key: keyof UserPreferences, value: boolean) {
    setPreference(key, value);
    flashSaved(key);
  }

  function handleLanguageChange(code: string) {
    setPreference('speechLanguage', code);
    flashSaved('speechLanguage');
  }

  async function handleSaveRetention(days: number | null) {
    setRetentionDays(days);
    setPreference('retentionDays', days);
    setPrefError(null);
    setRetentionNote(null);
    try {
      const result = await http.patch<{
        id: string;
        retentionDays: number | null;
        deletedExpired?: number;
      }>('/api/user/preferences', { retentionDays: days });
      flashSaved('retentionDays');
      if (user?.id) {
        void qc.invalidateQueries({ queryKey: ['sessions', user.id] });
      }
      if (result.deletedExpired && result.deletedExpired > 0) {
        setRetentionNote(
          `Removed ${result.deletedExpired} session${result.deletedExpired === 1 ? '' : 's'} older than ${days} days.`,
        );
      }
    } catch {
      setPrefError("Couldn't save retention. Try again.");
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await http.delete('/api/auth/account');
      await signOut();
    } catch {
      setDeleting(false);
      setDeleteError("Couldn't delete your account. Try again.");
    }
  }

  const prefRow = (
    label: string,
    sub: string,
    key: 'autoClassify' | 'showLiveTranscript' | 'autoTagKeywords',
  ) => (
    <div className="flex items-center justify-between py-3.5 border-b border-[var(--nl-border-subtle)] last:border-0 gap-4">
      <div className="min-w-0">
        <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)]">{label}</p>
        <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5 leading-relaxed">{sub}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {savedKey === key && (
          <span className="text-[10px] font-mono text-[var(--nl-color-accent-primary)]">Saved</span>
        )}
        <Toggle
          checked={preferences[key]}
          onChange={(v) => handleToggle(key, v)}
          label={label}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-10">

      <p className="text-[12px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed">
        These settings apply on this device. Session retention syncs to your account.
      </p>

      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1.4px] text-[var(--nl-color-ink-disabled)] pb-3 border-b border-[var(--nl-border-subtle)] mb-4">
          Account
        </h3>
        <div className="space-y-3">
          {user && (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--nl-radius-md)] bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)]">
              {user.avatar && (
                <img src={user.avatar} alt="" className="w-8 h-8 rounded-full shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                {user.name && (
                  <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)] truncate">{user.name}</p>
                )}
                {user.email && (
                  <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] truncate">{user.email}</p>
                )}
              </div>
            </div>
          )}
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </section>

      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1.4px] text-[var(--nl-color-ink-disabled)] pb-3 border-b border-[var(--nl-border-subtle)] mb-1">
          Capture
        </h3>
        {prefRow('Auto-classify notes', 'Label notes as action, decision, or insight as you speak', 'autoClassify')}
        {prefRow('Show live transcript', 'Show real-time speech in the notes view while recording', 'showLiveTranscript')}
        {prefRow('Auto-tag keywords', 'Add keyword tags on each note card', 'autoTagKeywords')}

        <div className="flex items-start justify-between py-3.5 gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)]">Speech language</p>
            <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5 leading-relaxed">
              Language used for live transcription
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {savedKey === 'speechLanguage' && (
              <span className="text-[10px] font-mono text-[var(--nl-color-accent-primary)]">Saved</span>
            )}
            <label className="sr-only" htmlFor="nl-speech-language">Speech language</label>
            <select
              id="nl-speech-language"
              value={preferences.speechLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="h-8 max-w-[200px] px-2 rounded-[var(--nl-radius-sm)] border border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)] text-[12px] font-mono text-[var(--nl-color-ink-primary)] outline-none focus:border-[var(--nl-color-accent-primary)]"
            >
              {!SPEECH_LANGUAGES.some((l) => l.code === preferences.speechLanguage) && (
                <option value={preferences.speechLanguage}>{speechLanguageLabel(preferences.speechLanguage)}</option>
              )}
              {SPEECH_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.native ? `${lang.label} · ${lang.native}` : lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1.4px] text-[var(--nl-color-ink-disabled)] pb-3 border-b border-[var(--nl-border-subtle)] mb-3">
          Session retention
        </h3>
        <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed mb-3">
          Sessions last updated before this window are deleted when you open Noteleaf, when you change this setting, and once a day on the server. In-progress recordings are kept.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {RETENTION_OPTIONS.map(({ label, days }) => (
            <button
              key={label}
              type="button"
              onClick={() => void handleSaveRetention(days)}
              className={cn(
                'px-3 py-2.5 rounded-[var(--nl-radius-md)] border text-left text-[12px] font-mono transition-all',
                retentionDays === days
                  ? 'border-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)] text-[var(--nl-color-accent-primary)]'
                  : 'border-[var(--nl-border-default)] text-[var(--nl-color-ink-secondary)] hover:border-[var(--nl-border-strong)]',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {savedKey === 'retentionDays' && (
          <span className="text-[11px] font-mono text-[var(--nl-color-accent-primary)]">Saved</span>
        )}
        {retentionNote && (
          <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mt-1">{retentionNote}</p>
        )}
        {prefError && (
          <p className="text-[11px] font-mono text-[var(--nl-color-danger)]">{prefError}</p>
        )}
      </section>

      <section>
        <h3 className="text-[10px] font-mono uppercase tracking-[1.4px] text-[var(--nl-color-ink-disabled)] pb-3 border-b border-[var(--nl-border-subtle)] mb-4">
          Danger zone
        </h3>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true); setDeleteError(null); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-[var(--nl-radius-md)] border border-red-200 bg-[var(--nl-color-danger-subtle)] text-left transition-all hover:border-red-300"
          >
            <div className="w-8 h-8 rounded-full bg-white border border-red-200 flex items-center justify-center shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nl-color-danger)]">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-sans font-medium text-[var(--nl-color-danger)]">Delete account</p>
              <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5">Permanently removes all sessions and data</p>
            </div>
          </button>
        ) : (
          <div className="rounded-[var(--nl-radius-md)] border border-red-200 bg-[var(--nl-color-danger-subtle)] px-4 py-4 space-y-3">
            <p className="text-[13px] font-sans font-medium text-[var(--nl-color-ink-primary)]">
              Delete your account and every session?
            </p>
            <p className="text-[12px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed">
              This cannot be undone. Your notes, transcripts, and recaps will be removed.
            </p>
            {deleteError && (
              <p className="text-[11px] font-mono text-[var(--nl-color-danger)]">{deleteError}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" size="sm" isLoading={deleting} onClick={() => void handleDeleteAccount()}>
                Delete everything
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={deleting}
                onClick={() => { setConfirmDelete(false); setDeleteError(null); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      <p className="text-[11px] font-mono text-[var(--nl-color-ink-disabled)]">
        <Link href="/terms" className="underline underline-offset-2 hover:text-[var(--nl-color-ink-tertiary)] transition-colors">
          Terms &amp; Privacy Policy
        </Link>
      </p>
    </div>
  );
}
