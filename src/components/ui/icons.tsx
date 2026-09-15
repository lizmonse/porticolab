/**
 * Inline SVG icons.
 *
 * Hand-rolled rather than pulled from an icon package: the dashboard needs a
 * handful of glyphs, and a dependency for that would violate the project's
 * zero-unnecessary-dependencies rule.
 */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </Icon>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function StructureIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 19h18M5 19 12 5l7 14M7.5 14h9" />
    </Icon>
  );
}

/** Marks the solve action: a matrix bracket pair, the verb of this tool. */
export function SolveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8 4H5v16h3M16 4h3v16h-3" />
      <path d="M10 10h.01M14 10h.01M10 14h.01M14 14h.01" />
    </Icon>
  );
}

/** Marks the "restore the example" action. */
export function RestoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 4v4h4" />
    </Icon>
  );
}

/** Shown by the theme toggle while the light theme is active. */
export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  );
}

/** Shown by the theme toggle while the dark theme is active. */
export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </Icon>
  );
}

/** Stands in for a results table that has nothing in it yet. */
export function TableIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 5h18v14H3zM3 10h18M9 10v9" />
    </Icon>
  );
}

/** Confirms that the results on screen match the model on screen. */
export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 13 4 4L19 7" />
    </Icon>
  );
}

/**
 * Exports the calculation report.
 *
 * A printer rather than a downward arrow or a page glyph: the action really is
 * `window.print()`, and the browser's own print dialog is what the user lands
 * in. A download arrow would promise a file that arrives without a dialog, and
 * a plain document would not say that anything is about to happen.
 */
export function PrintIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 8V4h10v4M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v5H7z" />
    </Icon>
  );
}
