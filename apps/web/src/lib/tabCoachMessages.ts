import type { MeetingPhase } from '@/lib/meetingPhase';

export type CoachTab = 'notes' | 'transcript' | 'summary' | 'chat';

export function getTabCoachMessage(
  tab: CoachTab,
  phase: MeetingPhase,
): { title: string; message: string } {
  switch (tab) {
    case 'notes':
      if (phase === 'before') {
        return {
          title: 'Before',
          message: 'Open beside your call. Tap the mic — focus on talking, not typing.',
        };
      }
      if (phase === 'during') {
        return {
          title: 'During',
          message: 'Notes appear live. Ask notes anytime mid-meeting.',
        };
      }
      return {
        title: 'After',
        message: 'Review actions, decisions, and insights from this session.',
      };

    case 'transcript':
      return {
        title: 'Transcript',
        message: 'Full verbatim speech with timestamps.',
      };

    case 'summary':
      if (phase === 'after') {
        return {
          title: 'After',
          message: 'Recap, takeaways, next steps. Export to share.',
        };
      }
      return {
        title: 'Recap',
        message: 'Instant recap when you stop — AI enhances in the background.',
      };

    case 'chat':
      if (phase === 'before') {
        return {
          title: 'Ask notes',
          message: 'Record first, then ask anything — answers cite your sources.',
        };
      }
      if (phase === 'during') {
        return {
          title: 'During',
          message: 'Ask while recording. Uses notes + live speech so far.',
        };
      }
      return {
        title: 'After',
        message: 'Follow-up questions with links back to notes and transcript.',
      };
  }
}

export function tabCoachStorageKey(sessionId: string | null, tab: CoachTab): string {
  return `nl_coach_${sessionId ?? 'none'}_${tab}`;
}

export function wasTabCoachDismissed(sessionId: string | null, tab: CoachTab): boolean {
  if (typeof window === 'undefined') return true;
  return sessionStorage.getItem(tabCoachStorageKey(sessionId, tab)) === '1';
}

export function dismissTabCoach(sessionId: string | null, tab: CoachTab): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(tabCoachStorageKey(sessionId, tab), '1');
}
