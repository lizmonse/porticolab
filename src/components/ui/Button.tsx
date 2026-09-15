/**
 * Button primitive.
 *
 * `primary` is the only filled control in the system. That exclusivity is the
 * point: on any given screen it marks the one action the user most likely came
 * to perform, so a second one competing with it would cost it all its meaning.
 * It uses the interface accent and stays clear of the structural blue and
 * orange, so a control never reads as a statement about the structure.
 *
 * It used to be a gradient with a coloured glow beneath it. Now it is a flat
 * accent fill inside an ink border with a hard 2px offset behind it — the same
 * three ingredients every other box in the application is built from. The
 * press animation lives in `.u-btn`: hover lifts the button off its offset,
 * `:active` drops it onto it and kills the shadow, so the control physically
 * closes the gap instead of merely dimming.
 *
 * `danger` is quiet at rest and turns red on hover. Delete controls sit in
 * every table row, and painting them all red at rest would make destruction
 * the loudest thing on the screen.
 *
 * Focus rings are not declared here. `global.css` gives every focusable
 * element one ring, defined once, at zero specificity — so this file adds
 * nothing and cannot drift from the rest of the interface.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'ghostOnDark' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const GHOST = 'text-ink-muted hover:bg-wash/8 hover:text-ink';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent border-ink shadow-card border text-white hover:brightness-110',
  // Same box, no fill: a secondary control is the outline of the primary one,
  // which is what makes the pair read as one family rather than two designs.
  secondary:
    'border-line-strong text-ink-muted hover:border-ink hover:text-ink shadow-card border bg-surface hover:bg-wash/5',
  ghost: GHOST,
  // Kept as a distinct name because the navbar asks for it, but it no longer
  // needs its own treatment: `ghost` is now built from `wash`, which inverts
  // with the theme, so one variant reads correctly on either ground.
  ghostOnDark: GHOST,
  danger: 'text-ink-faint hover:bg-danger/12 hover:text-danger active:bg-danger/20',
};

/*
  `sm:text-[1rem]` and NOT `sm:text-base`, which is the same size and a bug.

  This project declares a `--color-base` token, so Tailwind resolves
  `text-base` in the COLOUR namespace and emits `color: var(--color-base)` —
  the page background — instead of a font size. Where the collision is written
  plainly (`text-ink text-base`) the colour utility loses on source order and
  the mistake stays invisible. Inside a media query it does not: responsive
  utilities are emitted after the base ones, so `sm:text-base` won, and every
  large button had been painting its label the colour of the page since this
  record was written. On the primary button, over an indigo gradient, #f4f7fc
  passes for white, which is why it survived; the first large button on a pale
  card rendered its label invisible.

  The arbitrary value asks for the size and nothing else.
*/
/*
  `rounded-inset`, the 3px token, at every size — where this used to step from
  `rounded-lg` up to `rounded-xl` as the button grew. A radius that scales with
  the control is a soft-UI idea: it keeps the corner's *visual* weight constant.
  This skin wants the opposite, a single drawn corner everywhere, so the radius
  is a constant and the token is the one the cards' insets already use.
*/
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'rounded-inset gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'rounded-inset gap-2 px-3.5 py-2 text-sm',
  lg: 'rounded-inset gap-2 px-5 py-2.5 text-sm sm:px-6 sm:py-3 sm:text-[1rem]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center font-medium whitespace-nowrap',
        // `u-btn` carries the shared hover lift and press, so every control in
        // the application answers the pointer with the same timing. The
        // durations live in global.css, not here.
        'u-btn',
        'disabled:pointer-events-none disabled:opacity-40',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
