/**
 * @file useStorageFolderHandle.ts
 * @description Hook that manages the File System Access API folder handle
 * for automatic local note saving.
 *
 * Design:
 *   The File System Access API lets the browser write files directly to a
 *   directory on the user's machine — without a download dialog on every save.
 *   The user grants permission once via showDirectoryPicker(). After that,
 *   every session end writes a file to the chosen folder automatically.
 *
 * Handle persistence:
 *   FileSystemDirectoryHandle objects CANNOT be serialised to localStorage or
 *   IndexedDB in a form that survives a full page reload in all browsers.
 *   Chrome supports storing handles in IndexedDB, Firefox does not.
 *   For maximum compatibility we keep the handle in module-level memory
 *   (survives React re-renders and hot reloads, not page refreshes).
 *   On page reload in folder mode, the user is prompted once to re-grant access.
 *   This is the correct UX — the browser must confirm the permission was intentional.
 *
 * Error handling:
 *   - AbortError:     User dismissed the picker. Not an error — just no-op.
 *   - NotAllowedError: Permission denied. Show guidance to the user.
 *   - SecurityError:  Called outside a user gesture (click/keydown). Never
 *                     call requestFolder() from a useEffect — only from event handlers.
 *
 * Usage:
 *   const { hasFolder, folderName, requestFolder, clearFolder, saveToFolder } =
 *     useStorageFolderHandle();
 *
 *   // In settings, when user clicks "Choose folder":
 *   await requestFolder();
 *
 *   // After recording stops:
 *   await saveToFolder(content, 'my-meeting-2025-05-09.txt');
 */

import { useState, useCallback } from 'react';

// ─── Module-level handle ──────────────────────────────────────────────────────

/**
 * The folder handle is stored at module level (outside React state) so it
 * survives component unmounts and re-mounts without triggering re-renders.
 * It is NOT stored in React state because FileSystemDirectoryHandle objects
 * are not plain serialisable values and should not be diffed by React.
 */
let _folderHandle: FileSystemDirectoryHandle | null = null;

type WritableDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission: (descriptor: { mode: 'readwrite' }) => Promise<PermissionState>;
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type FolderHandleError =
  | 'not-supported'      // File System Access API not available (Firefox, Safari < 15.2)
  | 'permission-denied'  // User denied folder access
  | 'not-a-user-gesture' // Called outside click/keydown handler
  | 'unknown';

export interface UseStorageFolderHandleReturn {
  /** True when a folder handle has been acquired and is ready for writes. */
  hasFolder: boolean;

  /** The display name of the chosen folder. Empty string when no folder is set. */
  folderName: string;

  /** Whether a folder picker or write operation is currently in progress. */
  isPending: boolean;

  /** Error from the last failed operation. Null when no error. */
  error: FolderHandleError | null;

  /**
   * Opens the native folder picker. Must be called from a user gesture
   * (button click, keyboard shortcut).
   *
   * Sets `hasFolder` and `folderName` on success.
   * Sets `error` on failure (except AbortError which is silently ignored).
   */
  requestFolder: () => Promise<void>;

  /**
   * Clears the stored folder handle. The user will be prompted to choose
   * a new folder on the next recording session end.
   */
  clearFolder: () => void;

  /**
   * Writes a text file to the chosen folder.
   * No-op if no folder handle is set — falls back to download.
   *
   * @param content  - The file content string.
   * @param filename - The target filename including extension.
   * @returns        - True if the write succeeded, false if it fell back to download.
   */
  saveToFolder: (content: string, filename: string) => Promise<boolean>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useStorageFolderHandle(): UseStorageFolderHandleReturn {
  // React state only tracks the display-level values — not the handle itself.
  const [hasFolder, setHasFolder] = useState<boolean>(_folderHandle !== null);
  const [folderName, setFolderName] = useState<string>(_folderHandle?.name ?? '');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<FolderHandleError | null>(null);

  // ── Request folder ─────────────────────────────────────────────────────

  const requestFolder = useCallback(async (): Promise<void> => {
    // Guard: File System Access API is not universally supported.
    // Firefox does not support showDirectoryPicker() as of 2025.
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setError('not-supported');
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      // This MUST be called within a user gesture (click/keydown handler).
      // It throws NotAllowedError if called programmatically.
      const showDirectoryPicker = window.showDirectoryPicker as (options: {
        mode: 'readwrite';
        startIn: 'documents';
      }) => Promise<FileSystemDirectoryHandle>;

      const handle = await showDirectoryPicker({
        mode: 'readwrite',
        // Suggest the handle is used for note output — some browsers show this hint.
        startIn: 'documents',
      });

      // Store at module level so it survives React re-renders.
      _folderHandle = handle;
      setHasFolder(true);
      setFolderName(handle.name);

    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'AbortError') {
          // User dismissed the picker — this is not an error, just a no-op.
          return;
        }
        if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          setError(err.name === 'SecurityError' ? 'not-a-user-gesture' : 'permission-denied');
        } else {
          setError('unknown');
        }
      } else {
        setError('unknown');
      }
    } finally {
      setIsPending(false);
    }
  }, []);

  // ── Clear folder ───────────────────────────────────────────────────────

  const clearFolder = useCallback((): void => {
    _folderHandle = null;
    setHasFolder(false);
    setFolderName('');
    setError(null);
  }, []);

  // ── Save to folder ─────────────────────────────────────────────────────

  const saveToFolder = useCallback(async (content: string, filename: string): Promise<boolean> => {
    if (!_folderHandle) return false;

    setIsPending(true);

    try {
      // Check that write permission is still granted. The browser may have
      // revoked it since the handle was acquired (e.g. the folder was moved).
      const permissionState = await (_folderHandle as WritableDirectoryHandle).queryPermission({
        mode: 'readwrite',
      });

      if (permissionState !== 'granted') {
        // Permission was revoked. Request it again — this requires a user gesture,
        // so we can't do it here. Clear the handle and signal the caller to
        // prompt the user to re-select the folder.
        _folderHandle = null;
        setHasFolder(false);
        setFolderName('');
        return false;
      }

      // Create or overwrite the file in the chosen folder.
      const fileHandle = await _folderHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();

      return true;

    } catch (err) {
      // If the write fails for any reason (folder deleted, unmounted drive, etc.)
      // clear the handle so the user is prompted to re-select on next session.
      console.error('[FolderHandle] Write failed:', err);
      _folderHandle = null;
      setHasFolder(false);
      setFolderName('');
      return false;
    } finally {
      setIsPending(false);
    }
  }, []);

  return {
    hasFolder,
    folderName,
    isPending,
    error,
    requestFolder,
    clearFolder,
    saveToFolder,
  };
}
