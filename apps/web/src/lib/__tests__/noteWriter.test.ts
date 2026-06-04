import { describe, it, expect } from 'vitest';
import {
  cleanSpeech,
  formatHumanNote,
  isRhetoricalSpeech,
  refineNoteType,
} from '../noteWriter';

describe('noteWriter', () => {
  it('strips filler words', () => {
    expect(cleanSpeech('Um, like, we need to, you know, send the deck')).toBe('we need to, send the deck');
  });

  it('detects rhetorical monologue', () => {
    const speech =
      'So tomorrow when someone asks you a question any question even something small like tea or coffee try something revolutionary try saying yes watch their face they will not know what to do with you';
    expect(isRhetoricalSpeech(speech)).toBe(true);
  });

  it('downgrades rhetorical action to summary', () => {
    const speech =
      'So tomorrow when someone asks you a question try something revolutionary try saying yes watch their face they will not know what to do';
    expect(refineNoteType(speech, 'action')).toBe('summary');
  });

  it('formats action notes verb-first', () => {
    const note = formatHumanNote('We need to schedule a follow-up with the client by Friday', 'action');
    expect(note).toBe('Schedule a follow-up with the client by Friday');
  });

  it('formats decision notes with decided prefix', () => {
    const note = formatHumanNote('We decided to go with the blue design', 'decision');
    expect(note).toMatch(/^Decided:/);
    expect(note.toLowerCase()).toContain('blue design');
  });

  it('truncates long summary monologue', () => {
    const long =
      'Nairobi is a city built on decisions made in the time it takes you to merge into oncoming traffic the makanga does not consult a focus group he sees a one inch gap between a fuel tanker and a pro box and he goes he commits he prays after not before that ladies and gentleman university';
    const note = formatHumanNote(long, 'summary');
    expect(note.length).toBeLessThan(130);
  });
});
