/**
 * Status pill.
 *
 * The tension and compression tones come from `utils/theme.ts`, the single
 * place the structural colour convention is defined, so the badge in the
 * results table and the stroke in the drawing can never drift apart.
 */

import type { ReactNode } from 'react';

import type { AxialState } from '../../types/frame';
import { STATE_BADGE } from '../../utils/theme';

export type BadgeTone = AxialState | 'info';

const TONE_CLASSES: Record<BadgeTone, string> = {
  ...STATE_BADGE,
  info: 'bg-accent/15 text-accent-ink ring-accent/30',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = 'zero', children }: BadgeProps) {
  return (
    <span
      // Square, and the ring is the border. With the radius gone `ring-1
      // ring-inset` draws a hard box on the tone's own hue, which is exactly
      // the edge this skin wants — no extra border utility needed.
      className={`rounded-inset inline-flex items-center px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
