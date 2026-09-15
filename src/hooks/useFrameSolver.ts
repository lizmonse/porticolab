/**
 * Runs the engine on demand, not on every keystroke.
 *
 * The solve is triggered by an explicit user action. That is the convention in
 * analysis software, and it keeps the results stable while a model is being
 * typed: a half-edited frame produces half-meaningful numbers, and watching
 * them flicker through intermediate states is worse than not showing them.
 *
 * Staleness is derived from reference identity, not from a boolean flag.
 * `useFrameModel` returns a brand-new model object on every mutation, so
 * `solved.model !== model` is exactly "the model changed since the last
 * solve". A flag would have to be set in every mutating path and would drift
 * the first time one was missed. It also behaves correctly on the way back:
 * reloading the same example object the results were computed from leaves the
 * results valid, because the reference matches.
 */

import { useCallback, useState } from 'react';

import { solveFrame } from '../lib/frame';
import { FrameError } from '../lib/frame/errors';
import type { FrameModel, FrameSolution } from '../types/frame';
import type { TranslatedError } from '../utils/error-translations';
import { translateError } from '../utils/error-translations';

/** Outcome of a solve attempt. */
export type SolverState =
  /** Nothing has been solved yet. */
  | { readonly status: 'idle' }
  /** Not enough data to solve. Not a failure. */
  | { readonly status: 'incomplete'; readonly reason: string }
  /** Solved successfully. */
  | { readonly status: 'solved'; readonly solution: FrameSolution }
  /** The model is complete but cannot be solved. */
  | { readonly status: 'error'; readonly error: TranslatedError };

export interface FrameSolverController {
  /** The result of the last solve, never recomputed on its own. */
  readonly state: SolverState;
  /**
   * The model `state` describes, which is *not* the live model once the user
   * starts editing. Views that pair the solution with model data — element
   * sections, node labels, the matrix walkthrough — must read from this one,
   * or they will caption last solve's matrices with this minute's geometry.
   */
  readonly solvedModel: FrameModel;
  /**
   * True when the model has been edited since the last solve, so whatever is
   * in `state` describes a structure the user is no longer looking at.
   */
  readonly isOutdated: boolean;
  /** Runs the engine against the current model. */
  solve(): void;
}

export function useFrameSolver(model: FrameModel): FrameSolverController {
  /**
   * Solved once during the initial render, in the lazy initialiser rather
   * than in an effect.
   *
   * The application opens on a preloaded, validated example, and asking the
   * user to press a button to see results for a model they did not type is
   * friction with nothing behind it. This is not reactive solving: it happens
   * exactly once, and no later input change triggers another.
   */
  const [solved, setSolved] = useState<{ model: FrameModel; state: SolverState }>(() => ({
    model,
    state: solveModel(model),
  }));

  const solve = useCallback(() => {
    setSolved({ model, state: solveModel(model) });
  }, [model]);

  return {
    state: solved.state,
    solvedModel: solved.model,
    isOutdated: solved.model !== model,
    solve,
  };
}

/** Pure solve wrapper, exported so it can be unit-tested without React. */
export function solveModel(model: FrameModel): SolverState {
  const incompleteReason = describeIncompleteness(model);
  if (incompleteReason !== null) {
    return { status: 'incomplete', reason: incompleteReason };
  }

  try {
    return { status: 'solved', solution: solveFrame(model) };
  } catch (error) {
    if (error instanceof FrameError) {
      return { status: 'error', error: translateError(error) };
    }
    // Anything that is not a FrameError is a genuine bug, not bad user input.
    // Surface it rather than swallowing it into a friendly banner.
    throw error;
  }
}

/**
 * Describes why a model cannot be solved yet, or null when it is ready.
 *
 * Only covers the "still being built" cases. Genuine modelling mistakes, such
 * as an unstable structure, are the engine's job to detect.
 */
function describeIncompleteness(model: FrameModel): string | null {
  if (model.nodes.length === 0) return 'Añade nodos para empezar a definir el pórtico.';
  if (model.nodes.length < 2) return 'Añade al menos dos nodos para poder conectar una barra.';
  if (model.elements.length === 0) return 'Conecta los nodos con al menos una barra.';
  if (model.supports.length === 0) return 'Define los apoyos de la estructura.';
  return null;
}
