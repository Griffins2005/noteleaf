/**
 * @file AudioVisualizer.tsx
 * @description Animated waveform visualiser displayed in the live transcript bar.
 *
 * Implementation notes:
 *   - Uses CSS animation with staggered delays to create a natural waveform.
 *   - Does NOT connect to the actual audio stream (no AnalyserNode).
 *     A real audio analyser would add latency and complexity for marginal
 *     visual benefit. The simulated animation is indistinguishable in practice.
 *   - Bars are purely decorative (aria-hidden) — no semantic content.
 *   - Animation pauses when not recording to reduce CPU use.
 *
 * The 5-bar layout matches the design established in the prototype.
 */

import { cn } from '@/lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioVisualizerProps {
  isActive: boolean;
  className?: string;
}

// ─── Bar config — heights and delays create a natural-looking waveform ────────

const BARS = [
  { delay: '0ms',   minH: 'h-1.5', maxH: 'h-4' },
  { delay: '180ms', minH: 'h-2.5', maxH: 'h-5' },
  { delay: '80ms',  minH: 'h-1',   maxH: 'h-5' },
  { delay: '240ms', minH: 'h-2',   maxH: 'h-4' },
  { delay: '120ms', minH: 'h-1.5', maxH: 'h-3.5' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AudioVisualizer({ isActive, className }: AudioVisualizerProps) {
  return (
    <div
      className={cn('flex items-center gap-0.5 h-5', className)}
      aria-hidden="true"  // Purely decorative
    >
      {BARS.map((bar, i) => (
        <span
          key={i}
          style={{ animationDelay: bar.delay }}
          className={cn(
            'w-[3px] rounded-sm transition-all',
            isActive
              ? cn(
                  'bg-[var(--nl-color-danger)]',
                  '[animation:waveform_0.8s_ease-in-out_infinite_alternate]',
                )
              : cn('bg-[var(--nl-color-ink-disabled)]', 'h-1.5'),
          )}
        />
      ))}

      {/*
        Keyframe animation injected as a style tag.
        Cannot use Tailwind for this since it requires dynamic height values.
        The animation simulates random bar heights between ~25% and ~100% of max.
      */}
      <style>{`
        @keyframes waveform {
          0%   { height: 4px;  }
          25%  { height: 14px; }
          50%  { height: 8px;  }
          75%  { height: 18px; }
          100% { height: 6px;  }
        }
      `}</style>
    </div>
  );
}
