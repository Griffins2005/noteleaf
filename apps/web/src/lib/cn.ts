/**
 * @file cn.ts
 * @description Class name utility — merges Tailwind CSS classes without conflicts.
 *
 * Uses `clsx` to handle conditional classes and `tailwind-merge` to resolve
 * Tailwind class conflicts (e.g. `p-4 p-2` → `p-2`).
 *
 * This is the standard pattern in the Next.js / shadcn ecosystem.
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-accent', className)
 *   // → 'px-4 py-2 bg-accent' (or without bg-accent if isActive is false)
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
