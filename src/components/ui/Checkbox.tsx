/** Checkbox used for the restraint flags in the supports table. */

export interface CheckboxProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
  /** When false the label is visually hidden but still read by screen readers. */
  showLabel?: boolean;
}

export function Checkbox({ checked, onChange, label, showLabel = false }: CheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        // Explicit aria-label rather than relying on the wrapping <label>:
        // the accessibility tree was announcing these as "on" (the value
        // attribute) instead of the visually hidden text, which would leave a
        // screen reader user with no idea which restraint they were toggling.
        aria-label={label}
        // accent-* rather than text-*: without the @tailwindcss/forms plugin a
        // text colour does nothing to a native checkbox, which then paints
        // itself with the browser default instead of the interface colour.
        // `rounded-none`, not merely the absence of a radius: a native
        // checkbox brings its own rounding from the user agent, so the corner
        // has to be reset explicitly or it stays a soft square in a table of
        // hard ones.
        className="accent-accent border-line-strong size-4 cursor-pointer rounded-none transition-colors"
      />
      <span className={showLabel ? 'text-ink-muted text-xs' : 'sr-only'}>{label}</span>
    </label>
  );
}
