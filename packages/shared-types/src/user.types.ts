/**
 * @file user.types.ts
 * @description User preferences types.
 */

// ─── Preferences ─────────────────────────────────────────────────────────────

/**
 * User-configurable app behaviour preferences.
 * Most fields are persisted to localStorage; retentionDays is also synced
 * to the server via PATCH /api/user/preferences.
 */
export interface UserPreferences {
  /** Auto-classify notes as action / decision / insight / summary. Default: true. */
  autoClassify: boolean;

  /** Show real-time speech transcript while recording. Default: true. */
  showLiveTranscript: boolean;

  /** Extract and display keyword tags on note cards. Default: true. */
  autoTagKeywords: boolean;

  /**
   * Legacy speech-locale preference. Recording now follows the device language;
   * this field is kept so stored prefs still parse.
   */
  speechLanguage: string;

  /**
   * Auto-delete sessions after this many days. null means keep forever (default).
   * Synced to the server so it applies across devices.
   */
  retentionDays: number | null;
}

export const defaultUserPreferences: UserPreferences = {
  autoClassify: true,
  showLiveTranscript: true,
  autoTagKeywords: true,
  speechLanguage: 'en-US',
  retentionDays: null,
};
