/**
 * Panel: the base container of the whole application.
 *
 * It used to be glass — a translucent fill letting the ruled ground show
 * through, plus a hairline and an inset highlight standing in for elevation.
 * That reading depended on the card being *almost* the page, separated by a
 * few percent of lightness and a soft edge.
 *
 * This one is the opposite claim. An opaque surface, a drawn ink border and a
 * hard 2px offset behind it: the panel is a sheet laid on the page, not a pane
 * suspended over it. The offset comes from `--shadow-card`, so it re-colours
 * itself per theme and stays a visible ledge on charcoal, where a blurred drop
 * shadow was invisible and needed a second recipe.
 */

import type { ReactNode } from 'react';

/**
 * Surface colours. A tone is a dedicated variant rather than a className the
 * caller passes in, for the reason spelled out in `Button`: the background and
 * the border would collide with the defaults, and Tailwind resolves colliding
 * utilities by stylesheet order rather than by prop order.
 */
export type CardTone = 'default' | 'warning' | 'danger';

const TONE_CLASSES: Record<CardTone, string> = {
  default: 'bg-surface border-ink',
  // The tinted tones keep their own border colour: a warning panel outlined in
  // plain ink loses the thing that made it a warning at a glance. They are
  // pushed to full opacity so the edge is as drawn as the neutral one.
  warning: 'border-warn bg-warn/10',
  danger: 'border-danger bg-danger/10',
};

export interface CardProps {
  children: ReactNode;
  className?: string;
}

export interface CardSurfaceProps extends CardProps {
  tone?: CardTone;
}

export function Card({ children, className = '', tone = 'default' }: CardSurfaceProps) {
  return (
    <section
      // On paper a card is not a surface, it is a section. The border and the
      // shadow were saying "this floats above the page"; a report just needs
      // the heading and the content, and every rule dropped here is vertical
      // space returned to the table below it.
      className={`rounded-card shadow-card border print:border-0 print:shadow-none ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: string;
  /** Short line under the title, for units or context. */
  subtitle?: string;
  /** Controls rendered on the right-hand side of the header. */
  actions?: ReactNode;
  /**
   * Classes for the actions slot.
   *
   * Its purpose is `print:hidden`. Almost every header's actions are controls
   * — a toggle, a selector, an "add row" button — and none of them belong in
   * the printed report, while the title and subtitle beside them do. Putting
   * the class here rather than on each control keeps the removal at the slot
   * that holds them, so a header with three buttons needs one class, not three.
   */
  actionsClassName?: string;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  actionsClassName = '',
}: CardHeaderProps) {
  return (
    // `bg-surface-raised` and an ink rule: the header is a title bar cut into
    // the panel, not just the first paragraph of it. On paper both go — a
    // printed section needs its heading, not a tinted strip behind it.
    <header className="border-ink bg-surface-raised flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b px-5 py-4 sm:px-6 sm:py-5 print:gap-y-0 print:border-0 print:bg-transparent print:px-0 print:py-1">
      <div className="min-w-0">
        <h2 className="font-display text-ink text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-ink-faint mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && (
        <div className={`flex shrink-0 items-center gap-2 ${actionsClassName}`}>{actions}</div>
      )}
    </header>
  );
}

export function CardBody({ children, className = '' }: CardProps) {
  return (
    <div className={`p-5 sm:p-6 print:px-0 print:pt-2 print:pb-0 ${className}`}>{children}</div>
  );
}
