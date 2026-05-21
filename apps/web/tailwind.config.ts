/**
 * @file tailwind.config.ts
 * @description Tailwind CSS configuration for Noteleaf.
 *
 * Extends Tailwind's defaults with:
 *   - Custom font families pointing to our CSS variable fonts.
 *   - Design token colour references (tokens.css vars → Tailwind class names).
 *   - Custom animation for waveform and slide-in effects.
 *
 * Philosophy: we use Tailwind for layout, spacing, and responsive utilities.
 * All colour and typography values reference CSS tokens, not Tailwind's
 * default palette. This ensures components use our design system, not
 * arbitrary Tailwind colours.
 */

import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/features/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Font families — reference our CSS variable fonts from layout.tsx
      fontFamily: {
        mono:  ['var(--font-dm-mono)', 'DM Mono', 'monospace'],
        serif: ['var(--font-fraunces)', 'Fraunces', 'serif'],
        sans:  ['var(--font-dm-mono)', 'DM Mono', 'monospace'],
      },

      // Border radius tokens
      borderRadius: {
        sm: 'var(--nl-radius-sm)',
        md: 'var(--nl-radius-md)',
        lg: 'var(--nl-radius-lg)',
        xl: 'var(--nl-radius-xl)',
      },

      // Custom keyframes used in components
      keyframes: {
        slideIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        waveform: {
          '0%':   { height: '4px' },
          '25%':  { height: '14px' },
          '50%':  { height: '8px' },
          '75%':  { height: '18px' },
          '100%': { height: '6px' },
        },
      },

      animation: {
        slideIn:  'slideIn 0.2s ease-out both',
        waveform: 'waveform 0.8s ease-in-out infinite alternate',
      },
    },
  },
  plugins: [],
};

export default config;
