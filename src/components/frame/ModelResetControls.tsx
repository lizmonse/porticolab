/**
 * The two ways out of a half-typed structure: restore the worked example, or
 * clear the model and start from nothing.
 *
 * ---------------------------------------------------------------------------
 * Where they sit
 * ---------------------------------------------------------------------------
 * The far right of the top bar, and the component brings its own `ml-auto` so
 * that is true of whatever flex row it is dropped into. `Navbar` decides the
 * row; this file decides everything else.
 *
 * The placement went through the foot of the input column on the way here, on
 * the argument that a control acting on the MODEL belongs with the tables
 * rather than in the page chrome. That argument was half right. It was wrong
 * about distance being safety: clearing a model to start the next problem is
 * something an engineer does constantly, and three tables of scrolling taxes
 * the common case to guard against the rare one. Safety is carried by the
 * styling below instead, which costs nothing per use.
 *
 * ---------------------------------------------------------------------------
 * Why neither of them is a `Button`
 * ---------------------------------------------------------------------------
 * They are plain `<button>` elements with their own classes, and that is the
 * whole design. The `Button` primitive carries the interface's one idiom — a
 * filled or outlined box with a hard offset shadow and the `u-btn` press — and
 * anything wearing it reads as "an action you take". These two are not that.
 * One is an escape hatch and the other is a demolition, and neither should
 * look like «Resolver estructura» wearing a different colour.
 *
 * They speak two idioms that are not the button idiom, and deliberately not
 * the same one as each other:
 *
 *   Restablecer   a technical text link. Underlined, no box at all. It reads
 *                 as navigation — "take me back to where I started" — which is
 *                 what it does.
 *   Limpiar       a dashed outline with no fill. That is the notation of a cut
 *                 line or a demolition boundary on a drawing, not of a
 *                 control, and it is the reason this was chosen over a red
 *                 ghost button: a red ghost button is still a button.
 *
 * Dropping the primitive costs nothing in accessibility. The focus ring is
 * declared in `global.css` for every `button` at zero specificity, so both
 * still take the accent outline on keyboard arrival without asking.
 *
 * The warning sentence that used to sit above them is gone with the panel that
 * held it; both controls carry it as a `title` instead. A tooltip is a weaker
 * guard than a printed line, which is the price of having them in reach — and
 * the dashed red outline says the same thing without waiting to be hovered.
 */

import { RestoreIcon, TrashIcon } from '../ui/icons';

export interface ModelResetControlsProps {
  /** Restores the worked example, discarding whatever the user has typed. */
  onRestoreExample(): void;
  /** Empties the model entirely. */
  onReset(): void;
}

export function ModelResetControls({ onRestoreExample, onReset }: ModelResetControlsProps) {
  return (
    // `ml-auto` on the group, not on either control: it pushes the pair to the
    // far edge of whatever row it lands in while keeping the two together — so
    // the bar it sits in never has to know they are there.
    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-x-5 gap-y-3">
      <button
        type="button"
        onClick={onRestoreExample}
        title="Vuelve al pórtico de ejemplo con el que abre la calculadora."
        className="text-ink-muted decoration-line-strong hover:text-ink hover:decoration-ink inline-flex items-center gap-2 text-sm font-semibold underline decoration-2 underline-offset-4 transition-colors"
      >
        <RestoreIcon className="size-4" />
        Restablecer ejemplo
      </button>

      {/*
        Dashed at rest, SOLID on hover. The transition is the point: the
        boundary is provisional until you commit to it, and it firms up under
        the cursor a moment before the click lands. It is the only place in the
        application where a border changes style rather than colour.
      */}
      <button
        type="button"
        onClick={onReset}
        title="Deja el modelo vacío: sin nodos, sin barras y sin cargas."
        className="border-danger text-danger hover:bg-danger/10 hover:border-solid active:bg-danger/20 inline-flex items-center gap-2 border-2 border-dashed bg-transparent px-3 py-1.5 text-[11px] font-bold tracking-[0.18em] uppercase transition-colors"
      >
        <TrashIcon className="size-3.5" />
        Limpiar todo
      </button>
    </div>
  );
}
