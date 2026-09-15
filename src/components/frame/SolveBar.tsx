/**
 * The solve action and the honesty line that goes with it.
 *
 * Once results stop following every keystroke, the interface owes the user two
 * things it did not owe before: a way to ask for the calculation, and a
 * permanent answer to "does what I am reading still describe what I typed?".
 * Both live here, together, because they are the same question — separating
 * the button from the status would let the user act on one while reading the
 * other.
 *
 * It sits at the top of the results column rather than in the top bar: it is
 * the heading of the results, not a global utility, and placing it above them
 * means the status is read before the numbers it qualifies, never after.
 */

import { useEffect } from 'react';

import { Button } from '../ui/Button';
import { CheckIcon, InfoIcon, PrintIcon, SolveIcon, WarningIcon } from '../ui/icons';
import type { SolverState } from '../../hooks/useFrameSolver';

export interface SolveBarProps {
  state: SolverState;
  /** True when the model has changed since the results on screen were produced. */
  isOutdated: boolean;
  onSolve(): void;
}

export function SolveBar({ state, isOutdated, onSolve }: SolveBarProps) {
  // Ctrl/Cmd+Enter, the convention in every tool where a calculation is
  // requested rather than continuous. Bound to the window, not to a field, so
  // it works from wherever the user finished typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSolve();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onSolve]);

  const status = describeStatus(state, isOutdated);
  const style = TONE_STYLES[status.tone];

  /**
   * A report can only be exported from results that are current.
   *
   * This is the one place in the interface where disabling a control is the
   * right call. Everywhere else a greyed-out button reads as "something is
   * broken" — but a PDF leaves the application. It gets filed, printed and
   * handed in, and by then nothing on it says the drawing came from one
   * structure and the tables from another. A button that is briefly
   * unavailable is a far smaller cost than a document that is quietly wrong.
   */
  const canExport = state.status === 'solved' && !isOutdated;

  return (
    /*
      A toolbar, not a card.

      This used to be a full `Card`: ink border, offset shadow, tinted surface
      — the same chrome the three input tables below it wear. Stacked directly
      on top of them it read as a fourth table rather than as the controls FOR
      them, and four identical boxes in a column give the eye nowhere to start.

      So the box goes and the hierarchy comes from position and weight instead:
      a status line, a rule, and the two actions. The column now opens with
      something that is plainly a header rather than plainly another panel.

      `shrink-0` stays, and still matters. The column carries `max-h` and its
      own scrollbar, and a flex item's automatic minimum size is disabled the
      moment its overflow is anything but visible — which is how this block was
      once compressed to 2.5px with its buttons spilling out invisibly.
    */
    <div className="shrink-0 print:hidden">
      {/*
        `role="status"` rather than `alert`: the status changes on every
        keystroke that dirties the model, and an assertive live region would
        interrupt a screen-reader user mid-word, over and over.

        The tone used to tint the whole card. It now rides a 4px bar down the
        left edge — louder per pixel, and it leaves the surface neutral so the
        buttons underneath keep the only filled colour in the block.
      */}
      <div
        role="status"
        className={`flex items-start gap-4 border-l-4 bg-surface-raised py-4 pr-5 pl-4 ${style.accent}`}
      >
        <span
          // Square, where this was a disc. The outline is the `ring-1` each
          // tone already carried — with the radius gone it draws a box, so no
          // border of its own is needed and adding one would double the edge.
          className={`flex size-10 shrink-0 items-center justify-center ${style.glyph}`}
        >
          <status.Glyph className="size-5" />
        </span>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className={`font-display text-sm font-semibold ${style.title}`}>{status.label}</p>
          <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">{status.detail}</p>
        </div>
      </div>

      {/*
        The actions, on their own line under a rule.

        Side by side with the status they were competing with it for the same
        row, and on a narrow column they wrapped into a ragged three-line
        block. Given a line of their own they read as what they are: the two
        things this panel does.
      */}
      <div className="border-line-strong mt-5 flex flex-wrap items-center gap-3 border-t pt-5">
        <kbd className="border-line-strong text-ink-faint bg-sunken rounded-inset hidden shrink-0 border px-2.5 py-1.5 font-mono text-xs font-medium lg:inline-block">
          Ctrl + ↵
        </kbd>

        {/*
          Secondary, and to the left of the primary action: exporting is
          what you do *after* solving, and a second filled control beside
          «Resolver estructura» would split the one action the page is for.
        */}
        <Button
          variant="secondary"
          size="lg"
          onClick={() => window.print()}
          disabled={!canExport}
          title={
            canExport
              ? undefined
              : 'Resuelve la estructura para exportar la memoria de cálculo.'
          }
        >
          <PrintIcon className="size-5" />
          <span className="hidden sm:inline">Exportar Reporte PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>

        {/*
          Never disabled, not even when the results are already current.
          Solving again is harmless and instantaneous, while a greyed-out
          primary action reads as "something is wrong" and sends the user
          hunting for what they broke.

          `flex-1` is what makes it the focus. Both buttons at their natural
          width read as a pair of equals; letting this one take the rest of the
          row makes the primary action the widest target on the panel, which is
          the one place in this interface where that is the right answer.
        */}
        <Button variant="primary" size="lg" onClick={onSolve} className="flex-1">
          <SolveIcon className="size-5" />
          Resolver estructura
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type StatusTone = 'fresh' | 'stale' | 'idle' | 'incomplete' | 'error';

/**
 * How each tone paints itself.
 *
 * `accent` is the 4px bar down the left edge of the status line, and it
 * replaced a tint over the whole card. The bar carries the same information in
 * a tenth of the area, which is what lets the surface stay neutral — and a
 * neutral surface is what keeps the primary button the only filled colour in
 * the panel.
 *
 * Only the two states the user must not read past — stale results and a failed
 * solve — get a loud bar. The rest stay quiet, so the warning keeps its weight
 * by being rare.
 */
const TONE_STYLES: Record<StatusTone, { accent: string; glyph: string; title: string }> = {
  fresh: {
    accent: 'border-ok',
    glyph: 'bg-ok/15 text-ok ring-1 ring-ok',
    title: 'text-ok',
  },
  stale: {
    accent: 'border-warn',
    glyph: 'bg-warn/15 text-warn ring-1 ring-warn',
    title: 'text-warn',
  },
  idle: {
    accent: 'border-line-strong',
    glyph: 'bg-ink-faint/12 text-ink-muted ring-1 ring-line-strong',
    title: 'text-ink',
  },
  incomplete: {
    accent: 'border-accent',
    glyph: 'bg-accent/15 text-accent-ink ring-1 ring-accent',
    title: 'text-accent-ink',
  },
  error: {
    accent: 'border-danger',
    glyph: 'bg-danger/15 text-danger ring-1 ring-danger',
    title: 'text-danger',
  },
};

interface StatusDescription {
  tone: StatusTone;
  label: string;
  detail: string;
  Glyph: typeof InfoIcon;
}

/**
 * Turns the solver state into the one sentence the user needs.
 *
 * Staleness is checked before anything else: an outdated error is still
 * outdated, and reporting the error as current would send the user to fix a
 * structure they have already changed.
 */
function describeStatus(state: SolverState, isOutdated: boolean): StatusDescription {
  if (state.status === 'idle') {
    return {
      tone: 'idle',
      label: 'Sin resolver',
      detail: 'Define la estructura y pulsa «Resolver estructura» para calcularla.',
      Glyph: SolveIcon,
    };
  }

  if (isOutdated) {
    return {
      tone: 'stale',
      label: 'Hay cambios sin resolver',
      detail:
        'Has modificado el modelo desde el último cálculo. Los resultados de abajo corresponden a la versión anterior.',
      Glyph: WarningIcon,
    };
  }

  switch (state.status) {
    case 'incomplete':
      return {
        tone: 'incomplete',
        label: 'Modelo incompleto',
        detail: state.reason,
        Glyph: InfoIcon,
      };
    case 'error':
      return {
        tone: 'error',
        label: state.error.title,
        detail: state.error.detail,
        Glyph: WarningIcon,
      };
    case 'solved':
      return {
        tone: 'fresh',
        label: 'Resultados al día',
        detail: 'Los resultados mostrados corresponden exactamente al modelo actual.',
        Glyph: CheckIcon,
      };
  }
}
