/** Banner for solver errors and for guidance while the model is incomplete. */

import type { ReactNode } from 'react';

import { InfoIcon, WarningIcon } from './icons';

export type AlertTone = 'error' | 'info';

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
}

export function Alert({ tone = 'info', title, children }: AlertProps) {
  const isError = tone === 'error';
  const Glyph = isError ? WarningIcon : InfoIcon;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={[
        // Full-strength border and a hard offset, like every other box. The
        // border keeps the tone's own hue rather than going to ink: an alert
        // outlined in plain black loses the thing that made it an alert.
        'rounded-inset shadow-card flex gap-4 border p-5',
        isError ? 'border-danger bg-danger/10' : 'border-accent bg-accent/10',
      ].join(' ')}
    >
      <span
        className={[
          'rounded-inset flex size-9 shrink-0 items-center justify-center ring-1 ring-inset',
          isError ? 'bg-danger/15 text-danger ring-danger' : 'bg-accent/20 text-accent-ink ring-accent',
        ].join(' ')}
      >
        <Glyph className="size-5" />
      </span>
      <div className="min-w-0 pt-1">
        <p className={`text-sm font-semibold ${isError ? 'text-danger' : 'text-accent-ink'}`}>
          {title}
        </p>
        {children && <div className="text-ink-muted mt-1.5 text-sm leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}
