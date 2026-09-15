/**
 * A read-only statement of the unit system every field in the column below is
 * typed in.
 *
 * Not a control. The whole application is fixed to kN, m, GPa, mm² and cm⁴,
 * and the engine has no other mode to switch into — so this is a caption, and
 * it is styled as one: muted type, no fill, no shadow, and a single hairline
 * under it to close the strip off from the panels below.
 *
 * ---------------------------------------------------------------------------
 * Why it moved out of the top bar
 * ---------------------------------------------------------------------------
 * It used to live in the page header, beside two buttons, where it read as a
 * third control that happened not to respond to clicks. Here it sits directly
 * above the tables whose columns it describes — which is the only place the
 * information is actually needed, because "A (mm²)" in a table header is only
 * unambiguous once you know what the rest of the sheet is in.
 *
 * It leads the column rather than closing it: a unit system is something you
 * need BEFORE you read the first number, not after the last one.
 */

import { UNITS } from '../../utils/units';

export function UnitsStrip() {
  return (
    <p className="border-line-strong text-ink-faint flex min-w-0 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b pb-3 text-[11px] font-medium tracking-wide print:hidden">
      <span className="text-ink-muted font-semibold tracking-[0.18em] uppercase">Unidades</span>
      <span className="num">
        {UNITS.force} · {UNITS.length} · {UNITS.modulus} · {UNITS.area} · {UNITS.inertia}
      </span>
    </p>
  );
}
