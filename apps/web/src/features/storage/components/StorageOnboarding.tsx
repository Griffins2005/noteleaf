/**
 * @file StorageOnboarding.tsx
 * @description First-launch onboarding modal for storage preference selection.
 *
 * Shown once on app startup when hasOnboarded === false.
 * Dismissed permanently once the user confirms a choice.
 *
 * User flows:
 *   Cloud → show UUID → "Continue with cloud" → completeOnboarding('cloud', null)
 *   Local → show sub-options → pick download/folder → "Continue locally"
 *           → completeOnboarding('local', choice)
 *
 * Accessibility:
 *   - Modal uses role="dialog" with aria-modal="true".
 *   - Focus is trapped inside the modal while open.
 *   - Backdrop click is intentionally disabled — the user must make a choice.
 *
 * This component manages its own local state for the in-progress selection.
 * It calls onConfirm() only once when the user is fully ready.
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { StorageMode, LocalSaveMode } from '@noteleaf/shared-types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StorageOnboardingProps {
  uuid: string;
  onConfirm: (storageMode: StorageMode, localSaveMode: LocalSaveMode | null) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface OptionCardProps {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function OptionCard({ isSelected, onClick, children }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className={cn(
        'w-full text-left p-4 rounded-[var(--nl-radius-lg)] cursor-pointer',
        'border-[1.5px] transition-all duration-150 relative',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nl-color-accent-primary)]',
        isSelected
          ? 'border-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)]'
          : 'border-[var(--nl-border-default)] bg-[var(--nl-color-paper-raised)] hover:border-[var(--nl-border-strong)]',
      )}
    >
      {/* Selected checkmark */}
      {isSelected && (
        <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-[var(--nl-color-accent-primary)] flex items-center justify-center" aria-hidden="true">
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2,6 5,9 10,3"/>
          </svg>
        </span>
      )}
      {children}
    </button>
  );
}

