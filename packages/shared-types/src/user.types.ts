/**
 * @file user.types.ts
 * @description User identity and storage preference types.
 *
 * A Noteleaf user is identified solely by a UUID — no email, no password.
 * Storage preference is the user's explicit choice of where their notes live.
 *
 * These types are the root of the data model. Sessions and notes always
 * reference a userUuid to establish ownership.
 */

// ─── Storage ─────────────────────────────────────────────────────────────────

/**
 * Where session data is persisted between app launches.
 *
 * - `cloud`  → Stored on the Noteleaf API, keyed by userUuid. Accessible
 *              from any device that knows the UUID.
 * - `local`  → Never leaves the user's browser. Saved via localStorage or
 *              the File System Access API.
 */
export type StorageMode = 'cloud' | 'local';

/**
 * How local users export their notes when a session ends.
 *
 * - `download` → Browser triggers a .txt file download automatically.
 * - `folder`   → File System Access API writes directly to a user-chosen
 *                directory. Requires a one-time folder permission grant.
 */
export type LocalSaveMode = 'download' | 'folder';

// ─── Identity ────────────────────────────────────────────────────────────────

/**
 * A user's complete identity record.
 *
 * Generated on first launch. The uuid is the only persistent identifier —
 * users are responsible for saving it to regain cloud access from a new device.
 */
export interface UserIdentity {
  /** UUID v4. Generated once, stored in localStorage, never changes. */
  uuid: string;

  /** The user's chosen storage strategy. Set during onboarding. */
  storageMode: StorageMode;

  /**
   * How local users save their data. Only present when storageMode === 'local'.
   * Undefined for cloud users.
   */
  localSaveMode?: LocalSaveMode;

  /** ISO 8601 timestamp of when this identity was first created. */
  createdAt: string;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

/**
 * User-configurable app behaviour preferences.
 * Stored in localStorage alongside UserIdentity.
 */
export interface UserPreferences {
  /** Auto-classify notes as action / decision / insight / summary. Default: true. */
  autoClassify: boolean;

  /** Show real-time speech transcript while recording. Default: true. */
  showLiveTranscript: boolean;

  /** Extract and display keyword tags on note cards. Default: true. */
  autoTagKeywords: boolean;

  /**
   * Language/locale for speech recognition.
   * Passed to NVIDIA NIM as the `language_code` parameter.
   * Must be BCP-47 format (e.g. 'en-US'). Default: 'en-US'.
   */
  speechLanguage: string;
}

/**
 * Factory that returns safe defaults for new users.
 * Use this when no stored preferences are found.
 */
export const defaultUserPreferences: UserPreferences = {
  autoClassify: true,
  showLiveTranscript: true,
  autoTagKeywords: true,
  speechLanguage: 'en-US',
};
