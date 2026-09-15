/**
 * End-to-end numerical integrity of the solve.
 *
 * `audit.test.ts` checks the formulation — the right terms, in the right
 * cells, with the right signs. This suite checks the ARITHMETIC that runs on
 * top of it: that stiffnesses accumulate without loss, that the factorization
 * actually solves the system it was handed, that the reported end forces leave
 * each member in equilibrium, and that a quantity which is zero in theory is
 * zero on screen rather than 1e-14.
 *
 * Every model here is run through the public `solveFrame`, so the assertions
 * describe what the calculator produces, not what an isolated function does.
 */

import { describe, expect, it } from 'vitest';

import { assembleGlobalStiffness, solveFrame } from '../../src/lib/frame';
import { createDofMap } from '../../src/lib/frame/dof';
import {
  buildLoadVector,
  multiplyMatrixVector,
  partitionDofs,
  submatrix,
} from '../../src/lib/frame/solver';
import type { FrameModel } from '../../src/types/frame';
import { formatDisplacement, formatNumber } from '../../src/utils/format';

const E = 210e6;

// ---------------------------------------------------------------------------
// 1. Stiffness accumulates at shared nodes
// ---------------------------------------------------------------------------

describe('1. summation of stiffness at shared nodes', () => {
  /** A hub: six members radiating from node 1, all sharing its three DOFs. */
  function hub(): FrameModel {
    const nodes = [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 0, y: 1 },
      { id: 4, x: -1, y: 0 },
      { id: 5, x: 0, y: -1 },
      { id: 6, x: 1, y: 1 },
      { id: 7, x: -1, y: -1 },
    ];
    return {
      nodes,
      elements: nodes.slice(1).map((node, index) => ({
        id: index + 1,
        from: 1,
        to: node.id,
        E,
        A: 6e-3,
        I: 8e-5,
      })),
      supports: [{ node: 2, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [],
    };
  }

  it('adds every contribution instead of overwriting the previous one', () => {
    const { globalStiffness, elements } = assembleGlobalStiffness(hub());
    const contributions = [...elements.values()];
    expect(contributions).toHaveLength(6);

    // The hub node owns DOFs 0, 1 and 2, and every member writes into all
    // three. If assembly overwrote rather than accumulated, the diagonal would
    // hold one member's term instead of six.
    for (const dof of [0, 1, 2]) {
      const direct = contributions.reduce(
        (sum, element) => sum + element.globalStiffness[dof]![dof]!,
        0,
      );
      expect(globalStiffness[dof]![dof]).toBe(direct);
      expect(globalStiffness[dof]![dof]).toBeGreaterThan(
        contributions[0]!.globalStiffness[dof]![dof]!,
      );
    }
  });

  it('accumulates the off-diagonal coupling identically in both triangles', () => {
    // The two cells receive the same addends in the same order, so they must
    // agree bitwise — no tolerance. This is what keeps K symmetric after
    // assembly, not just per element.
    const { globalStiffness } = assembleGlobalStiffness(hub());
    for (let r = 0; r < globalStiffness.length; r++) {
      for (let c = 0; c < globalStiffness.length; c++) {
        expect(globalStiffness[r]![c]).toBe(globalStiffness[c]![r]);
      }
    }
  });

  it('leaves the DOFs of unconnected nodes untouched', () => {
    const model = hub();
    const { globalStiffness } = assembleGlobalStiffness({
      ...model,
      nodes: [...model.nodes, { id: 8, x: 5, y: 5 }],
    });

    // Node 8 is in the model but in no element: its rows and columns must be
    // exactly empty, which is also what makes the system singular and gets the
    // model rejected rather than solved.
    for (const dof of [21, 22, 23]) {
      for (let c = 0; c < globalStiffness.length; c++) {
        expect(globalStiffness[dof]![c]).toBe(0);
        expect(globalStiffness[c]![dof]).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Solver stability
// ---------------------------------------------------------------------------

describe('2. numerical stability of the reduced solve', () => {
  it('solves the system it was handed, to machine precision, in every case', () => {
    // The direct check that the factorization did its job: substitute the
    // answer back and require the residual to vanish relative to the load.
    // Run over well- and badly conditioned models alike.
    for (const [name, model] of Object.entries(stressCases())) {
      const solution = solveFrame(model);
      const dofMap = createDofMap(model.nodes);
      const partition = partitionDofs(model, dofMap);
      const loads = buildLoadVector(model, dofMap);

      const Kff = submatrix(solution.globalStiffness, partition.free, partition.free);
      const Uf = partition.free.map((dof) => solution.displacements[dof]!);
      const Ff = partition.free.map((dof) => loads[dof]!);

      // With a prescribed movement the right-hand side carries the K_fr * U_r
      // term as well, so compare against F_f minus that.
      const Kfr = submatrix(solution.globalStiffness, partition.free, partition.restrained);
      const Ur = partition.restrained.map((dof) => partition.prescribed[dof]!);
      const settlement = multiplyMatrixVector(Kfr, Ur);

      const KU = multiplyMatrixVector(Kff, Uf);
      const residual = KU.map((value, index) => value - (Ff[index]! - settlement[index]!));

      const scale = Math.max(...KU.map(Math.abs), ...Ff.map(Math.abs), 1);
      const worst = Math.max(...residual.map(Math.abs));

      expect(worst / scale, `${name}: relative residual`).toBeLessThan(1e-12);
    }
  });

  it('stays accurate when the frame mixes sections a million to one', () => {
    // Stiff columns against a hair-thin beam. The reduced matrix is badly
    // conditioned, which is exactly when a naive solve drifts.
    const model = stressCases()['inertias mixed a million to one']!;
    const solution = solveFrame(model);

    expect(solution.displacements.every(Number.isFinite)).toBe(true);

    const applied = model.loads.reduce(
      (sum, load) => ({ fx: sum.fx + load.fx, fy: sum.fy + load.fy }),
      { fx: 0, fy: 0 },
    );
    const reacted = solution.reactions.reduce(
      (sum, r) => ({ fx: sum.fx + r.fx, fy: sum.fy + r.fy }),
      { fx: 0, fy: 0 },
    );

    const scale = Math.max(Math.abs(applied.fx), Math.abs(applied.fy), 1);
    expect(Math.abs(reacted.fx + applied.fx) / scale).toBeLessThan(1e-12);
    expect(Math.abs(reacted.fy + applied.fy) / scale).toBeLessThan(1e-12);
  });

  it('still refuses a genuine mechanism rather than returning noise', () => {
    // The flip side of tolerating bad conditioning: rank deficiency must not
    // slip through as a very ill-conditioned but "solvable" system.
    expect(() =>
      solveFrame({
        nodes: [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 4, y: 0 },
        ],
        elements: [{ id: 1, from: 1, to: 2, E, A: 6e-3, I: 8e-5 }],
        supports: [{ node: 1, restrainX: true, restrainY: false, restrainRz: false }],
        loads: [{ node: 2, fx: 0, fy: -10, mz: 0 }],
      }),
    ).toThrowError();
  });
});

// ---------------------------------------------------------------------------
// 3. Per-member equilibrium of the internal forces
// ---------------------------------------------------------------------------

describe('3. every member is individually in equilibrium', () => {
  it('closes force and moment for each bar of every model', () => {
    for (const [name, model] of Object.entries(stressCases())) {
      const solution = solveFrame(model);

      for (const element of solution.elements) {
        const [Ni, Vi, Mi, Nj, Vj, Mj] = element.endForces.local;
        const L = element.geometry.length;
        const scale = Math.max(Math.abs(Ni), Math.abs(Vi), Math.abs(Nj), Math.abs(Vj), 1);

        const label = `${name}, e${element.elementId}`;
        expect(Math.abs(Ni + Nj) / scale, `${label}: axial`).toBeLessThan(1e-12);
        expect(Math.abs(Vi + Vj) / scale, `${label}: shear`).toBeLessThan(1e-12);
        // Moments about end i: both end moments plus the shear at end j acting
        // a distance L away.
        expect(
          Math.abs(Mi + Mj + Vj * L) / Math.max(scale * L, 1),
          `${label}: moment`,
        ).toBeLessThan(1e-12);
      }
    }
  });

  it('keeps the axial force consistent between its two ends', () => {
    // axialForce is reported as the value at end j; end i must mirror it.
    for (const model of Object.values(stressCases())) {
      for (const element of solveFrame(model).elements) {
        const { axialForce, axialI, axialJ } = element.endForces;
        expect(axialForce).toBe(axialJ);
        const scale = Math.max(Math.abs(axialForce), 1);
        expect(Math.abs(axialI + axialForce) / scale).toBeLessThan(1e-12);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Exact zeros, not residues
// ---------------------------------------------------------------------------

describe('4. quantities that are zero in theory are zero on screen', () => {
  it('reports no reaction component at an unrestrained degree of freedom', () => {
    const solution = solveFrame(stressCases()['portal, fixed and pinned bases']!);
    const pinned = solution.reactions.find((r) => r.node === 4)!;

    // Built by construction, not by rounding: extractReactions only writes the
    // components that are actually restrained, so a released rotation stays at
    // the integer zero it was initialised with.
    expect(Object.is(pinned.mz, 0)).toBe(true);
    expect(formatNumber(pinned.mz)).toBe('0');
  });

  it('omits nodes with no support entirely, so the table shows a dash', () => {
    const model = stressCases()['portal, fixed and pinned bases']!;
    const solution = solveFrame(model);
    const supported = new Set(model.supports.map((s) => s.node));

    for (const node of model.nodes) {
      const reported = solution.reactions.some((r) => r.node === node.id);
      expect(reported).toBe(supported.has(node.id));
    }
  });

  it('holds restrained displacements at exactly their prescribed value', () => {
    const solution = solveFrame(stressCases()['support settlement']!);
    const fixed = solution.nodalDisplacements.find((d) => d.node === 1)!;
    const settled = solution.nodalDisplacements.find((d) => d.node === 2)!;

    expect(Object.is(fixed.ux, 0)).toBe(true);
    expect(Object.is(fixed.uy, 0)).toBe(true);
    expect(Object.is(fixed.rz, 0)).toBe(true);
    expect(settled.uy).toBe(-0.015);
  });

  it('leaves the axial answer exactly zero when nothing loads it axially', () => {
    // A horizontal beam under vertical load only: the axial sub-problem is
    // untouched, so every horizontal displacement and reaction is the integer
    // zero — no 1e-14 residue to round away later.
    const solution = solveFrame(stressCases()['horizontal beam, vertical load only']!);

    for (const displacement of solution.nodalDisplacements) {
      expect(Object.is(displacement.ux, 0)).toBe(true);
    }
    for (const reaction of solution.reactions) {
      expect(Object.is(reaction.fx, 0)).toBe(true);
      expect(formatNumber(reaction.fx)).toBe('0');
    }
  });

  it('produces exact zeros even when symmetry and bad conditioning combine', () => {
    // The adversarial case: a symmetric structure whose answer contains true
    // zeros, built from sections a million to one apart so cancellation noise
    // is amplified as far as it will go.
    const solution = solveFrame(stressCases()['symmetric and badly conditioned']!);
    const crown = solution.nodalDisplacements.find((d) => d.node === 3)!;

    expect(Object.is(crown.ux, 0)).toBe(true);
    expect(Object.is(crown.rz, 0)).toBe(true);
    expect(formatDisplacement(crown.rz)).toBe('0');
    expect(solution.reactions.reduce((sum, r) => sum + r.fx, 0)).toBe(0);
  });

  it('never prints a residue in place of a number', () => {
    // Whatever survives the exact-zero paths still has to render as something
    // a reader can act on: either a real figure or a plain "0".
    for (const model of Object.values(stressCases())) {
      const solution = solveFrame(model);
      for (const d of solution.nodalDisplacements) {
        for (const value of [d.ux, d.uy, d.rz]) {
          const shown = formatDisplacement(value);
          expect(shown).not.toMatch(/× 10⁻¹[3-9]/);
          expect(shown).not.toMatch(/× 10⁻[2-9]\d/);
        }
      }
      for (const r of solution.reactions) {
        for (const value of [r.fx, r.fy, r.mz]) {
          const shown = formatNumber(value);
          expect(shown).not.toMatch(/× 10⁻¹[3-9]/);
          expect(shown).not.toMatch(/× 10⁻[2-9]\d/);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Models chosen to stress the arithmetic rather than to be realistic. */
function stressCases(): Record<string, FrameModel> {
  const steel = { E, A: 6e-3, I: 8e-5 };

  return {
    'portal, fixed and pinned bases': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 0, y: 4 },
        { id: 3, x: 6, y: 4 },
        { id: 4, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, ...steel },
        { id: 2, from: 2, to: 3, ...steel },
        { id: 3, from: 3, to: 4, ...steel },
      ],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 4, restrainX: true, restrainY: true, restrainRz: false },
      ],
      loads: [
        { node: 2, fx: 30, fy: 0, mz: 0 },
        { node: 3, fx: 0, fy: 0, mz: -20 },
      ],
    },

    'inertias mixed a million to one': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 0, y: 4 },
        { id: 3, x: 6, y: 4 },
        { id: 4, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, E, A: 1e-1, I: 1e-1 },
        { id: 2, from: 2, to: 3, E, A: 1e-4, I: 1e-7 },
        { id: 3, from: 3, to: 4, E, A: 1e-1, I: 1e-1 },
      ],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 4, restrainX: true, restrainY: true, restrainRz: true },
      ],
      loads: [{ node: 2, fx: 30, fy: -10, mz: 0 }],
    },

    'symmetric and badly conditioned': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 0, y: 4 },
        { id: 3, x: 3, y: 4 },
        { id: 4, x: 6, y: 4 },
        { id: 5, x: 6, y: 0 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, E, A: 2e-1, I: 5e-2 },
        { id: 2, from: 2, to: 3, E, A: 1e-4, I: 2e-8 },
        { id: 3, from: 3, to: 4, E, A: 1e-4, I: 2e-8 },
        { id: 4, from: 4, to: 5, E, A: 2e-1, I: 5e-2 },
      ],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 5, restrainX: true, restrainY: true, restrainRz: true },
      ],
      loads: [{ node: 3, fx: 0, fy: -40, mz: 0 }],
    },

    'extremely slender member': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 40, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, E, A: 5e-2, I: 1e-9 }],
      supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [{ node: 2, fx: 0, fy: -0.5, mz: 0 }],
    },

    'horizontal beam, vertical load only': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 2.5, y: 0 },
        { id: 3, x: 7, y: 0 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, ...steel },
        { id: 2, from: 2, to: 3, E, A: 9e-3, I: 3e-4 },
      ],
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 3, restrainX: true, restrainY: true, restrainRz: true },
      ],
      loads: [{ node: 2, fx: 0, fy: -33, mz: 0 }],
    },

    'support settlement': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 6, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, ...steel }],
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

    'many members meeting at one node': {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: 3, y: 0 },
        { id: 3, x: 0, y: 3 },
        { id: 4, x: -3, y: 0 },
        { id: 5, x: 2, y: -2 },
      ],
      elements: [
        { id: 1, from: 1, to: 2, ...steel },
        { id: 2, from: 1, to: 3, ...steel },
        { id: 3, from: 1, to: 4, ...steel },
        { id: 4, from: 1, to: 5, ...steel },
      ],
      supports: [
        { node: 2, restrainX: true, restrainY: true, restrainRz: true },
        { node: 4, restrainX: true, restrainY: true, restrainRz: true },
        { node: 5, restrainX: true, restrainY: true, restrainRz: false },
      ],
      loads: [
        { node: 1, fx: 14, fy: -22, mz: 9 },
        { node: 3, fx: -6, fy: 0, mz: 0 },
      ],
    },
  };
}
