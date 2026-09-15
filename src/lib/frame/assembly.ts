/**
 * Assembly of the 3n x 3n global stiffness matrix.
 *
 * The scatter is driven by the DOF vector produced by `dof.ts`: entry k[a][b]
 * of a 6x6 element matrix is added to K[dofs[a]][dofs[b]] of the global one.
 * Writing the thirty-six statements out by hand, as the textbook MATLAB
 * routines do, is where the stride change from 2 to 3 would go wrong.
 */

import type {
  DistributedLoad,
  ElementDofs,
  ElementGeometry,
  FrameElement,
  FrameModel,
  FrameNode,
  LocalSpanLoad,
  Matrix6,
  Vec6,
} from '../../types/frame';
import type { DofMap } from './dof';
import { createDofMap } from './dof';
import {
  elementStiffnessFromGeometry,
  elementTransformationFromGeometry,
  equivalentNodalLoads,
  fixedEndForces,
  localStiffness,
  resolveSpanLoad,
} from './element';
import { FrameError } from './errors';
import { elementGeometry } from './geometry';

/** Rows and columns of a plane frame element matrix. */
const ELEMENT_SIZE = 6;

/** A square matrix of zeros, mutable while it is being assembled. */
export function zeroMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array<number>(size).fill(0));
}

/**
 * Scatters a 6x6 element stiffness matrix into the global matrix, in place.
 *
 * Both indices are bounds-checked, not just the row. Writing past the end of a
 * row is not an error in JavaScript: `row[99] += x` reads `undefined`, yields
 * NaN, and silently extends the array. The matrix would then carry a NaN that
 * propagates through the whole solve and surfaces as an unsolvable system with
 * no indication of where it came from. Checking the column costs one
 * comparison per term and turns that into a named error.
 */
export function scatterElementStiffness(
  K: number[][],
  k: Matrix6,
  dofs: ElementDofs,
): void {
  const size = K.length;

  const requireInRange = (dof: number): void => {
    if (!Number.isInteger(dof) || dof < 0 || dof >= size) {
      throw new FrameError(
        'UNKNOWN_NODE',
        `Degree of freedom ${dof} is outside the global matrix of size ${size}.`,
      );
    }
  };

  for (const dof of dofs) requireInRange(dof);

  for (let a = 0; a < ELEMENT_SIZE; a++) {
    const row = K[dofs[a]!]!;
    for (let b = 0; b < ELEMENT_SIZE; b++) {
      const column = dofs[b]!;
      row[column] = (row[column] as number) + (k[a] as readonly number[])[b]!;
    }
  }
}

/**
 * Adds one element's contribution to a copy of K, without mutating it.
 *
 * The non-mutating counterpart of `scatterElementStiffness`, kept for the
 * step-by-step matrix viewer, which shows K growing one element at a time,
 * and for parity tests against the textbook routine.
 *
 * @param i One-based number of node i.
 * @param j One-based number of node j.
 */
export function planeFrameAssemble(
  K: readonly (readonly number[])[],
  k: Matrix6,
  i: number,
  j: number,
): number[][] {
  const result = K.map((row) => [...row]);
  scatterElementStiffness(result, k, [
    3 * i - 3,
    3 * i - 2,
    3 * i - 1,
    3 * j - 3,
    3 * j - 2,
    3 * j - 1,
  ]);
  return result;
}

/**
 * Everything that was derived for one element while assembling.
 *
 * The three matrices are kept rather than discarded because the interface
 * shows the method in the order it is taught — local matrix, transformation,
 * global matrix, assembly — and handing back the very matrices that were
 * assembled is what guarantees the viewer and the solver agree. Recomputing
 * them in the UI would open a second path that can drift.
 */
