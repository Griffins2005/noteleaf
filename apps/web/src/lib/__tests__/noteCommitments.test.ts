import { describe, expect, it } from 'vitest';
import type { Note } from '@noteleaf/shared-types';
import { applyNoteCommitments } from '../noteCommitments';

function note(overrides: Partial<Note> & Pick<Note, 'id'>): Note {
  return {
    sessionId: 's1',
    type: 'action',
    content: 'Maya will send the deck by Friday',
    tags: [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds: 0,
    ...overrides,
  };
}

describe('applyNoteCommitments', () => {
  it('records the owner and leaves a missing deadline empty', () => {
    const notes = [note({ id: 'n1' })];
    const next = applyNoteCommitments(notes, [{ id: 'n1', owner: 'Maya', deadline: null }]);
    expect(next[0]?.commitment).toEqual({ owner: 'Maya', deadline: null });
    expect(next[0]?.content).toBe(notes[0]?.content);
  });

  it('leaves a note the user edited', () => {
    const notes = [note({ id: 'n1', isUserEdited: true })];
    expect(applyNoteCommitments(notes, [{ id: 'n1', owner: 'Maya', deadline: 'Friday' }])).toBe(notes);
  });
});
