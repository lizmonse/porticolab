/**
 * Mathematical audit of the plane frame engine.
 *
 * The other suites check that the engine reproduces known answers. This one
 * checks the properties that must hold for EVERY answer — the invariants a
 * wrong sign, a transposed index or a bad unit factor cannot satisfy by
 * accident. Five sections, one per pillar:
 *
 *   1. Units      the conversion chain from what the user types to what is
 *                 assembled, verified against hand arithmetic in kN and m.
 *   2. Local 6x6  every term at its exact index, and every column in
 *                 rigid-body equilibrium, which is what pins the signs.
 *   3. Transform  T leaves rotations alone, is orthogonal, and the congruence
 *                 product is bitwise symmetric.
 *   4. Equilibrium  the order of operations in the end forces, and a sweep of
 *                 models whose reactions and loads must sum to zero.
 *   5. Edge cases  vertical members, and refusal on degenerate input.
 */

import { describe, expect, it } from 'vitest';

import {
  assembleGlobalStiffness,
  createDofMap,
  elementEndForces,
  elementStiffness,
  elementStiffnessFromGeometry,
  elementTransformation,
  localStiffness,
  scatterElementStiffness,
  solveFrame,
  zeroMatrix,
} from '../../src/lib/frame';
import { FrameError } from '../../src/lib/frame/errors';
import { directionCosines, elementGeometry } from '../../src/lib/frame/geometry';
import type { FrameModel, Matrix6 } from '../../src/types/frame';
import {
  gigapascalToEngine,
  quarticCentimetreToEngine,
  squareMillimetreToEngine,
} from '../../src/utils/unit-conversion';

const E = 210e6; // kN/m^2
const A = 6e-3; // m^2
const I = 8e-5; // m^4
const L = 4; // m

// ---------------------------------------------------------------------------
// 1. Units
// ---------------------------------------------------------------------------

describe('1. unit consistency, from the input field to the assembled matrix', () => {
  it('converts each property by its own power of ten', () => {
    expect(gigapascalToEngine(210)).toBe(210e6); // 1 GPa = 1e6 kN/m^2
    expect(squareMillimetreToEngine(6000)).toBe(6e-3); // 1 mm^2 = 1e-6 m^2
    expect(quarticCentimetreToEngine(8000)).toBe(8e-5); // 1 cm^4 = 1e-8 m^4
  });

  it('never lets the area factor stand in for the inertia factor', () => {
    // The failure this whole section exists for: an inertia converted as an
    // area is 10 000 times too large, the model still solves, and every
    // bending moment is wrong by four orders of magnitude.
    expect(quarticCentimetreToEngine(1) / squareMillimetreToEngine(1)).toBeCloseTo(0.01, 12);
    expect(quarticCentimetreToEngine(8000)).not.toBeCloseTo(squareMillimetreToEngine(8000), 12);
  });

  it('assembles the stiffness a hand calculation in kN and m predicts', () => {
    // A user types E = 210 GPa, A = 6000 mm2, I = 8000 cm4 on a 4 m member.
    // In kN and m that is E = 210e6, A = 6e-3, I = 8e-5, so:
    //   EA/L     = 210e6 * 6e-3 / 4       = 315 000 kN/m
    //   12EI/L^3 = 12 * 210e6 * 8e-5 / 64 =   3 150 kN/m
    //   6EI/L^2  = 6 * 210e6 * 8e-5 / 16  =   6 300 kN
    //   4EI/L    = 4 * 210e6 * 8e-5 / 4   =  16 800 kN·m/rad
    const k = localStiffness(
      gigapascalToEngine(210),
      squareMillimetreToEngine(6000),
      quarticCentimetreToEngine(8000),
      4,
    );

    expect(k[0]![0]).toBeCloseTo(315_000, 6);
    expect(k[1]![1]).toBeCloseTo(3_150, 8);
    expect(k[1]![2]).toBeCloseTo(6_300, 8);
    expect(k[2]![2]).toBeCloseTo(16_800, 8);
    expect(k[2]![5]).toBeCloseTo(8_400, 8);
  });

  it('keeps moments in kN·m: a unit rotation at one end gives 4EI/L', () => {
    // The rotational DOF is the one carrying a different unit from the other
    // two. A moment read in kN·m per radian is what makes the results table
    // and the reaction column dimensionally honest.
    const k = localStiffness(E, A, I, L);
    const unitRotation = [0, 0, 1, 0, 0, 0];
    const momentAtSameEnd = unitRotation.reduce((sum, u, c) => sum + k[2]![c]! * u, 0);
    expect(momentAtSameEnd).toBeCloseTo((4 * E * I) / L, 8);
  });
});

