/**
 * Segmented control: one choice out of a short, fixed set, shown all at once.
 *
 * A radio group, not a tab list. The distinction is not pedantry — a tab list
 * promises a panel per tab, and this control has one surface whose CONTENT
 * changes. `role="radiogroup"` says "pick one of these", which is exactly what
 * choosing between the geometry and a force diagram is.
 *
 * A native `<input type="radio">` set would bring the keyboard behaviour for
 * free, but not the segmented look: styling the labels into a joined track
 * means hiding the inputs anyway, and the roving tabindex below is the same
 * amount of code as fighting the native focus outline. Buttons it is.
 *
 * Arrow keys move the selection and the focus together and wrap around, and
 * they skip disabled options — otherwise the arrow key would land focus on a
 * segment that cannot be chosen and appear broken.
 */

import { useRef } from 'react';

export interface SegmentOption<Id extends string> {
  readonly id: Id;
  readonly label: string;
  /**
   * Shown instead of `label` below the `sm` breakpoint. Four full names do not
   * fit on a phone, and truncating them would hide which one is selected.
   */
  readonly shortLabel?: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<Id extends string> {
  options: readonly SegmentOption<Id>[];
  value: Id;
  onChange(id: Id): void;
  /** Accessible name for the group. */
  label: string;
  className?: string;
}

export function SegmentedControl<Id extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: SegmentedControlProps<Id>) {
  const buttonRefs = useRef(new Map<Id, HTMLButtonElement>());

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const offset = event.key === 'ArrowRight' || event.key === 'ArrowDown'
      ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
        ? -1
        : 0;
    if (offset === 0) return;

    event.preventDefault();

    // Walk past disabled options; stop after a full lap so an all-disabled
    // group cannot spin forever.
    const size = options.length;
    for (let step = 1; step <= size; step++) {
      const candidate = options[(((index + offset * step) % size) + size) % size];
      if (candidate === undefined || candidate.disabled === true) continue;
      onChange(candidate.id);
      buttonRefs.current.get(candidate.id)?.focus();
      return;
    }
  }

  return (
    /*
      A full-width, heavily ruled track, where this was a small inline pill.

      The change is a usability fix, not a taste one: as a quiet chip in the
      corner of a card header, this control was routinely missed, and a reader
      who never finds it never learns the shear and moment diagrams exist at
      all. A control nobody sees is a feature nobody has.

      `overflow-hidden` on the container is what lets the segments be square
      while the track keeps its radius — the first and last active fills are
      clipped by the parent rather than each carrying a corner of their own.
    */
    <div
      role="radiogroup"
      aria-label={label}
      className={`border-ink rounded-inset bg-surface flex w-full overflow-hidden border-2 ${className}`}
    >
      {options.map((option, index) => {
        const isActive = option.id === value;
        const isDisabled = option.disabled === true;

        return (
          <button
            key={option.id}
            ref={(node) => {
              if (node) buttonRefs.current.set(option.id, node);
              else buttonRefs.current.delete(option.id);
            }}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={isDisabled}
            // Roving tabindex: one stop for the whole group, arrows for the rest.
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              // `flex-1` so the five segments share the track evenly: a row of
              // equal targets reads as a set of choices, where widths that
              // follow the label lengths read as a sentence.
              'border-ink flex-1 border-r-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap',
              /*
                `sm:text-[1rem]` and NOT `sm:text-base`, which is the same size
                and a bug — the same one `Button` documents, walked into again.

                This project declares a `--color-base` token, so Tailwind
                resolves `text-base` in the COLOUR namespace and emits
                `color: var(--color-base)` instead of a font size. Written
                plainly beside `text-ink-muted` the colour utility loses on
                source order and the mistake stays invisible. Inside a media
                query it does not: responsive utilities are emitted after the
                base ones, so `sm:text-base` won and every inactive segment
                painted its label #fafafa on a white ground — five buttons that
                looked empty.

                The arbitrary value asks for the size and nothing else.
              */
              'transition-colors duration-150 last:border-r-0 sm:text-[1rem]',
              'disabled:pointer-events-none disabled:opacity-40',
              isActive
                // Filled accent with white type. The old active state was a
                // 20% tint of the same colour, which at this size is a shade
                // of grey-blue and does not survive being glanced at.
                ? 'bg-accent text-white'
                : 'text-ink-muted hover:bg-wash/6 hover:text-ink bg-surface',
            ].join(' ')}
          >
            <span className={option.shortLabel === undefined ? '' : 'hidden sm:inline'}>
              {option.label}
            </span>
            {option.shortLabel !== undefined && (
              <span className="sm:hidden">{option.shortLabel}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
