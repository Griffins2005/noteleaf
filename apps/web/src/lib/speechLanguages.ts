/**
 * Speech recognition language follows the device — no settings step.
 * Mixed-language meetings still use one recognizer (the Web Speech API
 * cannot run two locales at once); we pick the OS primary language.
 */

/** When the device only reports a language, pick a regional Speech API tag. */
const LANGUAGE_FALLBACK: Record<string, string> = {
  en: 'en-US',
  sw: 'sw-KE',
  fr: 'fr-FR',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  ar: 'ar-SA',
  hi: 'hi-IN',
  zh: 'zh-CN',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ru: 'ru-RU',
  tr: 'tr-TR',
  pl: 'pl-PL',
  vi: 'vi-VN',
  id: 'id-ID',
  af: 'af-ZA',
  am: 'am-ET',
};

function normalizeBcp47(tag: string): string {
  const parts = tag.replace('_', '-').split('-').filter(Boolean);
  const lang = parts[0]?.toLowerCase();
  if (!lang || lang.length < 2) return '';
  const region = parts[1];
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}

/** Pick the speech locale from this device — no settings step. */
export function resolveSpeechLanguage(): string {
  if (typeof navigator === 'undefined') return 'en-US';

  const raw = (navigator.languages?.[0] || navigator.language || '').trim();
  const tag = normalizeBcp47(raw);
  if (!tag) return 'en-US';
  if (tag.includes('-')) return tag;
  return LANGUAGE_FALLBACK[tag] ?? tag;
}