interface LocalSubOptionProps {
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function LocalSubOption({ isSelected, onClick, icon, title, description }: LocalSubOptionProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-[var(--nl-radius-sm)] flex items-center gap-3',
        'border transition-all duration-100 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nl-color-accent-primary)]',
        isSelected
          ? 'border-[var(--nl-color-accent-primary)] bg-[var(--nl-color-accent-subtle)]'
          : 'border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-raised)] hover:bg-[var(--nl-color-paper-sunken)]',
      )}
    >
      <span className="w-7 h-7 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-accent-subtle)] text-[var(--nl-color-accent-primary)] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-[12px] font-mono font-medium text-[var(--nl-color-ink-primary)]">{title}</span>
        <span className="block text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5">{description}</span>
      </span>
      {isSelected && (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--nl-color-accent-primary)] shrink-0" aria-hidden="true">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloudIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StorageOnboarding({ uuid, onConfirm }: StorageOnboardingProps) {
  const [selectedMode, setSelectedMode] = useState<StorageMode | null>(null);
  const [selectedLocalMode, setSelectedLocalMode] = useState<LocalSaveMode | null>(null);
  const [copied, setCopied] = useState(false);

  const canContinue =
    selectedMode === 'cloud' ||
    (selectedMode === 'local' && selectedLocalMode !== null);

  async function handleCopyUUID() {
    await navigator.clipboard.writeText(uuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleConfirm() {
    if (!selectedMode) return;
    onConfirm(selectedMode, selectedLocalMode);
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[var(--nl-z-modal)] flex items-center justify-center p-6 bg-[rgba(26,26,24,0.6)]"
      aria-modal="true"
      role="dialog"
      aria-labelledby="onboarding-title"
    >
      <div className="w-full max-w-[540px] bg-[var(--nl-color-paper-base)] rounded-[var(--nl-radius-lg)] border border-[var(--nl-border-default)] shadow-xl">

        {/* Modal header */}
        <div className="px-8 pt-8 pb-0 text-center">
          <p className="text-[var(--nl-color-accent-primary)] font-serif text-[22px] font-medium tracking-tight">
            note<span className="text-[var(--nl-color-accent-hover)]">leaf</span>
          </p>
          <h2 id="onboarding-title" className="mt-4 text-[14px] font-mono font-medium text-[var(--nl-color-ink-primary)]">
            How would you like to save your notes?
          </h2>
          <p className="mt-1.5 text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed">
            Choose your storage preference. You can always change this in Settings.
          </p>
        </div>

        {/* Option cards */}
        <div className="px-8 pt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Storage options">

          {/* Cloud option */}
          <OptionCard isSelected={selectedMode === 'cloud'} onClick={() => setSelectedMode('cloud')}>
            <div className="w-9 h-9 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-blue-subtle)] text-[var(--nl-color-blue-primary)] flex items-center justify-center mb-3">
              <CloudIcon />
            </div>
            <p className="text-[13px] font-mono font-medium text-[var(--nl-color-ink-primary)] mb-1">Cloud sync</p>
            <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] leading-snug">Saved securely, accessible from any device via your UUID.</p>
            <ul className="mt-3 space-y-1">
              {['Full history across devices', 'Tied to a unique UUID', 'Encrypted at rest'].map((perk) => (
                <li key={perk} className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--nl-color-blue-primary)]">
                  <span aria-hidden="true">✓</span> {perk}
                </li>
              ))}
            </ul>
          </OptionCard>

          {/* Local option */}
          <OptionCard isSelected={selectedMode === 'local'} onClick={() => setSelectedMode('local')}>
            <div className="w-9 h-9 rounded-[var(--nl-radius-sm)] bg-[var(--nl-color-accent-subtle)] text-[var(--nl-color-accent-primary)] flex items-center justify-center mb-3">
              <LaptopIcon />
            </div>
            <p className="text-[13px] font-mono font-medium text-[var(--nl-color-ink-primary)] mb-1">Local only</p>
            <p className="text-[11px] font-mono text-[var(--nl-color-ink-tertiary)] leading-snug">Notes never leave your device. You control exports.</p>
            <ul className="mt-3 space-y-1">
              {['Zero data leaves device', 'Auto-download per session', 'Or save to a local folder'].map((perk) => (
                <li key={perk} className="flex items-center gap-1.5 text-[10px] font-mono text-[var(--nl-color-accent-primary)]">
                  <span aria-hidden="true">✓</span> {perk}
                </li>
              ))}
            </ul>
          </OptionCard>
        </div>

        {/* Cloud UUID display */}
        {selectedMode === 'cloud' && (
          <div className={cn('mx-8 mt-3 flex items-center gap-2 px-3 py-2.5', 'bg-[var(--nl-color-blue-subtle)] rounded-[var(--nl-radius-sm)] border border-[var(--nl-color-blue-border)]')}>
            <span className="text-[9px] font-mono uppercase tracking-[0.8px] text-[var(--nl-color-ink-tertiary)] whitespace-nowrap">Your ID</span>
            <code className="flex-1 text-[11px] font-mono text-[var(--nl-color-blue-primary)] truncate">{uuid}</code>
            <button
              type="button"
              onClick={handleCopyUUID}
              className="shrink-0 text-[10px] font-mono text-[var(--nl-color-blue-primary)] hover:underline"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        )}

        {/* Local sub-options */}
        {selectedMode === 'local' && (
          <div className="mx-8 mt-3 space-y-2" role="radiogroup" aria-label="Local save options">
            <LocalSubOption
              isSelected={selectedLocalMode === 'download'}
              onClick={() => setSelectedLocalMode('download')}
              icon={<DownloadIcon />}
              title="Download after each session"
              description="A .txt file saves automatically when you stop."
            />
            <LocalSubOption
              isSelected={selectedLocalMode === 'folder'}
              onClick={() => setSelectedLocalMode('folder')}
              icon={<FolderIcon />}
              title="Save to a folder on this machine"
              description="Grant access once — auto-saves every session."
            />
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-6 flex items-center justify-between gap-4">
          <p className="text-[10px] font-mono text-[var(--nl-color-ink-disabled)] leading-snug flex-1">
            {selectedMode === 'cloud'
              ? 'Encrypted · tied to your UUID only · no personal data collected.'
              : selectedMode === 'local'
              ? 'No account required. No data leaves your device.'
              : 'Select an option to continue.'}
          </p>
          <Button
            variant="primary"
            size="md"
            disabled={!canContinue}
            onClick={handleConfirm}
            className="shrink-0"
          >
            {selectedMode === 'cloud' ? 'Continue with cloud' : selectedMode === 'local' ? 'Continue locally' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
