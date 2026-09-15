/**
 * Boundary conditions and solution of the global system.
 *
 * The partition is derived automatically from the support definitions, and
 * the reduced system is solved with an LU factorization from mathjs.
 *
 * Given the partition into free (f) and restrained (r) DOFs:
 *
 *     | K_ff  K_fr | | U_f |   | F_f |
 *     |            | |     | = |     |
 *     | K_rf  K_rr | | U_r |   | F_r |
 *
 * the top row gives the system actually solved:
 *
 *     K_ff * U_f = F_f - K_fr * U_r
 *
 * The K_fr * U_r term vanishes for ordinary supports (U_r = 0) and only
 * matters when a settlement or an imposed rotation is prescribed.
 *
 * Nothing here is specific to the number of DOFs per node: the partition
 * works off the DOF map. What a frame adds is a third restraint flag,
 * `restrainRz`, and a third load component, `mz`.
 */

import { lup, lusolve } from 'mathjs';

import type { DofIndex, FrameModel, Matrix } from '../../types/frame';
import type { AssembledElement } from './assembly';
import type { DofMap } from './dof';
import { FrameError } from './errors';

/**
 * Relative pivot threshold below which the reduced matrix is treated as
 * singular.
 *
 * This check is not optional. mathjs `lusolve` does NOT raise on a singular
 * matrix: given [[1,2],[2,4]] it returns a value with no warning. Without
 * inspecting the pivots, a mechanism (a frame with too few supports, or one
 * where a chain of pinned joints leaves a rotation unrestrained) would
 * silently produce plausible-looking but meaningless displacements. The LU
 * factorization leaves a zero, or near-zero, pivot on the diagonal of U in
 * exactly that case.
 *
 * Double precision has an epsilon of 2.2e-16; a pivot ratio below 1e-12
 * means genuine rank deficiency, not accumulated rounding error.
 */
const SINGULARITY_TOLERANCE = 1e-12;

/** Split of the global DOFs into free and restrained, plus prescribed values. */
export interface DofPartition {
  /** DOFs whose displacement is unknown and must be solved for. */
  readonly free: readonly DofIndex[];
  /** DOFs whose displacement is prescribed by a support. */
  readonly restrained: readonly DofIndex[];
  /**
   * Prescribed value at every DOF, length 3n. Zero everywhere except at
   * restrained DOFs that declare a settlement or an imposed rotation.
   */
  readonly prescribed: readonly number[];
}

/**
 * Builds the global load vector F, of length 3n, from the model's loads.
 *
 * Loads on the same node accumulate rather than overwrite, so the UI can hold
 * several load cases as separate rows.
 *
 * Span loads enter here too, as the equivalent nodal loads computed during
 * assembly. This is the step that makes `K * D = Q` able to see a load applied
 * between two joints at all: the system only knows nodal degrees of freedom,
 * so a member load has to be replaced by the nodal actions that produce the
 * same deformation of the frame.
 *
 * @param assembled Per-element data from assembly, carrying each member's
 * equivalent nodal loads. Required whenever the model declares span loads —
 * omitting it there would silently drop them, so it throws instead.
 */
export function buildLoadVector(
  model: FrameModel,
  dofMap: DofMap,
  assembled?: ReadonlyMap<number, AssembledElement>,
): number[] {
  const F = new Array<number>(dofMap.size).fill(0);

  for (const load of model.loads) {
    const [dofX, dofY, dofRz] = dofMap.nodeDofs(load.node);
    F[dofX] = (F[dofX] as number) + load.fx;
    F[dofY] = (F[dofY] as number) + load.fy;
    F[dofRz] = (F[dofRz] as number) + load.mz;
  }

  const spanLoads = model.distributedLoads ?? [];
  if (spanLoads.length === 0) return F;

  if (assembled === undefined) {
    throw new FrameError(
      'UNSUPPORTED_FEATURE',
      'The model declares distributed loads, so buildLoadVector needs the assembled elements to convert them into equivalent nodal loads.',
    );
  }

  for (const parts of assembled.values()) {
    const { dofs, equivalentNodalLoads: q } = parts;
    for (let index = 0; index < dofs.length; index++) {
      const dof = dofs[index] as number;
      F[dof] = (F[dof] as number) + (q[index] as number);
    }
  }

  return F;
}

/**
 * Derives the free/restrained partition from the model's supports.
 *
 * @throws FrameError NO_SUPPORTS when no DOF is restrained, since the
 * structure would then be free to translate and rotate as a rigid body.
 * @throws FrameError UNSUPPORTED_FEATURE when a support declares an
 * inclination, which is not implemented yet.
 */
