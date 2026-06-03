/**
 * Derives the current meeting lifecycle phase for UX guidance.
 * Inspired by before / during / after flows — adapted for ambient capture.
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

export const MEETING_PHASES: {
  id: MeetingPhase;
  label: string;
  hint: string;
}[] = [
  {
    id: 'before',
    label: 'Before',
    hint: 'Open Noteleaf beside Zoom, Teams, Meet, or an in-person conversation',
  },
  {
    id: 'during',
    label: 'During',
    hint: 'Focus on the discussion — AI captures notes and transcript live',
  },
  {
    id: 'after',
    label: 'After',
    hint: 'Review recap, ask follow-ups, copy action items, export',
  },
];
