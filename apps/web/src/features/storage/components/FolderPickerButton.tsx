/**
 * @file FolderPickerButton.tsx
 * @description Settings UI for the File System Access API folder selection.
 *
 * Shown in the Settings panel when the user has chosen "local → folder" mode.
 * Manages three states:
 *   - No folder chosen: shows "Choose folder" primary button.
 *   - Folder chosen: shows folder name, "Change" and "Clear" controls.
 *   - Not supported (Firefox): shows a clear explanation with fallback guidance.
 *
 * This component MUST be used inside a click handler chain — it calls
 * requestFolder() which in turn calls showDirectoryPicker(), which is
 * restricted to user gesture contexts by the browser.
 *
 * Error display:
 *   - not-supported: shown as a persistent info banner (not dismissible).
 *   - permission-denied: shown as a transient error with retry option.
 *   - not-a-user-gesture: developer error — logged to console, not shown.
 *
 * Usage:
 *   <FolderPickerButton />
 *   (Reads and writes to the module-level folder handle in useStorageFolderHandle)
 */

'use client';

import { useStorageFolderHandle } from '../useStorageFolderHandle';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

// ─── Icons ────────────────────────────────────────────────────────────────────

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FolderPickerButton() {
  const { hasFolder, folderName, isPending, error, requestFolder, clearFolder } =
    useStorageFolderHandle();

  // Browser support check — File System Access API requires Chrome/Edge 86+.
  // Firefox does not support showDirectoryPicker() as of 2025.
  const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  if (!isSupported) {
    return (
      <div
        role="note"
        className={cn(
          'flex items-start gap-2.5 px-3 py-2.5 rounded-[var(--nl-radius-sm)]',
          'bg-[var(--nl-color-paper-sunken)] border border-[var(--nl-border-subtle)]',
        )}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-[var(--nl-color-ink-tertiary)] shrink-0 mt-0.5" aria-hidden="true">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <div>
          <p className="text-[11px] font-mono font-medium text-[var(--nl-color-ink-secondary)]">
            Folder saving not supported in this browser
          </p>
          <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] mt-0.5 leading-relaxed">
            Use Chrome or Edge for folder auto-save. Firefox users will receive a download prompt after each session instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Current folder display */}
      {hasFolder && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2',
            'bg-[var(--nl-color-accent-subtle)] rounded-[var(--nl-radius-sm)]',
            'border border-[var(--nl-color-accent-border)]',
          )}
          aria-label={`Folder selected: ${folderName}`}
        >
          <FolderIcon className="text-[var(--nl-color-accent-primary)] shrink-0" />
          <span className="flex-1 text-[11px] font-mono text-[var(--nl-color-accent-primary)] truncate">
            {folderName}
          </span>
          <CheckIcon />
        </div>
      )}

      {/* Error display */}
      {error === 'permission-denied' && (
        <p role="alert" className="text-[10px] font-mono text-[var(--nl-color-danger)] px-1">
          Folder access was denied. Click below to try again.
        </p>
      )}
      {error === 'unknown' && (
        <p role="alert" className="text-[10px] font-mono text-[var(--nl-color-danger)] px-1">
          Something went wrong. Please try again.
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          variant={hasFolder ? 'secondary' : 'primary'}
          size="sm"
          isLoading={isPending}
          onClick={requestFolder}
          leftIcon={<FolderIcon />}
        >
          {hasFolder ? 'Change folder' : 'Choose folder'}
        </Button>

        {hasFolder && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFolder}
            aria-label="Remove folder access"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Helper text */}
      {!hasFolder && !error && (
        <p className="text-[10px] font-mono text-[var(--nl-color-ink-tertiary)] leading-relaxed">
          Grant access once. Notes will auto-save here after every session — no download dialog.
        </p>
      )}
    </div>
  );
}
