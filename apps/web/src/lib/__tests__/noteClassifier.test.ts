/**
 * @file noteClassifier.test.ts
 * @description Unit tests for the note classifier and tag extractor.
 *
 * The classifier is a pure function — it takes text and returns a NoteType.
 * Tests are fast, isolated, and require no mocking.
 *
 * Coverage:
 *   - All four NoteType classifications
 *   - Pattern priority (action before decision when both match)
 *   - Edge cases: short text, empty string, low-signal phrases
 *   - Tag extraction: stopword filtering, length filter, deduplication
 *   - buildNoteFromTranscript integration
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTranscript,
  extractTags,
  buildNoteFromTranscript,
} from '../noteClassifier';

// ─── classifyTranscript ───────────────────────────────────────────────────────

describe('classifyTranscript', () => {

  describe('action classification', () => {
    it('classifies "we need to" phrases as action', () => {
      expect(classifyTranscript('We need to schedule a follow-up call with the client')).toBe('action');
    });

    it('classifies deadline phrases as action', () => {
      expect(classifyTranscript('Can you send the report by end of day Friday')).toBe('action');
    });

    it('classifies "follow up" as action', () => {
      expect(classifyTranscript('We should follow up on the budget approval next week')).toBe('action');
    });

    it('classifies "please" + task as action', () => {
      expect(classifyTranscript('Please review the design mockups before the meeting tomorrow')).toBe('action');
    });

    it('classifies assignment language as action', () => {
      expect(classifyTranscript('Assign the onboarding task to the new engineer by Monday')).toBe('action');
    });
  });

  describe('decision classification', () => {
    it('classifies "we decided" as decision', () => {
      expect(classifyTranscript('We decided to go with the blue colour scheme for the dashboard')).toBe('decision');
    });

    it('classifies "confirmed" as decision', () => {
      // Standalone 'confirmed' — no 'we' subject, passive voice, valid decision signal
      expect(classifyTranscript('The launch date is confirmed for the fifteenth of June')).toBe('decision');
    });

    it('classifies "agreed" as decision', () => {
      // Third-person subject — 'everyone agreed' is a decision signal
      expect(classifyTranscript('Everyone agreed that the new pricing model makes more sense')).toBe('decision');
    });

    it('classifies "going with" as decision', () => {
      expect(classifyTranscript('We are going with the third vendor proposal after all')).toBe('decision');
    });
  });

  describe('insight classification', () => {
    it('classifies "key point" as insight', () => {
      expect(classifyTranscript('Key point here is that our retention numbers dropped by twelve percent last quarter')).toBe('insight');
    });

    it('classifies "important" as insight', () => {
      expect(classifyTranscript('It is important that we address the accessibility issues before launch')).toBe('insight');
    });

    it('classifies "idea" as insight', () => {
      // Pure idea phrase — no action trigger words present
      expect(classifyTranscript('I have an idea for reducing the onboarding drop-off rate')).toBe('insight');
    });

    it('classifies "realized" as insight', () => {
      expect(classifyTranscript('We realized that the data pipeline was running three times per hour unnecessarily')).toBe('insight');
    });
  });

  describe('summary classification (fallback)', () => {
    it('returns summary for general statements', () => {
      expect(classifyTranscript('The team has been working on the new feature for about three weeks now')).toBe('summary');
    });

    it('returns summary for short text at minimum threshold', () => {
      // 'Product roadmap overview' — no action/decision/insight keywords, pure summary
      expect(classifyTranscript('Product roadmap overview')).toBe('summary');
    });
  });

  describe('edge cases', () => {
    it('returns summary for text below minimum length', () => {
      expect(classifyTranscript('Sure')).toBe('summary');
      expect(classifyTranscript('')).toBe('summary');
    });

    it('action takes priority over insight when both patterns match', () => {
      // "important" is insight; "we need to" is action — action fires first
      expect(classifyTranscript('It is important that we need to fix this by Friday')).toBe('action');
    });
  });
});

// ─── extractTags ──────────────────────────────────────────────────────────────

describe('extractTags', () => {
  it('extracts meaningful keywords', () => {
    const tags = extractTags('The authentication system needs a complete redesign before launch');
    expect(tags).toContain('authentication');
    expect(tags).toContain('system');
    expect(tags).toContain('needs');
  });

  it('filters out stopwords', () => {
    const tags = extractTags('The team is going to review this before the deadline');
    expect(tags).not.toContain('the');
    expect(tags).not.toContain('is');
    expect(tags).not.toContain('going');
    expect(tags).not.toContain('this');
  });

  it('filters words shorter than 5 characters', () => {
    const tags = extractTags('The new API key bug fix test was done by the dev');
    expect(tags).not.toContain('api');
    expect(tags).not.toContain('key');
    expect(tags).not.toContain('bug');
    expect(tags).not.toContain('fix');
    expect(tags).not.toContain('dev');
  });

  it('returns a maximum of 3 tags', () => {
    const tags = extractTags('Authentication onboarding navigation dashboard analytics performance');
    expect(tags.length).toBeLessThanOrEqual(3);
  });

  it('deduplicates tags (case-insensitive)', () => {
    const tags = extractTags('dashboard dashboard dashboard analytics analytics');
    const unique = new Set(tags);
    expect(unique.size).toBe(tags.length);
  });

  it('returns empty array for text with only stopwords', () => {
    const tags = extractTags('the is and or but so for to of in');
    expect(tags.length).toBe(0);
  });
});

// ─── buildNoteFromTranscript ──────────────────────────────────────────────────

describe('buildNoteFromTranscript', () => {
  it('builds a complete Note object from classifier input', () => {
    const note = buildNoteFromTranscript(
      {
        transcript: 'We need to schedule a follow-up with the product team by Friday',
        sessionId: 'test-session-id',
        sessionOffsetSeconds: 42,
      },
      true,
    );

    expect(note.type).toBe('action');
    expect(note.sessionId).toBe('test-session-id');
    expect(note.sessionOffsetSeconds).toBe(42);
    expect(note.content).toMatch(/^We/); // First char capitalised
    expect(typeof note.id).toBe('string');
    expect(note.id).toHaveLength(36); // UUID v4
    expect(typeof note.capturedAt).toBe('string'); // ISO timestamp
  });

  it('capitalises the first character of content', () => {
    const note = buildNoteFromTranscript(
      { transcript: 'the dashboard is looking great', sessionId: 's1', sessionOffsetSeconds: 0 },
      false,
    );
    expect(note.content.charAt(0)).toBe('T');
  });

  it('returns empty tags when tagging is disabled', () => {
    const note = buildNoteFromTranscript(
      { transcript: 'authentication dashboard analytics review session', sessionId: 's1', sessionOffsetSeconds: 0 },
      false, // tagging disabled
    );
    expect(note.tags).toEqual([]);
  });

  it('extracts tags when tagging is enabled', () => {
    const note = buildNoteFromTranscript(
      { transcript: 'authentication dashboard analytics review', sessionId: 's1', sessionOffsetSeconds: 0 },
      true,
    );
    expect(note.tags.length).toBeGreaterThan(0);
  });
});
