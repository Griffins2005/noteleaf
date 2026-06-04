/**
 * BCP-47 locales supported by the browser Web Speech API (Chrome/Edge).
 * Not every locale works equally well — quality varies by Google's backend.
 */

export interface SpeechLanguageOption {
  code: string;
  label: string;
  native?: string;
}

export const SPEECH_LANGUAGES: SpeechLanguageOption[] = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-KE', label: 'English (Kenya)' },
  { code: 'sw-KE', label: 'Swahili (Kenya)', native: 'Kiswahili' },
  { code: 'sw-TZ', label: 'Swahili (Tanzania)', native: 'Kiswahili' },
  { code: 'fr-FR', label: 'French', native: 'Français' },
  { code: 'fr-CA', label: 'French (Canada)' },
  { code: 'es-ES', label: 'Spanish (Spain)', native: 'Español' },
  { code: 'es-MX', label: 'Spanish (Mexico)' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)', native: 'Português' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  { code: 'de-DE', label: 'German', native: 'Deutsch' },
  { code: 'it-IT', label: 'Italian', native: 'Italiano' },
  { code: 'nl-NL', label: 'Dutch', native: 'Nederlands' },
  { code: 'ar-SA', label: 'Arabic', native: 'العربية' },
  { code: 'hi-IN', label: 'Hindi', native: 'हिन्दी' },
  { code: 'zh-CN', label: 'Chinese (Simplified)', native: '中文' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'ja-JP', label: 'Japanese', native: '日本語' },
  { code: 'ko-KR', label: 'Korean', native: '한국어' },
  { code: 'ru-RU', label: 'Russian', native: 'Русский' },
  { code: 'tr-TR', label: 'Turkish', native: 'Türkçe' },
  { code: 'pl-PL', label: 'Polish', native: 'Polski' },
  { code: 'vi-VN', label: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'id-ID', label: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'af-ZA', label: 'Afrikaans' },
  { code: 'am-ET', label: 'Amharic', native: 'አማርኛ' },
];

export function speechLanguageLabel(code: string): string {
  const match = SPEECH_LANGUAGES.find((l) => l.code === code);
  return match?.label ?? code;
}

/** Pick the best Web Speech locale from the browser — no manual setting needed. */
export function resolveSpeechLanguage(): string {
  if (typeof navigator === 'undefined') return 'en-US';

  const supportedCodes = SPEECH_LANGUAGES.map((l) => l.code);
  const supported = new Set(supportedCodes);
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);

  for (const raw of candidates) {
    const tag = raw.trim();
    if (supported.has(tag)) return tag;

    const base = tag.split('-')[0]?.toLowerCase();
    if (!base) continue;

    const regional = supportedCodes.find(
      (code) => code.toLowerCase().startsWith(`${base}-`),
    );
    if (regional) return regional;
  }

  return 'en-US';
}
