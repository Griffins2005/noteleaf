import { describe, expect, it } from 'vitest';
import { parseNoteCorrections } from './noteCorrections.js';

describe('parseNoteCorrections', () => {
  it('keeps valid category changes and drops the rest', () => {
    expect(parseNoteCorrections({
      noteTypes: [
        { id: 'n1', type: 'decision' },
        { id: 'n1', type: 'action' },
        { id: 'n2', type: 'joke' },
        { id: '', type: 'insight' },
        { type: 'summary' },
      ],
    })).toEqual([{ id: 'n1', type: 'decision' }]);
  });

  it('returns nothing when the model omits noteTypes', () => {
    expect(parseNoteCorrections({ overview: 'ok' })).toEqual([]);
    expect(parseNoteCorrections(null)).toEqual([]);
  });
});
