/**
 * Post-processing: reactions, nodal displacements and per-element results.
 *
 * Build the global displacement vector U, compute F = K*U to obtain the
 * reactions, then slice U per element to obtain the end forces.
 *
 * This is where a frame diverges most from a truss. A truss bar's entire
 * internal state is one number, the axial force. A frame member's is six —
 * axial, shear and bending moment at each end — and they are only meaningful
 * in the member's own local axes, so they come from `element.ts` rather than
 * from a projection of the global displacements.
 */

import type {
  AxialState,
  DistributedLoad,
  DistributedLoadShape,
  DofDescriptor,
  ElementResult,
  FrameModel,
  InternalForces,
  Matrix,
  NodalDisplacement,
  NodalReaction,
  Vec6,
} from '../../types/frame';
import type { AssembledElement } from './assembly';
import type { DofMap } from './dof';
import { elementEndForcesFromGeometry } from './element';
import { FrameError } from './errors';
import type { DofPartition } from './solver';
import { multiplyMatrixVector } from './solver';

/**
 * Threshold below which an axial force counts as zero.
 *
 * A member carrying no axial force should be reported as such rather than as
 * a vanishingly small tension or compression whose sign is pure rounding
 * noise. The threshold is relative to the largest axial force in the
 * structure, so it carries over across unit systems.
 */
const ZERO_FORCE_RELATIVE_TOLERANCE = 1e-9;

/** Computes the global force vector F = K*U. */
export function computeGlobalForces(
  globalStiffness: Matrix,
  displacements: readonly number[],
): number[] {
  return multiplyMatrixVector(globalStiffness, displacements);
}

/**
 * Groups the reactions by node, reporting only restrained DOFs.
 *
 * The reaction is K*U MINUS whatever load was applied at that same DOF, not
 * K*U alone. The two agree only when nothing is applied directly at a
 * support, which was a safe assumption for the truss examples but is not one
 * for a frame: a moment applied at a fixed base, or a column load landing on
 * a support node, is ordinary modelling. Reporting K*U there would fold the
 * applied action into the reaction and break equilibrium in the results
 * table.
 *
 * A DOF that is free carries no reaction, so its component is reported as
 * zero rather than as the residual of the equilibrium equation.
 */
export function extractReactions(
  forces: readonly number[],
  loadVector: readonly number[],
  partition: DofPartition,
  dofMap: DofMap,
): NodalReaction[] {
  const restrained = new Set(partition.restrained);
  const byNode = new Map<number, { fx: number; fy: number; mz: number }>();

  for (const dof of partition.restrained) {
    const { node } = dofMap.describe(dof);
    if (!byNode.has(node)) byNode.set(node, { fx: 0, fy: 0, mz: 0 });
  }

  for (const [node, reaction] of byNode) {
    const [dofX, dofY, dofRz] = dofMap.nodeDofs(node);
    if (restrained.has(dofX)) reaction.fx = reactionAt(forces, loadVector, dofX);
    if (restrained.has(dofY)) reaction.fy = reactionAt(forces, loadVector, dofY);
    if (restrained.has(dofRz)) reaction.mz = reactionAt(forces, loadVector, dofRz);
  }

  return [...byNode.entries()].map(([node, reaction]) => ({ node, ...reaction }));
}

/** Reaction at a single restrained DOF: what K*U carries, less what was applied. */
function reactionAt(
  forces: readonly number[],
  loadVector: readonly number[],
  dof: number,
): number {
  return (forces[dof] as number) - (loadVector[dof] as number);
}

/** Groups the global displacement vector by node, for display. */
export function extractNodalDisplacements(
  displacements: readonly number[],
  model: FrameModel,
  dofMap: DofMap,
): NodalDisplacement[] {
  return model.nodes.map((node) => {
    const [dofX, dofY, dofRz] = dofMap.nodeDofs(node.id);
    return {
      node: node.id,
      ux: displacements[dofX] as number,
      uy: displacements[dofY] as number,
      rz: displacements[dofRz] as number,
    };
  });
}

