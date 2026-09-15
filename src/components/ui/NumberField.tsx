/**
 * Numeric input for the data tables.
 *
 * Editing a number in a controlled React input is deceptively tricky: while
 * the user types "-1.5e-4" the field passes through "-", "-1.", "-1.5e" and
 * other states that `Number()` reports as NaN. Writing those straight back
 * into the model would either wipe the field or push NaN into the engine.
 *
 * The fix is a local draft string that owns the text while the field is being
 * edited. The model is only updated when the draft parses to a finite number,
 * and the draft is dropped on blur so the field re-syncs with the canonical
 * value.
 */

import { useState } from 'react';

export interface NumberFieldProps {
  value: number;
  onChange(value: number): void;
  /** Accessible label. Table headers are visual only, so each cell needs one. */
  label: string;
  step?: number;
  className?: string;
  disabled?: boolean;
}

export function NumberField({
  value,
  onChange,
  label,
  step,
  className = '',
  disabled = false,
}: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const text = draft ?? String(value);
  const isInvalidDraft = draft !== null && !isParsable(draft);

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={isInvalidDraft || undefined}
      value={text}
      step={step}
      disabled={disabled}
      // A text input defaults to an intrinsic width of about 20 characters.
      // Inside a table sized to its content that default, not the CSS width,
      // is what drives the column, forcing a horizontal scrollbar. size={1}
      // collapses the intrinsic width so min-w / w-full take over.
      size={1}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (isParsable(raw)) onChange(Number(raw));
      }}
      onBlur={() => setDraft(null)}
      // Borderless at rest so the table reads as a grid of numbers rather than
      // a wall of boxes; the outline appears on hover and focus, where it
      // actually says something. `num` gives it the monospaced tabular figures
      // every number in the application shares, so an editable value and a
      // computed one sit on the same grid.
      className={[
        'num rounded-inset w-full min-w-16 border border-transparent bg-transparent px-2 py-1.5',
        'text-right text-sm transition-all duration-150',
        // Hover raises a full-strength ink edge rather than the old grey one:
        // in a borderless grid of numbers the hover outline is the only thing
        // that says "this cell is editable", so it may as well say it clearly.
        'hover:border-ink hover:bg-wash/5',
        // No `outline-none`: the application's one focus ring is declared in
        // global.css at zero specificity, so suppressing the outline here
        // would leave a keyboard user with nothing but a 1px border change.
        'focus:border-accent focus:bg-wash/8',
        isInvalidDraft
          ? 'border-danger bg-danger/10 text-danger focus:border-danger'
          : 'text-ink',
        'disabled:cursor-not-allowed disabled:text-ink-faint disabled:hover:border-transparent disabled:hover:bg-transparent',
        className,
      ].join(' ')}
    />
  );
}

/** True when the text represents a finite number. Rejects "" and "-". */
function isParsable(text: string): boolean {
  if (text.trim() === '') return false;
  return Number.isFinite(Number(text));
}
