import { LeafMark } from './LeafMark';
import { cn } from '@/lib/cn';

const PHASES = [
  {
    label: 'Before',
    title: 'Open beside the call',
    detail: 'Keep Noteleaf on this device — Zoom, Teams, Meet, or a room. Nothing joins as a participant.',
  },
  {
    label: 'During',
    title: 'Talk. Notes appear.',
    detail: 'Tap the mic. Speech is transcribed on this device — the audio is never stored.',
  },
  {
    label: 'After',
    title: 'Recap and move on',
    detail: 'Key takeaways, action items, and post-meeting workflows — copy, email, or ask follow-ups.',
  },
] as const;

const SAMPLE_NOTES = [
  { type: 'action' as const, label: 'Action', text: 'Send the revised deck to Maya by Friday' },
  { type: 'decision' as const, label: 'Decision', text: 'Ship the beta on the 12th — no more scope' },
  { type: 'insight' as const, label: 'Insight', text: 'Customers care more about recap quality than speed' },
] as const;

const TYPE_DOT: Record<(typeof SAMPLE_NOTES)[number]['type'], string> = {
  action: 'bg-[var(--nl-color-note-action-bar)]',
  decision: 'bg-[var(--nl-color-note-decision-bar)]',
  insight: 'bg-[var(--nl-color-note-insight-bar)]',
};

function Waveform() {
  return (
    <div className="flex items-end gap-[2px] h-[14px]" aria-hidden="true">
      {[6, 12, 8, 16, 10, 14, 7].map((h, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-emerald-500 animate-waveform"
          style={{ height: h, animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}

/** Decorative product slice — how a live session looks inside Noteleaf. */
export function AuthProductPreview() {
  return (
    <div
      className="rounded-[14px] overflow-hidden border border-white/10 bg-[var(--nl-color-paper-base)] shadow-[0_18px_50px_rgba(0,0,0,0.28)]"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--nl-color-navy)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono uppercase tracking-[1.4px] text-white/80 truncate">
            Transcription active
          </span>
        </div>
        <span className="text-[10px] font-mono text-white/45 shrink-0">Q3 planning · 12:08</span>
      </div>

      <div className="px-4 py-3 border-b border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-sunken)]">
        <div className="flex items-start gap-3">
          <Waveform />
          <p className="text-[12px] font-sans leading-relaxed text-[var(--nl-color-ink-secondary)]">
            If we lock the date today, Maya can send the deck Friday and we stay on the beta timeline.
          </p>
        </div>
      </div>

      <ul className="px-4 py-2.5 space-y-2">
        {SAMPLE_NOTES.map((note) => (
          <li key={note.type} className="flex items-start gap-2.5">
            <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[note.type]}`} />
            <div className="min-w-0">
              <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--nl-color-ink-disabled)]">
                {note.label}
              </p>
              <p className="text-[13px] font-sans leading-snug text-[var(--nl-color-ink-primary)] mt-0.5">
                {note.text}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-4 py-3 border-t border-[var(--nl-border-subtle)] bg-[var(--nl-color-paper-raised)]">
        <p className="text-[9px] font-mono uppercase tracking-wider text-[var(--nl-color-ink-disabled)] mb-1">
          Recap ready
        </p>
        <p className="text-[12px] font-sans leading-relaxed text-[var(--nl-color-ink-tertiary)]">
          Date locked. Deck goes out Friday. Beta ships the 12th.
        </p>
      </div>
    </div>
  );
}

/**
 * Product story for /auth. Supports the sign-in action — does not compete with it.
 */
export function AuthProductIntro({ className }: { className?: string }) {
  return (
    <section
      className={cn(
        'relative flex flex-col justify-start',
        'bg-[var(--nl-sidebar-bg)] text-[var(--nl-sidebar-text)]',
        'px-6 py-10 sm:px-10',
        'lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-10 xl:px-14 lg:pt-12 lg:pb-8 xl:pt-14 xl:pb-10',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 10% 0%, rgba(31,164,99,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 100%, rgba(255,255,255,0.05), transparent 50%)',
        }}
      />

      <div className="relative z-[1] w-full max-w-[440px] mx-auto space-y-5 lg:space-y-5">
        <div className="flex items-center gap-3">
          <LeafMark size={34} />
          <div>
            <p
              className="font-serif text-[18px] font-bold leading-none text-white"
              style={{ letterSpacing: '-0.3px' }}
            >
              Noteleaf
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[1.6px] text-[var(--nl-sidebar-text-muted)] mt-1">
              Ambient AI notetaker
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <h1
            className="font-serif text-[26px] sm:text-[30px] xl:text-[32px] font-medium leading-[1.18] text-white"
            style={{ letterSpacing: '-0.5px' }}
          >
            Be{' '}
            <em className="italic font-medium text-white/80">fully present</em>
            {' '}and focus on the conversation.
          </h1>
          <p className="text-[14px] font-sans leading-relaxed text-[var(--nl-sidebar-text-muted)] max-w-[44ch]">
            AI captures meeting notes from your mic — on calls or in person. No bot joins your meeting.
          </p>
          <p className="text-[12px] font-mono leading-relaxed text-emerald-200/85 max-w-[44ch]">
            Audio is transcribed on this device and never stored.
          </p>
        </div>

        <div className="[@media(max-height:760px)]:hidden">
          <AuthProductPreview />
        </div>

        <ol className="grid grid-cols-3 gap-3 lg:gap-4">
          {PHASES.map((phase, i) => (
            <li key={phase.label} className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[1.4px] text-emerald-300/80">
                {String(i + 1).padStart(2, '0')} · {phase.label}
              </p>
              <p className="text-[12px] sm:text-[13px] font-sans font-medium text-white mt-1.5 leading-snug">
                {phase.title}
              </p>
              <p className="sr-only">{phase.detail}</p>
            </li>
          ))}
        </ol>

        <p className="text-[11px] font-mono leading-relaxed text-[var(--nl-sidebar-text-muted)] [@media(max-height:700px)]:hidden">
          Only the notes and transcript are saved to your account. The recording itself is never written or uploaded.
        </p>
      </div>
    </section>
  );
}