/** Slices the 6 displacement components belonging to one element out of U. */
export function elementDisplacementVector(
  displacements: readonly number[],
  dofMap: DofMap,
  from: number,
  to: number,
): Vec6 {
  const dofs = dofMap.elementDofs(from, to);
  return [
    displacements[dofs[0]] as number,
    displacements[dofs[1]] as number,
    displacements[dofs[2]] as number,
    displacements[dofs[3]] as number,
    displacements[dofs[4]] as number,
    displacements[dofs[5]] as number,
  ];
}

/**
 * Computes end forces, axial stress and axial state for every element.
 *
 * @param assembled Per-element data produced during assembly, reused here so
 * that geometries and matrices cannot drift between the two passes.
 */
export function computeElementResults(
  model: FrameModel,
  displacements: readonly number[],
  dofMap: DofMap,
  assembled: ReadonlyMap<number, AssembledElement>,
): ElementResult[] {
  const raw = model.elements.map((element) => {
    const parts = assembled.get(element.id);
    if (parts === undefined) {
      throw new FrameError(
        'UNKNOWN_NODE',
        `Element ${element.id} was not assembled: no geometry or stiffness matrix is available.`,
      );
    }

    const u = elementDisplacementVector(displacements, dofMap, element.from, element.to);
    // The fixed-end vector is added inside: f_local = k*T*u + f_FEM. See the
    // note in `element.ts` for why leaving it out is invisible.
    const endForces = elementEndForcesFromGeometry(
      element.E,
      element.A,
      element.I,
      parts.geometry,
      u,
      parts.fixedEndForces,
    );

    return {
      elementId: element.id,
      geometry: parts.geometry,
      localStiffness: parts.localStiffness,
      transformation: parts.transformation,
      stiffness: parts.globalStiffness,
      endForces,
      spanLoad: parts.spanLoad,
      fixedEndForces: parts.fixedEndForces,
      // Axial part only: see the note on ElementResult.axialStress. Shear and
      // bending are handed over raw, in `endForces`, for the designer to
      // combine with a section modulus the model does not carry.
      axialStress: endForces.axialForce / element.A,
    };
  });

  const largestForce = raw.reduce(
    (max, result) => Math.max(max, Math.abs(result.endForces.axialForce)),
    0,
  );
  const zeroThreshold = largestForce * ZERO_FORCE_RELATIVE_TOLERANCE;

  return raw.map((result) => ({
    ...result,
    state: classifyAxialState(result.endForces.axialForce, zeroThreshold),
  }));
}

/** Maps the sign of an axial force to an axial state. */
export function classifyAxialState(axialForce: number, zeroThreshold: number): AxialState {
  if (Math.abs(axialForce) <= zeroThreshold) return 'zero';
  return axialForce > 0 ? 'tension' : 'compression';
}

// ---------------------------------------------------------------------------
// Internal forces along the member
// ---------------------------------------------------------------------------

/**
 * The internal actions at a station `x` measured from end i, in local axes.
 *
 * ---------------------------------------------------------------------------
 * Where these come from
 * ---------------------------------------------------------------------------
 * Cut the member at x and take equilibrium of the piece between end i and the
 * cut. What crosses the cut is the end action at i plus everything the span
 * load applied over the length already passed:
 *
 *     N(x) = -f[0] - ∫₀ˣ p(ξ) dξ
 *     V(x) =  f[1] + ∫₀ˣ q(ξ) dξ
 *     M(x) =  f[1]·x - f[2] + ∫₀ˣ (x - ξ)·q(ξ) dξ
 *
 * The minus on the axial integral is not a typo and is the one sign here that
 * differs from its neighbour. N is TENSION-positive, so the part beyond the
 * cut pulls the segment along +x, while V and M are defined from the actions
 * ON the segment. Axial equilibrium reads f[0] + ∫p + N(x) = 0, and the check
 * that pins it is x = L: it must reproduce f[3] exactly, which it does only
 * with the minus.
 *
 * with `f` the local end-force vector, `p` the axial intensity along local +x
 * and `q` the transverse intensity along local +y. Setting the integrals to
 * zero recovers the constant-N, constant-V, linear-M expressions the
 * load-free engine used, which is exactly what happens for a member with no
 * span load.
 *
 * ---------------------------------------------------------------------------
 * Why this is exact and not sampled
 * ---------------------------------------------------------------------------
 * `q` is linear by construction, so the integrals are polynomials evaluated in
 * closed form: V becomes quadratic and M cubic in the general trapezoidal
 * case, degenerating to linear V and quadratic M for a uniform load. There is
 * no numerical integration anywhere and no step size to choose. A caller that
 * wants a curve samples this function; the sampling density affects how smooth
 * the drawing looks and not how correct the values are.
 *
 * The one place density does matter is the peak: the extremum of M sits where
 * V crosses zero, which uniform sampling steps over. `shearZeroStations` finds
 * those abscissas so a caller can add them to its station list.
 */