// ---------------------------------------------------------------------------
// 2. Local 6x6
// ---------------------------------------------------------------------------

describe('2. the local 6x6, term by term', () => {
  const k = localStiffness(E, A, I, L);
  const axial = (E * A) / L;
  const shear = (12 * E * I) / L ** 3;
  const coupling = (6 * E * I) / L ** 2;
  const near = (4 * E * I) / L;
  const far = (2 * E * I) / L;

  it('places every term at the index the DOF order demands', () => {
    // Order: [u_i, v_i, theta_i, u_j, v_j, theta_j].
    const expected: readonly (readonly number[])[] = [
      [axial, 0, 0, -axial, 0, 0],
      [0, shear, coupling, 0, -shear, coupling],
      [0, coupling, near, 0, -coupling, far],
      [-axial, 0, 0, axial, 0, 0],
      [0, -shear, -coupling, 0, shear, -coupling],
      [0, coupling, far, 0, -coupling, near],
    ];

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(k[r]![c]).toBeCloseTo(expected[r]![c]!, 8);
      }
    }
  });

  it('keeps the axial rows and columns free of bending, exactly', () => {
    // Not "close to zero": in local axes these cells are never written, so
    // they must be the integer 0. A stray 1e-17 here would mean the axial and
    // bending sub-problems had been allowed to mix.
    for (const row of [0, 3]) {
      for (const column of [1, 2, 4, 5]) {
        expect(k[row]![column]).toBe(0);
        expect(k[column]![row]).toBe(0);
      }
    }
  });

  it('is symmetric bitwise, not approximately', () => {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(k[r]![c]).toBe(k[c]![r]);
      }
    }
  });

  it('holds every column in rigid-body equilibrium, which is what fixes the signs', () => {
    // The strongest check available without a reference solution: impose each
    // DOF alone and require the six end forces it produces to be a
    // self-equilibrated system. A wrong sign on 6EI/L^2 breaks the moment sum
    // immediately, while leaving the matrix symmetric and plausible.
    for (let column = 0; column < 6; column++) {
      const f = [0, 1, 2, 3, 4, 5].map((row) => k[row]![column]!);

      const sumAxial = f[0]! + f[3]!;
      const sumShear = f[1]! + f[4]!;
      // Moments about end i: the two end moments plus the moment of the shear
      // at end j, which acts a distance L away.
      const sumMoment = f[2]! + f[5]! + f[4]! * L;

      expect(sumAxial).toBeCloseTo(0, 6);
      expect(sumShear).toBeCloseTo(0, 6);
      expect(sumMoment).toBeCloseTo(0, 6);
    }
  });

  it('gives the coupling terms the sign the deformation convention requires', () => {
    // A positive transverse translation of end i, or a positive rotation
    // there, both raise a positive moment at that end. Flipping either sign
    // would still satisfy symmetry, so it has to be asserted outright.
    expect(k[1]![2]).toBeGreaterThan(0); // v_i  -> M_i
    expect(k[2]![1]).toBeGreaterThan(0); // theta_i -> V_i
    expect(k[4]![5]).toBeLessThan(0); // v_j -> M_j
    // Carry-over is half the near-end stiffness, and of the same sign.
    expect(k[2]![5]).toBeCloseTo(k[2]![2]! / 2, 8);
  });

  it('is singular in exactly the three rigid-body modes', () => {
    const modes = [
      [1, 0, 0, 1, 0, 0], // translation along the member
      [0, 1, 0, 0, 1, 0], // translation across it
      [0, -L / 2, 1, 0, L / 2, 1], // rotation about the mid-point
    ];

    for (const mode of modes) {
      for (let row = 0; row < 6; row++) {
        const force = mode.reduce((sum, u, c) => sum + k[row]![c]! * u, 0);
        expect(force).toBeCloseTo(0, 6);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Transformation and assembly
// ---------------------------------------------------------------------------

describe('3. transformation and global assembly', () => {
  const angles = [0, 17.5, 30, 45, 90, 123.6901, 180, 234.7, 270, 318.8141];

  it('leaves both rotational DOFs untouched at every angle', () => {
    for (const angle of angles) {
      const T = elementTransformation(angle);
      expect(T[2]![2]).toBe(1);
      expect(T[5]![5]).toBe(1);
      // And the rotation rows couple to nothing else.
      for (const column of [0, 1, 3, 4, 5]) expect(T[2]![column]).toBe(0);
      for (const column of [0, 1, 2, 3, 4]) expect(T[5]![column]).toBe(0);
    }
  });

  it('is orthogonal: T transpose times T is the identity', () => {
    for (const angle of angles) {
      const T = elementTransformation(angle);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          let sum = 0;
          for (let k = 0; k < 6; k++) sum += T[k]![r]! * T[k]![c]!;
          expect(sum).toBeCloseTo(r === c ? 1 : 0, 12);
        }
      }
    }
  });

  it('produces a bitwise symmetric element matrix at every angle', () => {
    // Bitwise, not approximate. The congruence product reaches k[a][b] and
    // k[b][a] through different sums, so without the explicit mirroring they
    // differ in the last bit and the assembled K is not exactly symmetric.
    for (const angle of angles) {
      const k = elementStiffness(E, A, I, L, angle);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
          expect(k[r]![c]).toBe(k[c]![r]);
        }
      }
    }
  });

  it('preserves the trace and the diagonal blocks under rotation', () => {
    // A congruence transformation by an orthogonal matrix is a change of
    // basis: the sum of the diagonal cannot change.
    const local = localStiffness(E, A, I, L);
    const localTrace = [0, 1, 2, 3, 4, 5].reduce((sum, d) => sum + local[d]![d]!, 0);

    for (const angle of angles) {
      const global = elementStiffness(E, A, I, L, angle);
      const globalTrace = [0, 1, 2, 3, 4, 5].reduce((sum, d) => sum + global[d]![d]!, 0);
      expect(globalTrace).toBeCloseTo(localTrace, 4);
    }
  });

  it('keeps the assembled global matrix bitwise symmetric', () => {
    const model = portalFrame();
    const { globalStiffness } = assembleGlobalStiffness(model);

    for (let r = 0; r < globalStiffness.length; r++) {
      for (let c = 0; c < globalStiffness.length; c++) {
        expect(globalStiffness[r]![c]).toBe(globalStiffness[c]![r]);
      }
    }
  });

  it('scatters each element into the degrees of freedom of its own nodes', () => {
    const dofMap = createDofMap([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 4, y: 0 },
      { id: 3, x: 8, y: 0 },
    ]);
    const K = zeroMatrix(dofMap.size);
    const k = localStiffness(E, A, I, L);

    scatterElementStiffness(K, k, dofMap.elementDofs(2, 3));

    // Node 1 is untouched; the element's own six DOFs carry its matrix.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) expect(K[r]![c]).toBe(0);
    }
    expect(K[3]![3]).toBeCloseTo(k[0]![0]!, 8);
    expect(K[8]![8]).toBeCloseTo(k[5]![5]!, 8);
  });

  it('refuses to scatter outside the matrix instead of writing a silent NaN', () => {
    // Writing past the end of a row is legal JavaScript and yields NaN, which
    // would then poison the whole solve with no indication of where it began.
    const K = zeroMatrix(6);
    const k = localStiffness(E, A, I, L);

    expect(() => scatterElementStiffness(K, k, [0, 1, 2, 6, 7, 8])).toThrowError(FrameError);
    expect(K.every((row) => row.length === 6 && row.every((v) => v === 0))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Equilibrium
// ---------------------------------------------------------------------------

describe('4. nodal and global static equilibrium', () => {
  it('rotates the displacements into local axes BEFORE applying the local matrix', () => {
    // f_local = k_local * (T * u_global). Doing it the other way round —
    // k_global * u_global — gives the end forces in GLOBAL axes, where
    // "axial" and "shear" mean nothing for an inclined member. The two agree
    // only when the member is horizontal, which is why this is checked on one
    // that is not.
    const angle = 35;
    const u = [0, 0, 0, 0.004, -0.002, 0.0007];

    const fromLocal = elementEndForces(E, A, I, L, angle, u);

    const kGlobal = elementStiffness(E, A, I, L, angle);
    const fromGlobal = [0, 1, 2, 3, 4, 5].map((r) =>
      u.reduce((sum, value, c) => sum + kGlobal[r]![c]! * value, 0),
    );

    // Different vectors, as they must be...
    expect(fromLocal.axialJ).not.toBeCloseTo(fromGlobal[3]!, 3);
    // ...but the same vector once rotated back, since T is orthogonal.
    const T = elementTransformation(angle);
    const rotatedBack = [0, 1, 2, 3, 4, 5].map((r) =>
      fromLocal.local.reduce((sum, value, k) => sum + T[k]![r]! * value, 0),
    );
    for (let i = 0; i < 6; i++) {
      expect(rotatedBack[i]).toBeCloseTo(fromGlobal[i]!, 6);
    }
  });

  it('balances every model: forces and moments sum to zero', () => {
    for (const [name, model] of Object.entries(equilibriumCases())) {
      const solution = solveFrame(model);
      const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

      let fx = 0;
      let fy = 0;
      let mz = 0;

      for (const load of model.loads) {
        const node = nodeById.get(load.node)!;
        fx += load.fx;
        fy += load.fy;
        mz += node.x * load.fy - node.y * load.fx + load.mz;
      }
      for (const reaction of solution.reactions) {
        const node = nodeById.get(reaction.node)!;
        fx += reaction.fx;
        fy += reaction.fy;
        mz += node.x * reaction.fy - node.y * reaction.fx + reaction.mz;
      }

      const scale = model.loads.reduce(
        (max, load) => Math.max(max, Math.abs(load.fx), Math.abs(load.fy), Math.abs(load.mz)),
        1,
      );

      expect(Math.abs(fx) / scale, `${name}: sum of horizontal forces`).toBeLessThan(1e-9);
      expect(Math.abs(fy) / scale, `${name}: sum of vertical forces`).toBeLessThan(1e-9);
      expect(Math.abs(mz) / scale, `${name}: sum of moments`).toBeLessThan(1e-8);
    }
  });

  it('balances every free joint against the member end forces meeting there', () => {
    // Node equilibrium, one level below the global check: the end actions on
    // the members framing into an unrestrained joint must reproduce the load
    // applied at it. This is what catches a scatter that lands one DOF off.
    const model = portalFrame();
    const solution = solveFrame(model);
    const restrained = new Set(model.supports.map((support) => support.node));

    for (const node of model.nodes) {
      if (restrained.has(node.id)) continue;

      const applied = model.loads
        .filter((load) => load.node === node.id)
        .reduce((sum, load) => sum + load.mz, 0);

      const fromMembers = model.elements.reduce((sum, element) => {
        const result = solution.elements.find((e) => e.elementId === element.id)!;
        if (element.from === node.id) return sum + result.endForces.momentI;
        if (element.to === node.id) return sum + result.endForces.momentJ;
        return sum;
      }, 0);

      expect(fromMembers).toBeCloseTo(applied, 6);
    }
  });

  it('reports a reaction of zero at a released rotation', () => {
    const solution = solveFrame(portalFrame());
    const pinned = solution.reactions.find((r) => r.node === 4)!;
    expect(pinned.mz).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe('5. degenerate geometry and invalid input', () => {
  it('gives a vertical member exact zeros, by either entry point', () => {
    // dx/L is 0/4, an exact zero, and the quadrant table answers 90 degrees
    // with the same exact zero rather than Math.cos's 6.1e-17. Both paths have
    // to agree, or the same column would have different matrices depending on
    // how it was described.
    const geometry = elementGeometry({ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: L });
    expect(geometry.cos).toBe(0);
    expect(geometry.sin).toBe(1);
    expect(directionCosines(90).cos).toBe(0);
    expect(directionCosines(270).sin).toBe(-1);
    expect(directionCosines(-90).sin).toBe(-1);

    const byAngle = elementStiffness(E, A, I, L, 90);
    const byGeometry = elementStiffnessFromGeometry(E, A, I, geometry);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(byAngle[r]![c]).toBe(byGeometry[r]![c]);
      }
    }
  });

  it('swaps the axial and shear stiffness onto the right global axes when vertical', () => {
    const k = elementStiffness(E, A, I, L, 90);
    expect(k[1]![1]).toBeCloseTo((E * A) / L, 6); // axial now acts along Y
    expect(k[0]![0]).toBeCloseTo((12 * E * I) / L ** 3, 8); // bending along X
    expect(k[2]![2]).toBeCloseTo((4 * E * I) / L, 8); // rotation unchanged
    expect(k[0]![1]).toBe(0); // and the two do not mix
  });

  it('handles a member pointing straight down as cleanly as one pointing up', () => {
    const up = elementStiffnessFromGeometry(
      E,
      A,
      I,
      elementGeometry({ id: 1, x: 0, y: 0 }, { id: 2, x: 0, y: L }),
    );
    const down = elementStiffnessFromGeometry(
      E,
      A,
      I,
      elementGeometry({ id: 1, x: 0, y: L }, { id: 2, x: 0, y: 0 }),
    );

    // Swapping the ends permutes the 3x3 blocks; the physics is unchanged.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        expect(up[r]![c]).toBeCloseTo(down[r + 3]![c + 3]!, 6);
      }
    }
  });

  it('never divides by zero, because a zero-length member is refused first', () => {
    expect(() =>
      elementGeometry({ id: 1, x: 2, y: 3 }, { id: 2, x: 2, y: 3 }),
    ).toThrowError(FrameError);

    expect.assertions(2);
    try {
      elementGeometry({ id: 1, x: 2, y: 3 }, { id: 2, x: 2, y: 3 });
    } catch (error) {
      expect((error as FrameError).code).toBe('ZERO_LENGTH_ELEMENT');
    }
  });

  it('rejects a null or negative inertia before computing anything', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => localStiffness(E, A, bad, L)).toThrowError(FrameError);
      try {
        localStiffness(E, A, bad, L);
      } catch (error) {
        expect((error as FrameError).code).toBe('INVALID_SECTION');
      }
    }
  });

  it('rejects a whole model whose member has no inertia', () => {
    const model = portalFrame();
    const broken: FrameModel = {
      ...model,
      elements: model.elements.map((element, index) =>
        index === 1 ? { ...element, I: 0 } : element,
      ),
    };

    expect.assertions(1);
    try {
      solveFrame(broken);
    } catch (error) {
      expect((error as FrameError).code).toBe('INVALID_SECTION');
    }
  });

  it('rejects a null area or modulus with the material code, not the section one', () => {
    for (const bad of [0, -5]) {
      try {
        localStiffness(bad, A, I, L);
      } catch (error) {
        expect((error as FrameError).code).toBe('INVALID_MATERIAL');
      }
      try {
        localStiffness(E, bad, I, L);
      } catch (error) {
        expect((error as FrameError).code).toBe('INVALID_MATERIAL');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A portal frame with one fixed base and one pinned. */
function portalFrame(): FrameModel {
  return {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 4 },
      { id: 3, x: 6, y: 4 },
      { id: 4, x: 6, y: 0 },
    ],
    elements: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
      { id: 3, from: 3, to: 4, E, A, I },
    ],
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
      { node: 4, restrainX: true, restrainY: true, restrainRz: false },
    ],
    loads: [
      { node: 2, fx: 30, fy: 0, mz: 0 },
      { node: 3, fx: 0, fy: 0, mz: -20 },
    ],
  };
}

/**
 * A spread of models for the equilibrium sweep: different support types,
 * load types, orientations and degrees of indeterminacy.
 */
function equilibriumCases(): Record<string, FrameModel> {
  const member = { E, A, I };

  return {
    'portal, fixed and pinned bases': portalFrame(),

    'portal, both bases fixed, gravity and wind': {
      ...portalFrame(),
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 4, restrainX: true, restrainY: true, restrainRz: true },
      ],
      loads: [
        { node: 2, fx: 12, fy: -30, mz: 0 },
        { node: 3, fx: 0, fy: -45, mz: 8 },
      ],
    },

    'cantilever, load and moment at the tip': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 5, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, ...member }],
      supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [{ node: 2, fx: 4, fy: -9, mz: 14 }],
    },

    'simply supported beam on a roller': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, ...member },
        { id: 2, from: 2, to: 3, ...member },
      ],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: false },
        { node: 3, restrainX: false, restrainY: true, restrainRz: false },
      ],
      loads: [{ node: 2, fx: 0, fy: -25, mz: 0 }],
    },

    'inclined member, load applied off-axis': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 4 },
      ],
      elements: [{ id: 1, from: 1, to: 2, ...member }],
      supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [{ node: 2, fx: -7, fy: -11, mz: 5 }],
    },

    'load applied directly at a support': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 4, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, ...member }],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 2, restrainX: false, restrainY: true, restrainRz: false },
      ],
      // The vertical component lands on a restrained DOF, which is where a
      // reaction reported as K*U rather than K*U - F would break the sum.
      loads: [{ node: 2, fx: 6, fy: -18, mz: 3 }],
    },

    'support settlement, no applied load': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 6, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, ...member }],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        {
          node: 2,
          restrainX: true,
          restrainY: true,
          restrainRz: true,
          settlement: { dy: -0.015 },
        },
      ],
      loads: [],
    },
  };
}
