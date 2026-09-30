import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSpeechLanguage } from '../speechLanguages';

describe('resolveSpeechLanguage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the device primary locale as-is', () => {
    vi.stubGlobal('navigator', {
      language: 'en-KE',
      languages: ['en-KE', 'sw-KE'],
    });
    expect(resolveSpeechLanguage()).toBe('en-KE');
  });

  it('maps a language-only tag to a regional Speech API locale', () => {
    vi.stubGlobal('navigator', {
      language: 'sw',
      languages: ['sw'],
    });
    expect(resolveSpeechLanguage()).toBe('sw-KE');
  });

  it('normalizes underscore locale tags from the OS', () => {
    vi.stubGlobal('navigator', {
      language: 'fr_ca',
      languages: ['fr_ca'],
    });
    expect(resolveSpeechLanguage()).toBe('fr-CA');
  });
});
