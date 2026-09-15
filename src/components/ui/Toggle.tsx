/**
 * Switch for the restraint columns.
 *
 * Built on a real `<input type="checkbox">` kept visually hidden rather than
 * on a styled `<div>`: the native control brings keyboard support, form
 * semantics and the checked state for free, and `peer-*` classes let the
 * visible track and knob follow it without a line of JavaScript.
 *
 * Sized small on purpose. It sits twice in every row of a dense table, so a
 * full-size switch would dominate rows that are mostly numbers.
 */

export interface ToggleProps {
  checked: boolean;
  onChange(checked: boolean): void;
  /** Accessible name. Column headers are visual only, so each cell needs one. */
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        className={[
          // Square track and square knob. A switch is the one control where a
          // pill is close to a convention, and it goes anyway: a lone rounded
          // capsule sitting in a table of hard-edged boxes is the single most
          // visible leftover of the old skin, and the state is already carried
          // by the fill and the knob's travel rather than by the shape.
          'rounded-inset relative block h-5 w-9 border-2 transition-colors duration-200',
          // Off is a recessed, empty track; on is filled with the accent. The
          // difference has to survive a glance across a dense table, which is
          // why the border is 2px: at 1px the off state reads as a disabled
          // input rather than as a switch waiting to be thrown.
          'border-ink bg-transparent',
          'peer-checked:border-ink peer-checked:bg-accent',
          'peer-hover:bg-wash/15 peer-checked:peer-hover:brightness-110',
          // The focus ring goes on the visible track, since the real checkbox
          // it follows is `sr-only` and has nothing to draw a ring around.
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-bright',
          // The knob, drawn as a pseudo-element so the whole control is one
          // node. `ink` rather than white: the off track is now transparent, so
          // a white knob would vanish into the light theme's card entirely.
          // On, it sits on the accent fill, where ink still reads.
          // The geometry has to close exactly, or the knob looks mis-set. The
          // 2px border leaves a 32×16 padding box; a 12px knob inset 2px sits
          // dead centre, and `translate-x-4` (16px) lands it 2px from the far
          // edge. Change the track height or the border and all three move.
          'after:absolute after:top-0.5 after:left-0.5 after:size-3',
          'after:bg-ink after:transition-all after:duration-200',
          'peer-checked:after:translate-x-4 peer-checked:after:bg-white',
        ].join(' ')}
      />
    </label>
  );
}