export interface AssembledElement {
  readonly elementId: number;
  readonly geometry: ElementGeometry;
  readonly localStiffness: Matrix6;
  readonly transformation: Matrix6;
  /** k in global coordinates: the matrix that was actually scattered into K. */
  readonly globalStiffness: Matrix6;
  /** The six global DOFs it was scattered into. */
  readonly dofs: ElementDofs;
  /**
   * The member's span load in local axes, or null when it carries none.
   *
   * The next three fields are computed here rather than by their consumers
   * for the same reason the geometry is: `T` lives here, both the load vector
   * and the end-force recovery need the results, and deriving them twice is
   * how the two halves of a superposition drift apart by a sign.
   */
  readonly spanLoad: LocalSpanLoad | null;
  /** Fixed-end forces in LOCAL axes. Added back during recovery. */
  readonly fixedEndForces: Vec6;
  /** `-T^T * f_FEM` in GLOBAL axes. Scattered into the load vector. */
  readonly equivalentNodalLoads: Vec6;
}

/** The global system produced by assembling every element of a model. */
export interface AssembledSystem {
  /** Global stiffness matrix K, of size 3n x 3n. */
  readonly globalStiffness: readonly (readonly number[])[];
  /** DOF mapping used during assembly, reused downstream by the solver. */
  readonly dofMap: DofMap;
  /** Per-element derived data, keyed by element id. */
  readonly elements: ReadonlyMap<number, AssembledElement>;
}

/**
 * Assembles the global stiffness matrix for a whole model.
 *
 * Element geometries are computed once here and carried through to
 * post-processing, so lengths and direction cosines are never recomputed from
 * coordinates twice (and cannot drift between the two passes).
 *
 * @throws FrameError when the model references unknown nodes, has duplicate
 * node identifiers, or contains a zero-length element.
 */
export function assembleGlobalStiffness(model: FrameModel): AssembledSystem {
  const dofMap = createDofMap(model.nodes);
  const nodeById = new Map<number, FrameNode>(model.nodes.map((node) => [node.id, node]));

  const K = zeroMatrix(dofMap.size);
  const elements = new Map<number, AssembledElement>();
  const spanLoadsByElement = groupSpanLoads(model.distributedLoads);

  for (const element of model.elements) {
    const geometry = resolveGeometry(element, nodeById);
    const dofs = dofMap.elementDofs(element.from, element.to);
    const globalStiffness = elementStiffnessFromGeometry(
      element.E,
      element.A,
      element.I,
      geometry,
    );
    const transformation = elementTransformationFromGeometry(geometry);

    const spanLoad = resolveSpanLoad(spanLoadsByElement.get(element.id) ?? [], geometry);
    const fixedEnd = fixedEndForces(spanLoad, geometry.length);

    elements.set(element.id, {
      elementId: element.id,
      geometry,
      localStiffness: localStiffness(element.E, element.A, element.I, geometry.length),
      transformation,
      globalStiffness,
      dofs,
      spanLoad,
      fixedEndForces: fixedEnd,
      equivalentNodalLoads: equivalentNodalLoads(fixedEnd, transformation),
    });

    scatterElementStiffness(K, globalStiffness, dofs);
  }

  return { globalStiffness: K, dofMap, elements };
}

/**
 * Buckets span loads by the element they act on.
 *
 * Loads on the same member accumulate rather than replace one another, which
 * is what lets the interface hold them as separate rows and lets a trapezoid
 * be written as a rectangle plus a triangle if the user prefers.
 */
function groupSpanLoads(
  loads: readonly DistributedLoad[] | undefined,
): ReadonlyMap<number, DistributedLoad[]> {
  const byElement = new Map<number, DistributedLoad[]>();
  if (loads === undefined) return byElement;

  for (const load of loads) {
    const bucket = byElement.get(load.element);
    if (bucket === undefined) byElement.set(load.element, [load]);
    else bucket.push(load);
  }

  return byElement;
}

/** Looks up an element's end nodes and derives its geometry. */
function resolveGeometry(
  element: FrameElement,
  nodeById: ReadonlyMap<number, FrameNode>,
): ElementGeometry {
  const from = nodeById.get(element.from);
  const to = nodeById.get(element.to);

  if (from === undefined) {
    throw new FrameError(
      'UNKNOWN_NODE',
      `Element ${element.id} references node ${element.from}, which does not exist.`,
    );
  }
  if (to === undefined) {
    throw new FrameError(
      'UNKNOWN_NODE',
      `Element ${element.id} references node ${element.to}, which does not exist.`,
    );
  }

  return elementGeometry(from, to);
}
