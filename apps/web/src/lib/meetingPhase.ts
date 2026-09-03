/**
 * Derives the current meeting lifecycle phase for UX guidance.
 * Inspired by Zoom My Notes before / during / after flows — ambient capture model.
 */

export type MeetingPhase = 'before' | 'during' | 'after';

export interface MeetingPhaseInput {
  isRecording: boolean;
  hasSessionContent: boolean;
  recordingStatus: string;
}

export function getMeetingPhase({
  isRecording,
  hasSessionContent,
  recordingStatus,
}: MeetingPhaseInput): MeetingPhase {
  if (isRecording || recordingStatus === 'connecting' || recordingStatus === 'stopping') {
    return 'during';
  }
  if (hasSessionContent) return 'after';
  return 'before';
}

export type MeetingPhaseActionId =
  | 'start-capture'
  | 'open-ask-notes'
  | 'open-recap'
  | 'copy-tasks';

export interface MeetingPhaseAction {
  id: MeetingPhaseActionId;
  label: string;
}

export const MEETING_PHASES: {
  id: MeetingPhase;
  label: string;
  hint: string;
  actions: MeetingPhaseAction[];
}[] = [
  {
    id: 'before',
    label: 'Before',
    hint: 'Open Noteleaf beside Zoom, Teams, Google Meet, or an in-person conversation — then tap the mic. No bot joins your call.',
    actions: [{ id: 'start-capture', label: 'Start capturing' }],
  },
  {
    id: 'during',
    label: 'During',
    hint: 'Be fully present. Transcription runs live on your device — switch to Ask notes anytime for mid-meeting questions.',
    actions: [{ id: 'open-ask-notes', label: 'Ask during meeting' }],
  },
  {
    id: 'after',
    label: 'After',
    hint: 'Review your recap, copy key takeaways and next steps, email the team, or keep digging with Ask notes.',
    actions: [
      { id: 'open-recap', label: 'View recap' },
      { id: 'copy-tasks', label: 'Copy next steps' },
    ],
  },
];

/** Zoom-style “How to use” steps — open → transcribe → recap → share. */
export const MEETING_HOW_TO_STEPS = [
  {
    step: 1,
    title: 'Open Noteleaf',
    detail: 'Keep it beside your call on this device — any platform, in person or remote.',
  },
  {
    step: 2,
    title: 'Transcribe live',
    detail: 'Tap the mic. You’ll see when transcription is active; notes appear as you speak.',
  },
  {
    step: 3,
    title: 'Get your recap',
    detail: 'Stop recording for an instant recap — AI enhances summaries, takeaways, and action items.',
  },
  {
    step: 4,
    title: 'Review & share',
    detail: 'Copy, email, download, or ask follow-ups — workflows live on the Recap tab.',
  },
] as const;
