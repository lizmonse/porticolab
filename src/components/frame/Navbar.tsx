/**
 * Application top bar: identity on the left, the two model-reset controls
 * pushed to the far right.
 *
 * The unit system does NOT live here. It used to, and it read as a third
 * control that happened not to respond to clicks; it now sits above the tables
 * whose columns it describes, which is the only place it is actually needed.
 * See `UnitsStrip`.
 *
 * What the bar does carry is the pair that empties or restores the model. They
 * are the two things a user reaches for between problems rather than within
 * one, so they belong to the page frame rather than to any panel inside it —
 * and being in the frame is what keeps them one click away from anywhere in a
 * long, scrolling column.
 *
 * Their appearance is not this file's business: `ModelResetControls` owns it,
 * and the two of them are deliberately not `Button`s. See that component.
 */

import { ModelResetControls } from './ModelResetControls';
import { StructureIcon } from '../ui/icons';

export interface NavbarProps {
  /** Restores the worked example, discarding whatever the user has typed. */
  onRestoreExample(): void;
  /** Empties the model entirely. */
  onReset(): void;
}

export function Navbar({ onRestoreExample, onReset }: NavbarProps) {
  return (
    <header className="chrome-bar border-line-strong sticky top-0 z-30 border-b">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6 sm:py-3.5">
        <a href="/" className="group flex min-w-0 items-center gap-3">
          <span className="bg-accent border-ink flex size-9 shrink-0 items-center justify-center border text-white transition-transform duration-200 group-hover:-translate-x-px group-hover:-translate-y-px">
            <StructureIcon className="size-5" />
          </span>
          <span className="font-display text-ink truncate text-base font-bold tracking-tight sm:text-lg">
            Pórticos 2D
          </span>
        </a>

        <p className="text-ink-faint hidden text-sm lg:block">
          Pórticos planos por el Método de la Rigidez Directa
        </p>

        {/*
          `ModelResetControls` brings its own `ml-auto`, so it takes the far
          right of this row without this file deciding anything about it. That
          is the point of the split: the bar owns placement, the component owns
          appearance, and moving it again touches one line.

          The row already wraps. On a narrow viewport the pair drops onto its
          own line under the title rather than crushing it, which is why the
          gap is declared on both axes.
        */}
        <ModelResetControls onRestoreExample={onRestoreExample} onReset={onReset} />
      </div>
    </header>
  );
}
