import { describe, it, expect } from 'vitest';
import type { Note } from '@noteleaf/shared-types';
import { buildInstantRecap } from '../instantRecap';

function note(content: string, type: Note['type'] = 'insight'): Note {
  return {
    id: 'n1',
    sessionId: 's1',
    type,
    content,
    tags: [],
    capturedAt: new Date().toISOString(),
    sessionOffsetSeconds: 0,
  };
}

describe('buildInstantRecap', () => {
  it('does not use agreement filler as the overview when a transcript exists', () => {
    const recap = buildInstantRecap(
      's1',
      [note("I think that's a good suggestion and it's very doable")],
      'We now propose Carbon Watch, a dashboard so community carbon data is verifiable without middlemen.',
    );
    expect(recap.overview.toLowerCase()).toContain('carbon watch');
    expect(recap.overview.toLowerCase()).not.toContain('good suggestion');
  });
});