export function partitionDofs(model: FrameModel, dofMap: DofMap): DofPartition {
  const isRestrained = new Array<boolean>(dofMap.size).fill(false);
  const prescribed = new Array<number>(dofMap.size).fill(0);

  for (const support of model.supports) {
    // TODO(inclined-supports): implement the K_new = T * K_old * T^T
    // treatment. Until then the model is rejected rather than solved with the
    // inclination silently ignored, which would return wrong reactions with
    // no indication of the problem.
    if (support.inclinationDeg !== undefined) {
      throw new FrameError(
        'UNSUPPORTED_FEATURE',
        `Node ${support.node} declares an inclined support (${support.inclinationDeg} deg). ` +
          'Inclined supports are not implemented yet.',
      );
    }

    const [dofX, dofY, dofRz] = dofMap.nodeDofs(support.node);

    if (support.restrainX) {
      isRestrained[dofX] = true;
      prescribed[dofX] = support.settlement?.dx ?? 0;
    }
    if (support.restrainY) {
      isRestrained[dofY] = true;
      prescribed[dofY] = support.settlement?.dy ?? 0;
    }
    if (support.restrainRz) {
      isRestrained[dofRz] = true;
      prescribed[dofRz] = support.settlement?.rz ?? 0;
    }
  }

  const free: DofIndex[] = [];
  const restrained: DofIndex[] = [];

  isRestrained.forEach((restricted, dof) => {
    (restricted ? restrained : free).push(dof);
  });

  if (restrained.length === 0) {
    throw new FrameError(
      'NO_SUPPORTS',
      'The model has no restrained degrees of freedom: the structure would move as a rigid body.',
    );
  }

  return { free, restrained, prescribed };
}

/** Extracts the submatrix K[rows][columns]. */
export function submatrix(
  K: Matrix,
  rows: readonly DofIndex[],
  columns: readonly DofIndex[],
): number[][] {
  return rows.map((row) => columns.map((column) => (K[row] as readonly number[])[column]!));
}

/** Multiplies a matrix by a vector. */
export function multiplyMatrixVector(K: Matrix, v: readonly number[]): number[] {
  return K.map((row) => row.reduce((sum, value, column) => sum + value * (v[column] as number), 0));
}

/**
 * Solves A * x = b by LU factorization, refusing to answer when A is singular.
 *
 * @throws FrameError SINGULAR_STIFFNESS when the factorization exposes a
 * negligible pivot, or when the result is not finite.
 */
export function solveLinearSystem(A: readonly (readonly number[])[], b: readonly number[]): number[] {
  if (A.length === 0) return [];

  const matrix = A.map((row) => [...row]);

  let decomposition: { U: unknown };
  try {
    decomposition = lup(matrix) as { U: unknown };
  } catch (error) {
    throw new FrameError(
      'SINGULAR_STIFFNESS',
      `The reduced stiffness matrix could not be factorized: ${(error as Error).message}`,
    );
  }

  assertNonSingular(decomposition.U);

  const solution = lusolve(decomposition as never, [...b]) as unknown as {
    toArray?: () => number[][];
  };
  const rows = typeof solution.toArray === 'function'
    ? solution.toArray()
    : (solution as unknown as number[][]);

  const x = rows.map((row) => (Array.isArray(row) ? (row[0] as number) : (row as number)));

  if (!x.every(Number.isFinite)) {
    throw new FrameError(
      'SINGULAR_STIFFNESS',
      'The solution of the reduced system is not finite: the structure is unstable.',
    );
  }

  return x;
}

/** Rejects a factorization whose smallest pivot is negligible. */
function assertNonSingular(U: unknown): void {
  const rows = toRows(U);

  let largest = 0;
  let smallest = Number.POSITIVE_INFINITY;

  rows.forEach((row, index) => {
    const pivot = Math.abs(row[index] ?? 0);
    if (pivot > largest) largest = pivot;
    if (pivot < smallest) smallest = pivot;
  });

  if (largest === 0 || smallest / largest < SINGULARITY_TOLERANCE) {
    throw new FrameError(
      'SINGULAR_STIFFNESS',
      'The reduced stiffness matrix is singular: the structure is a mechanism. ' +
        'Check that the supports are sufficient.',
    );
  }
}

/** Normalizes the U factor of a mathjs LU decomposition to plain rows. */
function toRows(U: unknown): number[][] {
  if (Array.isArray(U)) return U as number[][];
  const dense = U as { toArray?: () => number[][] };
  if (typeof dense.toArray === 'function') return dense.toArray();
  throw new FrameError(
    'SINGULAR_STIFFNESS',
    'The LU factorization returned an unrecognized representation.',
  );
}

/** What solving the reduced system produced. */
export interface DisplacementSolution {
  /** Global displacement vector U, of length 3n. */
  readonly displacements: number[];
  /**
   * K_ff, the submatrix that was actually factorized.
   *
   * Returned rather than discarded so the interface can show the reduced
   * system the method is built on. Its rows and columns follow
   * partition.free.
   */
  readonly reducedStiffness: number[][];
}

/**
 * Solves for the global displacement vector U, of length 3n.
 *
 * Restrained DOFs keep their prescribed value; free DOFs come from solving
 * the reduced system.
 */
export function solveDisplacements(
  globalStiffness: Matrix,
  loadVector: readonly number[],
  partition: DofPartition,
): DisplacementSolution {
  const { free, restrained, prescribed } = partition;

  const Kff = submatrix(globalStiffness, free, free);
  const Kfr = submatrix(globalStiffness, free, restrained);
  const Ur = restrained.map((dof) => prescribed[dof] as number);

  // F_f - K_fr * U_r. The second term is zero unless a settlement or an
  // imposed rotation is prescribed.
  const settlementForces = multiplyMatrixVector(Kfr, Ur);
  const Ff = free.map((dof, index) => (loadVector[dof] as number) - (settlementForces[index] as number));

  const Uf = solveLinearSystem(Kff, Ff);

  const U = [...prescribed];
  free.forEach((dof, index) => {
    U[dof] = Uf[index] as number;
  });

  return { displacements: U, reducedStiffness: Kff };
}
