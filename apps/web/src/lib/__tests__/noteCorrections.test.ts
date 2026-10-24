import { describe, expect, it } from 'vitest';
import type { Note } from '@noteleaf/shared-types';
import { applyNoteCorrections } from '../noteCorrections';

function note(overrides: Partial<Note> & Pick<Note, 'id' | 'type'>): Note {
  return {
    sessionId: 's1',
    content: 'Griffins will benchmark transcription accuracy before Friday',
    tags: [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds: 0,
    ...overrides,
  };
}

describe('applyNoteCorrections', () => {
  it('updates the category on the existing note', () => {
    const notes = [note({ id: 'n1', type: 'action' })];
    const next = applyNoteCorrections(notes, [{ id: 'n1', type: 'summary' }]);
    expect(next[0]?.type).toBe('summary');
    expect(next[0]?.id).toBe('n1');
    expect(next[0]?.isUserEdited).toBeUndefined();
  });

  it('leaves a note the user edited', () => {
    const notes = [note({ id: 'n1', type: 'action', isUserEdited: true })];
    const next = applyNoteCorrections(notes, [{ id: 'n1', type: 'summary' }]);
    expect(next).toBe(notes);
  });

  it('ignores an unknown note id', () => {
    const notes = [note({ id: 'n1', type: 'insight' })];
    expect(applyNoteCorrections(notes, [{ id: 'missing', type: 'action' }])).toBe(notes);
  });
});
