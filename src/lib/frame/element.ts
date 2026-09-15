/**
 * Element-level mathematics of the plane frame element: local stiffness,
 * rotation to global axes, and end forces.
 *
 * Port of PlaneFrameElementStiffness and PlaneFrameElementForces from the
 * reference text.
 *
 * WHY THIS IS NOT THE TRUSS ELEMENT WITH EXTRA ROWS
 * A truss bar has one deformation mode, elongation, so its 4x4 matrix can be
 * written in closed form directly in global axes. A frame member has three
 * coupled modes — elongation, shear translation and end rotation — and the
 * clean way to express them is in the member's OWN axes, where axial and
 * bending terms do not mix:
 *
 *          | EA/L    0          0        -EA/L   0          0       |
 *          |  0     12EI/L^3   6EI/L^2    0    -12EI/L^3   6EI/L^2  |
 *   k_l =  |  0      6EI/L^2   4EI/L      0     -6EI/L^2   2EI/L    |
 *          |-EA/L    0          0         EA/L   0          0       |
 *          |  0    -12EI/L^3  -6EI/L^2    0     12EI/L^3  -6EI/L^2  |
 *          |  0      6EI/L^2   2EI/L      0     -6EI/L^2   4EI/L    |
 *
 * and then rotate with the congruence transformation
 *
 *   k_global = T^T * k_l * T
 *
 * That two-step path is also what the interface displays, so the local
 * matrix and T are returned as first-class values rather than hidden inside
 * an expanded algebraic formula.
 *
 * DOF order everywhere in this module is [u_i, v_i, theta_i, u_j, v_j,
 * theta_j], as defined by `Vec6`.
 *
 * On mathjs: these operations act on fixed 6x6 matrices and are both faster
 * and clearer with native arrays. mathjs is reserved for the solver, where it
 * genuinely earns its place (LU factorization of the reduced system). A
 * dependency is not used where it adds nothing.
 */

import type {
  DistributedLoad,
  ElementEndForces,
  ElementGeometry,
  LocalSpanLoad,
  Matrix6,
  Vec6,
} from '../../types/frame';
import { assertPositiveFinite, FrameError } from './errors';
import { directionCosines } from './geometry';

/** Rows and columns of every matrix in this module. */
const SIZE = 6;

/** The zero fixed-end force vector, for members carrying no span load. */
export const NO_FIXED_END_FORCES: Vec6 = [0, 0, 0, 0, 0, 0];

// ---------------------------------------------------------------------------
// Local stiffness
// ---------------------------------------------------------------------------

/**
 * Element stiffness matrix in LOCAL coordinates.
 *
 * The single source of truth for the frame element's physics. Everything else
 * in this module is bookkeeping around it: rotation into global axes, and
 * multiplication by a displacement vector.
 *
 * The four bending coefficients are named after the terms they carry so the
 * matrix below can be read against the one in any textbook.
 *
 * @param E Young's modulus.
 * @param A Cross-sectional area.
 * @param I Second moment of area about the bending axis.
 * @param L Element length.
 */