export function internalForcesAt(result: ElementResult, x: number): InternalForces {
  const f = result.endForces.local;
  const load = result.spanLoad;

  if (load === null) {
    return {
      x,
      axial: -f[0],
      shear: f[1],
      moment: f[1] * x - f[2],
    };
  }

  const L = result.geometry.length;
  // Intensities at the cut, from the linear variation between the two ends.
  const s = L === 0 ? 0 : x / L;
  const { pI, pJ, qI, qJ } = load;

  // ∫₀ˣ p dξ for p linear from pI to pJ: x·(pI + p(x))/2, the trapezoid rule,
  // which is exact for a linear integrand.
  const pAtX = pI + (pJ - pI) * s;
  const axialFromLoad = (x * (pI + pAtX)) / 2;

  const qAtX = qI + (qJ - qI) * s;
  const shearFromLoad = (x * (qI + qAtX)) / 2;

  // ∫₀ˣ (x - ξ)·q(ξ) dξ with q linear. Splitting q into its uniform part qI
  // and its triangular part (qJ - qI)·ξ/L integrates to qI·x²/2 and
  // (qJ - qI)·x³/(6L).
  const slope = L === 0 ? 0 : (qJ - qI) / L;
  const momentFromLoad = (qI * x * x) / 2 + (slope * x * x * x) / 6;

  return {
    x,
    axial: -f[0] - axialFromLoad,
    shear: f[1] + shearFromLoad,
    moment: f[1] * x - f[2] + momentFromLoad,
  };
}

/**
 * The abscissas in (0, L) where V(x) = 0 — the stations where the bending
 * moment reaches an extremum.
 *
 * Returned so a caller sampling the diagram can insert them explicitly. With
 * a uniform load V is linear and there is at most one; with a trapezoidal one
 * it is quadratic and there can be two, both real and both inside the span.
 * Endpoints are excluded: a caller already samples those, and a root sitting
 * exactly on one would produce a duplicate station.
 */
export function shearZeroStations(result: ElementResult): number[] {
  const load = result.spanLoad;
  if (load === null) return [];

  const L = result.geometry.length;
  if (L === 0) return [];

  const V0 = result.endForces.local[1];
  const { qI, qJ } = load;
  const slope = (qJ - qI) / L;

  // V(x) = V0 + qI·x + slope·x²/2
  const a = slope / 2;
  const b = qI;
  const c = V0;

  const inside = (x: number) => x > 0 && x < L;

  if (Math.abs(a) <= Number.EPSILON) {
    if (Math.abs(b) <= Number.EPSILON) return [];
    const x = -c / b;
    return inside(x) ? [x] : [];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];

  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)]
    .filter(inside)
    .sort((left, right) => left - right);
}

/** Names a distributed load's shape, for labels. The maths never branches on it. */
export function classifyDistributedLoad(load: DistributedLoad): DistributedLoadShape {
  const atI = Math.abs(load.wxI) + Math.abs(load.wyI);
  const atJ = Math.abs(load.wxJ) + Math.abs(load.wyJ);

  if (atI === 0 && atJ === 0) return 'zero';
  if (atI === 0 || atJ === 0) return 'triangular';
  if (load.wxI === load.wxJ && load.wyI === load.wyJ) return 'uniform';
  return 'trapezoidal';
}

/**
 * Describes every global DOF in order, so the interface can label matrix rows
 * and columns without re-deriving the mapping that `dof.ts` owns.
 */
export function describeDofs(dofMap: DofMap): DofDescriptor[] {
  return Array.from({ length: dofMap.size }, (_unused, index) => ({
    index,
    ...dofMap.describe(index),
  }));
}
