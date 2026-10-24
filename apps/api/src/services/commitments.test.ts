import { describe, expect, it } from 'vitest';
import { parseCommitments } from './commitments.js';

describe('parseCommitments', () => {
  it('keeps a spoken owner and a missing deadline', () => {
    expect(parseCommitments({
      commitments: [
        { id: 'n1', owner: 'Maya', deadline: null },
        { id: 'n1', owner: 'Sam', deadline: 'Friday' },
        { id: 'n2', owner: 'not mentioned', deadline: 'by Monday' },
        { id: '', owner: 'Ada', deadline: 'Friday' },
      ],
    })).toEqual([
      { id: 'n1', owner: 'Maya', deadline: null },
      { id: 'n2', owner: null, deadline: 'by Monday' },
    ]);
  });

  it('returns nothing when the model omits commitments', () => {
    expect(parseCommitments({ overview: 'ok' })).toEqual([]);
    expect(parseCommitments(null)).toEqual([]);
  });
});