export function localStiffness(E: number, A: number, I: number, L: number): Matrix6 {
  assertElementProperties(E, A, I, L);

  /** EA/L: the axial term, the whole of the truss element. */
  const axial = (E * A) / L;

  const flexural = E * I;
  /** 12EI/L^3: force per unit transverse translation. */
  const shear = (12 * flexural) / (L * L * L);
  /** 6EI/L^2: the coupling between transverse translation and end rotation. */
  const coupling = (6 * flexural) / (L * L);
  /** 4EI/L: moment per unit rotation at the SAME end. */
  const near = (4 * flexural) / L;
  /** 2EI/L: moment carried over to the FAR end. */
  const far = (2 * flexural) / L;

  return [
    [axial, 0, 0, -axial, 0, 0],
    [0, shear, coupling, 0, -shear, coupling],
    [0, coupling, near, 0, -coupling, far],
    [-axial, 0, 0, axial, 0, 0],
    [0, -shear, -coupling, 0, shear, -coupling],
    [0, coupling, far, 0, -coupling, near],
  ];
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

/**
 * Transformation matrix T, from the direction cosines.
 *
 * T rotates a vector of GLOBAL nodal quantities into the member's LOCAL axes:
 * u_local = T * u_global.
 *
 *        | C  S  0  0  0  0 |
 *        |-S  C  0  0  0  0 |
 *   T =  | 0  0  1  0  0  0 |
 *        | 0  0  0  C  S  0 |
 *        | 0  0  0 -S  C  0 |
 *        | 0  0  0  0  0  1 |
 *
 * The two 1s on the diagonal are the whole point of the frame element: a
 * rotation about Z is the same number in both frames of reference, because
 * both share the Z axis. Only the translations rotate.
 */
function transformationFromDirectionCosines(C: number, S: number): Matrix6 {
  return [
    [C, S, 0, 0, 0, 0],
    [-S, C, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, C, S, 0],
    [0, 0, 0, -S, C, 0],
    [0, 0, 0, 0, 0, 1],
  ];
}

/** Transformation matrix T from an angle in DEGREES. */
export function elementTransformation(thetaDeg: number): Matrix6 {
  const { cos, sin } = directionCosines(thetaDeg);
  return transformationFromDirectionCosines(cos, sin);
}

/** Transformation matrix T from geometry derived from the node coordinates. */
export function elementTransformationFromGeometry(geometry: ElementGeometry): Matrix6 {
  return transformationFromDirectionCosines(geometry.cos, geometry.sin);
}

// ---------------------------------------------------------------------------
// Global stiffness
// ---------------------------------------------------------------------------

/**
 * Applies the congruence transformation k_global = T^T * k_local * T.
 *
 * The result is symmetrized explicitly, by mirroring the upper triangle onto
 * the lower one. The product of three matrices computes k[a][b] and k[b][a]
 * through different sequences of multiplications and additions, so in double
 * precision they can differ in the last bit. That is physically meaningless —
 * a stiffness matrix IS symmetric — but it shows up as asymmetric digits in
 * the matrix viewer and breaks any symmetry assertion downstream. Mirroring
 * costs nothing and keeps the invariant exact.
 *
 * Negative zeros are folded to positive zero for the same reason: a matrix
 * viewer should print 0, not -0.
 */
function rotateToGlobal(kLocal: Matrix6, T: Matrix6): Matrix6 {
  // step = k_local * T
  const step: number[][] = Array.from({ length: SIZE }, (_unused, row) =>
    Array.from({ length: SIZE }, (_ignored, column) => {
      let sum = 0;
      for (let k = 0; k < SIZE; k++) {
        sum += (kLocal[row] as readonly number[])[k]! * (T[k] as readonly number[])[column]!;
      }
      return sum;
    }),
  );

  const kGlobal: number[][] = Array.from({ length: SIZE }, () => new Array<number>(SIZE).fill(0));

  for (let row = 0; row < SIZE; row++) {
    for (let column = row; column < SIZE; column++) {
      // (T^T * step)[row][column] = sum_k T[k][row] * step[k][column]
      let sum = 0;
      for (let k = 0; k < SIZE; k++) {
        sum += (T[k] as readonly number[])[row]! * step[k]![column]!;
      }
      const value = sum === 0 ? 0 : sum;
      kGlobal[row]![column] = value;
      kGlobal[column]![row] = value;
    }
  }

  return kGlobal as unknown as Matrix6;
}

/**
 * 6x6 element stiffness matrix in GLOBAL coordinates, from the angle.
 *
 * Port of PlaneFrameElementStiffness(E, A, I, L, theta).
 *
 * @param thetaDeg Angle from the positive global X axis, in DEGREES.
 */
export function elementStiffness(
  E: number,
  A: number,
  I: number,
  L: number,
  thetaDeg: number,
): Matrix6 {
  return rotateToGlobal(localStiffness(E, A, I, L), elementTransformation(thetaDeg));
}

/**
 * Same as `elementStiffness`, but starting from geometry derived from the
 * node coordinates. This is the path the engine takes: it skips the round
 * trip through atan2/cos/sin.
 */
export function elementStiffnessFromGeometry(
  E: number,
  A: number,
  I: number,
  geometry: ElementGeometry,
): Matrix6 {
  return rotateToGlobal(
    localStiffness(E, A, I, geometry.length),
    elementTransformationFromGeometry(geometry),
  );
}

// ---------------------------------------------------------------------------
// Span loads and fixed-end forces
// ---------------------------------------------------------------------------

/**
 * Resolves span loads given in GLOBAL components into the member's own axes.
 *
 * The rotation is the same 2x2 block that sits in T, applied to an intensity
 * rather than to a displacement. It is constant along a straight member, so a
 * load that is linear in global components stays linear in local ones — which
 * is the property the closed-form fixed-end formulas depend on.
 *
 * Several loads on the same member accumulate. That is what lets a caller
 * build a trapezoid by superposing a rectangle and a triangle, and it is why
 * the UI can hold span loads as separate rows the way it holds nodal ones.
 */
export function resolveSpanLoad(
  loads: readonly DistributedLoad[],
  geometry: ElementGeometry,
): LocalSpanLoad | null {
  if (loads.length === 0) return null;

  const { cos: C, sin: S } = geometry;
  let pI = 0;
  let pJ = 0;
  let qI = 0;
  let qJ = 0;

  for (const load of loads) {
    // Local x is along the member; local y is 90 degrees counter-clockwise.
    pI += C * load.wxI + S * load.wyI;
    qI += -S * load.wxI + C * load.wyI;
    pJ += C * load.wxJ + S * load.wyJ;
    qJ += -S * load.wxJ + C * load.wyJ;
  }

  return { pI, pJ, qI, qJ };
}

/**
 * Fixed-end forces: the six end actions that hold a member's ends fully
 * clamped under its span load, in LOCAL axes and in the `Vec6` order.
 *
 * ---------------------------------------------------------------------------
 * Why there is one formula and not three
 * ---------------------------------------------------------------------------
 * Superposing the uniform case on the triangular one collapses them. Writing
 * a trapezoid as `q1` uniform plus `(q2 - q1)` triangular and adding the two
 * standard results gives, for the transverse part:
 *
 *     V_i = -L(7q1 + 3q2)/20        M_i = -L^2(3q1 + 2q2)/60
 *     V_j = -L(3q1 + 7q2)/20        M_j = +L^2(2q1 + 3q2)/60
 *
 * Substituting q1 = q2 = q recovers the textbook uniform values qL/2 and
 * qL^2/12; substituting q1 = 0 recovers the triangular 3qL/20, 7qL/20 and
 * qL^2/30, qL^2/20. Both are asserted in the tests rather than trusted.
 *
 * The axial part is the consistent load vector of the two-node bar, whose
 * linear shape functions integrate against a linear intensity to L(2p1+p2)/6
 * and L(p1+2p2)/6. Those sum to L(p1+p2)/2, the total axial load, which is
 * the check worth remembering.
 *
 * ---------------------------------------------------------------------------
 * Signs
 * ---------------------------------------------------------------------------
 * Every component is NEGATIVE of what the load applies, because these are the
 * actions the imaginary clamps must supply to hold the member still. A
 * downward uniform load (q < 0, since local +y is 90 degrees CCW from the
 * member) therefore produces upward end shears and the familiar hogging end
 * moments.
 *
 * The two consumers must use it consistently and in opposite directions:
 *
 *     load vector    Q_eq = -T^T * f_FEM     (apply the opposite to the frame)
 *     recovery       f_local = k*T*u + f_FEM (add it back to the member)
 *
 * Getting either sign backwards produces a model that still solves. The
 * fixed-fixed beam is the test that catches it: every nodal DOF is zero
 * there, so `k*T*u` vanishes and the end moments are f_FEM alone.
 */
export function fixedEndForces(load: LocalSpanLoad | null, L: number): Vec6 {
  if (load === null) return NO_FIXED_END_FORCES;

  const { pI, pJ, qI, qJ } = load;
  const L2 = L * L;

  return [
    -(L * (2 * pI + pJ)) / 6,
    -(L * (7 * qI + 3 * qJ)) / 20,
    -(L2 * (3 * qI + 2 * qJ)) / 60,
    -(L * (pI + 2 * pJ)) / 6,
    -(L * (3 * qI + 7 * qJ)) / 20,
    (L2 * (2 * qI + 3 * qJ)) / 60,
  ];
}

/**
 * Equivalent nodal loads in GLOBAL axes: `Q_eq = -T^T * f_FEM`.
 *
 * This is the vector that actually reaches `K * D = Q`. The negation is the
 * whole idea of the method: the clamps were imaginary, so what the structure
 * feels is the opposite of what they supplied.
 */
export function equivalentNodalLoads(fixedEnd: Vec6, T: Matrix6): Vec6 {
  const result = new Array<number>(SIZE).fill(0);

  for (let column = 0; column < SIZE; column++) {
    let sum = 0;
    for (let row = 0; row < SIZE; row++) {
      sum += (T[row] as readonly number[])[column]! * fixedEnd[row]!;
    }
    result[column] = sum === 0 ? 0 : -sum;
  }

  return result as unknown as Vec6;
}

// ---------------------------------------------------------------------------
// End forces
// ---------------------------------------------------------------------------

/**
 * The six local end forces of a member:
 *
 *     f_local = k_local * T * u_global  +  f_FEM
 *
 * This replaces the truss element's single axial force. The result is read
 * as [N_i, V_i, M_i, N_j, V_j, M_j] in the member's own axes, which is what
 * a bending moment diagram is drawn from.
 *
 * Note the order of operations: the displacements are rotated into local axes
 * FIRST, then multiplied by the local matrix. Multiplying by the global
 * matrix instead would give the end forces in global axes, where "shear" and
 * "axial" have no meaning for an inclined member.
 *
 * The `+ f_FEM` term is the half of the superposition that is easy to forget
 * and impossible to spot afterwards. The equivalent nodal loads deform the
 * frame correctly on their own, so a model that omits this still produces
 * plausible displacements and reactions — only the member end forces are
 * wrong, and on a fully clamped member they come out as exactly zero.
 */
function endForcesFromParts(
  kLocal: Matrix6,
  T: Matrix6,
  u: Vec6,
  fixedEnd: Vec6 = NO_FIXED_END_FORCES,
): ElementEndForces {
  const uLocal = multiply(T, u);
  const stiffnessPart = multiply(kLocal, uLocal);

  const f = stiffnessPart.map((value, index) => {
    const sum = value + fixedEnd[index]!;
    return sum === 0 ? 0 : sum;
  }) as unknown as Vec6;

  return {
    local: f,
    axialI: f[0],
    shearI: f[1],
    momentI: f[2],
    axialJ: f[3],
    shearJ: f[4],
    momentJ: f[5],
    axialForce: memberAxialForce(f),
  };
}

/**
 * The member-level, tension-positive axial force.
 *
 * The two ends give N_i = -f[0] and N_j = f[3]; both are tension-positive
 * because the local x axis points into the member at i and out of it at j.
 * Without an axial span load they are exact negations of one another in
 * floating point, so this returns f[3] and nothing changes.
 *
 * With one they differ, and the larger magnitude wins — a member is coloured
 * and classified by its worst axial section, not by whichever end happens to
 * be listed first. The tie goes to end j so that the no-load path is not just
 * numerically but literally the value it always was.
 */
function memberAxialForce(f: Vec6): number {
  const atI = -f[0];
  const atJ = f[3];
  return Math.abs(atI) > Math.abs(atJ) ? atI : atJ;
}

/**
 * Element end forces from the angle.
 *
 * Port of PlaneFrameElementForces(E, A, I, L, theta, u).
 *
 * @param u Element displacement vector in GLOBAL axes,
 *          [u_i, v_i, theta_i, u_j, v_j, theta_j].
 */
export function elementEndForces(
  E: number,
  A: number,
  I: number,
  L: number,
  thetaDeg: number,
  u: readonly number[],
): ElementEndForces {
  assertVec6(u);
  return endForcesFromParts(
    localStiffness(E, A, I, L),
    elementTransformation(thetaDeg),
    u,
  );
}

/**
 * Variant of `elementEndForces` that starts from the derived geometry.
 *
 * @param fixedEnd The member's fixed-end force vector, in local axes. Omitted
 * or zero for a member with no span load, which is the case the whole engine
 * handled before span loads existed.
 */
export function elementEndForcesFromGeometry(
  E: number,
  A: number,
  I: number,
  geometry: ElementGeometry,
  u: readonly number[],
  fixedEnd: Vec6 = NO_FIXED_END_FORCES,
): ElementEndForces {
  assertVec6(u);
  return endForcesFromParts(
    localStiffness(E, A, I, geometry.length),
    elementTransformationFromGeometry(geometry),
    u,
    fixedEnd,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Multiplies a 6x6 matrix by a 6-component vector. */
function multiply(M: Matrix6, v: Vec6): Vec6 {
  const result = new Array<number>(SIZE).fill(0);

  for (let row = 0; row < SIZE; row++) {
    let sum = 0;
    for (let column = 0; column < SIZE; column++) {
      sum += (M[row] as readonly number[])[column]! * v[column]!;
    }
    result[row] = sum === 0 ? 0 : sum;
  }

  return result as unknown as Vec6;
}

/** Validates the four numbers every element formula depends on. */
function assertElementProperties(E: number, A: number, I: number, L: number): void {
  assertPositiveFinite(E, "Young's modulus E", 'INVALID_MATERIAL');
  assertPositiveFinite(A, 'Cross-sectional area A', 'INVALID_MATERIAL');
  assertPositiveFinite(I, 'Second moment of area I', 'INVALID_SECTION');
  assertPositiveFinite(L, 'Length L', 'ZERO_LENGTH_ELEMENT');
}

/** Asserts that `u` is a displacement vector of exactly 6 finite components. */
function assertVec6(u: readonly number[]): asserts u is Vec6 {
  if (u.length !== SIZE || !u.every(Number.isFinite)) {
    throw new FrameError(
      'INVALID_DISPLACEMENT_VECTOR',
      `An element displacement vector must have 6 finite components (received [${u.join(', ')}]).`,
    );
  }
}
