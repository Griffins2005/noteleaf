import { describe, it, expect } from 'vitest';
import { isSameUtterance, joinUtterances, shouldStitchUtterances } from '../utteranceStitch';

describe('utteranceStitch', () => {
  it('joins finals that arrive within two seconds', () => {
    expect(shouldStitchUtterances(10, 11.2, 'we propose a dashboard', 'for community carbon data')).toBe(true);
    expect(joinUtterances('we propose a dashboard', 'for community carbon data')).toBe(
      'we propose a dashboard for community carbon data',
    );
  });

  it('does not stitch after a pause', () => {
    expect(shouldStitchUtterances(10, 14, 'hello', 'later')).toBe(false);
  });

  it('treats a flushed interim and the Chrome final as the same utterance', () => {
    expect(isSameUtterance("If you're ready", "If you're ready")).toBe(true);
    expect(isSameUtterance('hello there everyone', 'hello there')).toBe(true);
  });
});
