import { describe, it, expect } from 'vitest';
import {
  hasEnoughSessionContent,
  isMeaningfulSpeech,
  isPlaceholderRecap,
  isNoiseUtterance,
  isWeakRecapLine,
} from '../speechQuality';

describe('speechQuality', () => {
  it('treats greetings and fragments as noise', () => {
    expect(isNoiseUtterance("It's")).toBe(true);
    expect(isNoiseUtterance("If you're ready")).toBe(true);
    expect(isNoiseUtterance('thank you so much')).toBe(true);
    expect(isNoiseUtterance('is muted')).toBe(true);
    expect(isNoiseUtterance('???')).toBe(true);
    expect(isNoiseUtterance('I think I think so I think that is')).toBe(true);
  });

  it('keeps real meeting speech', () => {
    expect(
      isMeaningfulSpeech(
        'We decided to ship the navy theme and Maya will follow up Friday.',
      ),
    ).toBe(true);
  });

  it('does not recap a two-fragment failed listen', () => {
    expect(
      hasEnoughSessionContent(
        [],
        '',
        [{ text: "If you're ready" }, { text: "It's" }],
      ),
    ).toBe(false);
  });

  it('recaps a real meeting transcript', () => {
    const transcript =
      'Cornell Carbon Watch is proposing a dashboard so community carbon data is verifiable without middlemen.';
    expect(hasEnoughSessionContent([], transcript, [{ text: transcript }])).toBe(true);
  });

  it('treats agreement filler as a weak recap line', () => {
    expect(isWeakRecapLine("I think that's a good suggestion and it's very doable")).toBe(true);
    expect(
      isWeakRecapLine(
        'Cornell Carbon Watch is proposing a dashboard so community carbon data is verifiable.',
      ),
    ).toBe(false);
  });
});
