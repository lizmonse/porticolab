/**
 * Visual tokens shared across the interface.
 *
 * Two colour families, deliberately kept apart:
 *
 *   - STRUCTURAL colours carry meaning about the analysis. Blue is tension,
 *     orange is compression, green is the deflected shape. They must never be
 *     reused for interface chrome, or a button would look like it was saying
 *     something about the structure.
 *
 *   - The PRIMARY interface colour is the electric blue accent, used for
 *     buttons, links and focus rings. It never appears inside the drawing.
 *
 * Those two share a hue, which is a known and documented exception rather than
 * an oversight — see the KNOWN EXCEPTION note in `styles/global.css`. Nothing
 * in this file needs to care: it names meanings, and the stylesheet decides
 * what each one looks like.
 *
 * Every value here is a reference to a custom property declared in
 * `styles/global.css`, never a literal hex. That file is the single place the
 * palette is defined; this one only says which token means what. Retuning the
 * tension blue is one edit, and the drawing, the badges and the legend all
 * follow it.
 *
 * The `var(...)` strings are applied through `style`, not through an SVG
 * presentation attribute: attributes are parsed by the SVG grammar, which has
 * no notion of `var()`, so `stroke="var(--x)"` silently paints nothing. The
 * CSS property does resolve it.
 */

import type { AxialState } from '../types/frame';
import type { DiagramKind } from './diagrams';

/** Stroke colours for the drawing, keyed by axial state. */
export const BAR_STROKE: Record<AxialState, string> = {
  tension: 'var(--color-tension)',
  compression: 'var(--color-compression)',
  zero: 'var(--color-bar-zero)',
};

/** Colour of the deflected shape. A secondary tone, never a structural one. */
export const DEFORMED_STROKE = 'var(--color-deformed)';

/** Colour of the load arrows. */
export const LOAD_STROKE = 'var(--color-load)';

/** Neutral tones used by the drawing for nodes and supports. */
export const NODE_STROKE = 'var(--color-ink-muted)';
export const SUPPORT_STROKE = 'var(--color-ink-faint)';

/**
 * Fill of a node marker: the canvas ground, so a bar appears to pass behind
 * the joint rather than through a floating disc.
 */
export const NODE_FILL = 'var(--color-base-raised)';

/**
 * The drawing surface's own colour, used as a halo behind SVG text.
 *
 * Stroked behind a label with `paint-order: stroke`, it knocks a hole in
 * whatever the label happens to sit on. The panel is the `sunken` tone, so the
 * halo has to be that tone and not the card's: anything else would show as a
 * pale smear around every number.
 */
export const CANVAS_HALO = 'var(--color-sunken)';

/** Fills that distinguish a pinned support from a roller at a glance. */
export const SUPPORT_FILL_PINNED = 'var(--color-line-strong)';
export const SUPPORT_FILL_ROLLER = 'var(--color-surface-raised)';

/**
 * Badge styling per axial state.
 *
 * The fill and ring take the stroke colour so the badge is unmistakably the
 * same hue as the bar it describes; the *text* takes the `-ink` partner,
 * which on a light ground is a darker shade of that same hue. See the note in
 * global.css: one tone cannot be both a vivid 3px stroke and AA-legible 12px
 * type on its own tint.
 */
export const STATE_BADGE: Record<AxialState, string> = {
  tension: 'bg-tension/15 text-tension-ink ring-tension/30',
  compression: 'bg-compression/15 text-compression-ink ring-compression/30',
  zero: 'bg-ink-faint/10 text-ink-faint ring-ink-faint/25',
};

/** Text colour per axial state, for the metric tiles. */
export const STATE_TEXT: Record<AxialState, string> = {
  tension: 'text-tension-ink',
  compression: 'text-compression-ink',
  zero: 'text-ink',
};

/** Spanish label per axial state, for tables and legends. */
export const STATE_LABEL: Record<AxialState, string> = {
  tension: 'Tracción',
  compression: 'Compresión',
  zero: 'Nula',
};

// ---------------------------------------------------------------------------
// Internal-force diagrams
// ---------------------------------------------------------------------------

/**
 * Sign colours for the diagrams.
 *
 * A third structural pair, kept apart from the tension blue and the
 * compression orange on purpose: those two state a fact about a member's
 * axial force, and a positive shear ordinate is not that fact. See the note
 * beside the tokens in `global.css`.
 */
export const DIAGRAM_POSITIVE = 'var(--color-diagram-positive)';
export const DIAGRAM_NEGATIVE = 'var(--color-diagram-negative)';

/** Picks the sign colour of a lobe. */
export function diagramStroke(positive: boolean): string {
  return positive ? DIAGRAM_POSITIVE : DIAGRAM_NEGATIVE;
}

/** Spanish name of each diagram, for the view selector and the legend. */
export const DIAGRAM_LABEL: Record<DiagramKind, string> = {
  axial: 'Fuerza axial',
  shear: 'Fuerza cortante',
  moment: 'Momento flector',
};

/** The symbol an engineer expects on the diagram: N, V, M. */
export const DIAGRAM_SYMBOL: Record<DiagramKind, string> = {
  axial: 'N',
  shear: 'V',
  moment: 'M',
};

/** What each diagram's positive sign means, spelled out in the legend. */
export const DIAGRAM_SIGN_LABEL: Record<DiagramKind, { positive: string; negative: string }> = {
  axial: { positive: 'Tracción (N > 0)', negative: 'Compresión (N < 0)' },
  shear: { positive: 'V > 0', negative: 'V < 0' },
  // Drawn on the tension side, so the geometry and the sign are worth stating
  // together: a positive value sits below a left-to-right beam.
  moment: { positive: 'M > 0 (tracción abajo)', negative: 'M < 0 (tracción arriba)' },
};
