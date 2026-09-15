/**
 * End-to-end validation of the plane frame engine.
 *
 * There is no single worked example to check against here, so the engine is
 * validated where the answer is known exactly: the classic beam cases. That
 * is a stronger check than a textbook example, not a weaker one, because a
 * frame element built on cubic shape functions is EXACT for point loads
 * applied at nodes — so any disagreement with the closed-form deflection is a
 * bug, not discretization error.
 *
 *   cantilever, tip load      delta = PL^3/3EI     theta = PL^2/2EI
 *   cantilever, tip moment    delta = ML^2/2EI     theta = ML/EI
 *   simply supported, centre  delta = PL^3/48EI    M_max = PL/4
 *   fixed-fixed, centre       delta = PL^3/192EI   M_end = PL/8
 *
 * Everything else is checked by the invariants any correct solution must
 * satisfy: global equilibrium, continuity of the internal moment across a
 * shared node, and symmetry of the assembled matrix.
 */

import { describe, expect, it } from 'vitest';

import { createDofMap, DOFS_PER_NODE, sequentialElementDofs } from '../../src/lib/frame/dof';
import { FrameError } from '../../src/lib/frame/errors';
import { solveFrame } from '../../src/lib/frame/index';
import type { FrameModel, NodalDisplacement, NodalReaction } from '../../src/types/frame';

/** A steel member: E in kN/m^2, A in m^2, I in m^4. */
const E = 200e6;
const A = 6e-3;
const I = 8e-5;
const EI = E * I;

/** Builds a straight horizontal beam of `spans` equal elements over `length`. */
function straightBeam(length: number, spans: number): Pick<FrameModel, 'nodes' | 'elements'> {
  const step = length / spans;
  return {
    nodes: Array.from({ length: spans + 1 }, (_unused, index) => ({
      id: index + 1,
      x: index * step,
      y: 0,
    })),
    elements: Array.from({ length: spans }, (_unused, index) => ({
      id: index + 1,
      from: index + 1,
      to: index + 2,
      E,
      A,
      I,
    })),
  };
}

function displacementOf(
  displacements: readonly NodalDisplacement[],
  node: number,
): NodalDisplacement {
  const found = displacements.find((entry) => entry.node === node);
  if (found === undefined) throw new Error(`No displacement reported for node ${node}.`);
  return found;
}

function reactionOf(reactions: readonly NodalReaction[], node: number): NodalReaction {
  const found = reactions.find((entry) => entry.node === node);
  if (found === undefined) throw new Error(`No reaction reported for node ${node}.`);
  return found;
}

describe('degree-of-freedom mapping', () => {
  it('gives every node three degrees of freedom', () => {
    const dofMap = createDofMap([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
    ]);

    expect(DOFS_PER_NODE).toBe(3);
    expect(dofMap.size).toBe(9);
    expect(dofMap.nodeDofs(1)).toEqual([0, 1, 2]);
    expect(dofMap.nodeDofs(3)).toEqual([6, 7, 8]);
    expect(dofMap.elementDofs(2, 3)).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('reduces to the textbook formula for consecutive identifiers', () => {
    const dofMap = createDofMap([
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
    ]);
    expect(dofMap.elementDofs(1, 2)).toEqual(sequentialElementDofs(1, 2));
  });

  it('survives a gap in the identifiers', () => {
    // Nodes 1, 3, 4: node 2 was deleted in the UI. The mapping keys off the
    // position in the model, not the identifier.
    const dofMap = createDofMap([
      { id: 1, x: 0, y: 0 },
      { id: 3, x: 1, y: 0 },
      { id: 4, x: 2, y: 0 },
    ]);
    expect(dofMap.nodeDofs(3)).toEqual([3, 4, 5]);
    expect(dofMap.describe(5)).toEqual({ node: 3, component: 'rz' });
  });

  it('labels the third DOF of every node as the rotation', () => {
    const dofMap = createDofMap([{ id: 1, x: 0, y: 0 }]);
    expect(dofMap.describe(0).component).toBe('x');
    expect(dofMap.describe(1).component).toBe('y');
    expect(dofMap.describe(2).component).toBe('rz');
  });
});

describe('cantilever with a tip load', () => {
  const L = 4;
  const P = 12;

  const model: FrameModel = {
    ...straightBeam(L, 2),
    supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
    loads: [{ node: 3, fx: 0, fy: -P, mz: 0 }],
  };

  const solution = solveFrame(model);

  it('assembles a 3n x 3n matrix', () => {
    expect(solution.globalStiffness.length).toBe(9);
    expect(solution.globalStiffness[0]!.length).toBe(9);
  });

  it('keeps the global matrix symmetric', () => {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        expect(solution.globalStiffness[r]![c]).toBeCloseTo(
          solution.globalStiffness[c]![r]!,
          9,
        );
      }
    }
  });

  it('matches the closed-form tip deflection and rotation', () => {
    const tip = displacementOf(solution.nodalDisplacements, 3);
    expect(tip.uy).toBeCloseTo(-(P * L ** 3) / (3 * EI), 10);
    expect(tip.rz).toBeCloseTo(-(P * L ** 2) / (2 * EI), 10);
    expect(tip.ux).toBeCloseTo(0, 12);
  });

  it('returns the fixed-end reactions, moment included', () => {
    const base = reactionOf(solution.reactions, 1);
    expect(base.fx).toBeCloseTo(0, 8);
    expect(base.fy).toBeCloseTo(P, 8);
    expect(base.mz).toBeCloseTo(P * L, 8);
  });

  it('reports axial, shear and bending at both ends of every member', () => {
    const [first, second] = solution.elements;

    expect(first!.endForces.shearI).toBeCloseTo(P, 8);
    expect(first!.endForces.momentI).toBeCloseTo(P * L, 8);
    // The internal moment is continuous across the shared node: what member 1
    // hands over at its end j, member 2 picks up at its end i.
    expect(first!.endForces.momentJ).toBeCloseTo(-second!.endForces.momentI, 8);
    // Nothing is left over at the free end.
    expect(second!.endForces.momentJ).toBeCloseTo(0, 8);
    expect(second!.endForces.axialForce).toBeCloseTo(0, 8);
    expect(second!.state).toBe('zero');
  });

  it('exposes the local matrix and the transformation for the viewer', () => {
    const [first] = solution.elements;
    expect(first!.localStiffness.length).toBe(6);
    expect(first!.transformation.length).toBe(6);
    expect(first!.stiffness.length).toBe(6);
    // A horizontal member: T is the identity.
    expect(first!.transformation[0]![0]).toBeCloseTo(1, 12);
    expect(first!.transformation[2]![2]).toBe(1);
  });
});

describe('cantilever with a tip moment', () => {
  const L = 4;
  const M = 25;

  const solution = solveFrame({
    ...straightBeam(L, 2),
    supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
    loads: [{ node: 3, fx: 0, fy: 0, mz: M }],
  });

  it('applies the nodal moment to the rotational DOF', () => {
    const tip = displacementOf(solution.nodalDisplacements, 3);
    expect(tip.rz).toBeCloseTo((M * L) / EI, 10);
    expect(tip.uy).toBeCloseTo((M * L ** 2) / (2 * EI), 10);
  });

  it('balances it with a support moment and no support force', () => {
    const base = reactionOf(solution.reactions, 1);
    expect(base.fy).toBeCloseTo(0, 8);
    expect(base.mz).toBeCloseTo(-M, 8);
  });
});

describe('simply supported beam with a central load', () => {
  const L = 6;
  const P = 20;

  const solution = solveFrame({
    ...straightBeam(L, 2),
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: false },
      { node: 3, restrainX: false, restrainY: true, restrainRz: false },
    ],
    loads: [{ node: 2, fx: 0, fy: -P, mz: 0 }],
  });

  it('matches the closed-form central deflection', () => {
    const centre = displacementOf(solution.nodalDisplacements, 2);
    expect(centre.uy).toBeCloseTo(-(P * L ** 3) / (48 * EI), 10);
    // A pinned support rotates: this is what a truss model could not express.
    expect(displacementOf(solution.nodalDisplacements, 1).rz).toBeCloseTo(
      -(P * L ** 2) / (16 * EI),
      10,
    );
  });

  it('splits the load evenly and carries no moment at the supports', () => {
    expect(reactionOf(solution.reactions, 1).fy).toBeCloseTo(P / 2, 8);
    expect(reactionOf(solution.reactions, 3).fy).toBeCloseTo(P / 2, 8);
    expect(reactionOf(solution.reactions, 1).mz).toBe(0);
  });

  it('reports the maximum bending moment at midspan', () => {
    const [first] = solution.elements;
    expect(Math.abs(first!.endForces.momentJ)).toBeCloseTo((P * L) / 4, 8);
    expect(first!.endForces.momentI).toBeCloseTo(0, 8);
  });
});

describe('fixed-fixed beam with a central load', () => {
  const L = 6;
  const P = 20;

  const solution = solveFrame({
    ...straightBeam(L, 2),
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
      { node: 3, restrainX: true, restrainY: true, restrainRz: true },
    ],
    loads: [{ node: 2, fx: 0, fy: -P, mz: 0 }],
  });

  it('matches the closed-form central deflection', () => {
    expect(displacementOf(solution.nodalDisplacements, 2).uy).toBeCloseTo(
      -(P * L ** 3) / (192 * EI),
      10,
    );
    expect(displacementOf(solution.nodalDisplacements, 2).rz).toBeCloseTo(0, 10);
  });

  it('produces end moments of PL/8, equal and opposite', () => {
    const left = reactionOf(solution.reactions, 1);
    const right = reactionOf(solution.reactions, 3);

    expect(Math.abs(left.mz)).toBeCloseTo((P * L) / 8, 8);
    expect(left.mz).toBeCloseTo(-right.mz, 8);
    expect(left.fy).toBeCloseTo(P / 2, 8);
    expect(right.fy).toBeCloseTo(P / 2, 8);
  });
});

describe('portal frame under a lateral load', () => {
  const H = 4;
  const B = 6;
  const P = 20;

  const model: FrameModel = {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: H },
      { id: 3, x: B, y: H },
      { id: 4, x: B, y: 0 },
    ],
    elements: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
      { id: 3, from: 3, to: 4, E, A, I },
    ],
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
      { node: 4, restrainX: true, restrainY: true, restrainRz: true },
    ],
    loads: [{ node: 2, fx: P, fy: 0, mz: 0 }],
  };

  const solution = solveFrame(model);

  it('solves a 12 x 12 system', () => {
    expect(solution.globalStiffness.length).toBe(12);
    expect(solution.freeDofs.length).toBe(6);
    expect(solution.reducedStiffness.length).toBe(6);
  });

  it('satisfies global force equilibrium', () => {
    const total = solution.reactions.reduce(
      (sum, reaction) => ({ fx: sum.fx + reaction.fx, fy: sum.fy + reaction.fy }),
      { fx: 0, fy: 0 },
    );
    expect(total.fx).toBeCloseTo(-P, 8);
    expect(total.fy).toBeCloseTo(0, 8);
  });

  it('satisfies global moment equilibrium about the origin', () => {
    const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

    const fromReactions = solution.reactions.reduce((sum, reaction) => {
      const node = nodeById.get(reaction.node)!;
      return sum + node.x * reaction.fy - node.y * reaction.fx + reaction.mz;
    }, 0);

    const fromLoads = model.loads.reduce((sum, load) => {
      const node = nodeById.get(load.node)!;
      return sum + node.x * load.fy - node.y * load.fx + load.mz;
    }, 0);

    expect(fromReactions + fromLoads).toBeCloseTo(0, 6);
  });

  it('sways sideways, and the two column tops differ by the beam elongation', () => {
    const left = displacementOf(solution.nodalDisplacements, 2);
    const right = displacementOf(solution.nodalDisplacements, 3);
    expect(left.ux).toBeGreaterThan(0);

    // The column tops do NOT move together: the beam is axially flexible, so
    // it stretches by NL/EA under the axial force it carries. Checking that
    // relation exercises the axial and the bending halves of the element
    // matrix against each other.
    const beam = solution.elements[1]!;
    expect(right.ux - left.ux).toBeCloseTo((beam.endForces.axialForce * B) / (E * A), 12);
  });

  it('puts one column into tension and the other into compression', () => {
    // The overturning couple: the lateral load lifts the windward column and
    // pushes the leeward one down.
    const [leftColumn, , rightColumn] = solution.elements;
    expect(leftColumn!.state).not.toBe('zero');
    expect(Math.sign(leftColumn!.endForces.axialForce)).toBe(
      -Math.sign(rightColumn!.endForces.axialForce),
    );
  });
});

describe('invariance under a rigid rotation of the whole model', () => {
  // Every closed-form case above uses horizontal members, where T is the
  // identity and a wrong transformation would go unnoticed. Rotating the
  // entire structure, load included, must rotate the answer and change
  // nothing else.
  const L = 4;
  const P = 12;
  const alpha = (37 * Math.PI) / 180;
  const cos = Math.cos(alpha);
  const sin = Math.sin(alpha);

  const horizontal = solveFrame({
    ...straightBeam(L, 2),
    supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
    loads: [{ node: 3, fx: 0, fy: -P, mz: 0 }],
  });

  const rotated = solveFrame({
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: (L / 2) * cos, y: (L / 2) * sin },
      { id: 3, x: L * cos, y: L * sin },
    ],
    elements: [
      { id: 1, from: 1, to: 2, E, A, I },
      { id: 2, from: 2, to: 3, E, A, I },
    ],
    supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
    // The same load, rotated with the structure.
    loads: [{ node: 3, fx: P * sin, fy: -P * cos, mz: 0 }],
  });

  it('rotates the tip displacement and leaves the rotation untouched', () => {
    const flat = displacementOf(horizontal.nodalDisplacements, 3);
    const tilted = displacementOf(rotated.nodalDisplacements, 3);

    expect(tilted.ux).toBeCloseTo(flat.ux * cos - flat.uy * sin, 10);
    expect(tilted.uy).toBeCloseTo(flat.ux * sin + flat.uy * cos, 10);
    expect(tilted.rz).toBeCloseTo(flat.rz, 10);
  });

  it('leaves the local end forces of every member unchanged', () => {
    horizontal.elements.forEach((flat, index) => {
      const tilted = rotated.elements[index]!;
      expect(tilted.endForces.axialI).toBeCloseTo(flat.endForces.axialI, 8);
      expect(tilted.endForces.shearI).toBeCloseTo(flat.endForces.shearI, 8);
      expect(tilted.endForces.momentI).toBeCloseTo(flat.endForces.momentI, 8);
      expect(tilted.endForces.momentJ).toBeCloseTo(flat.endForces.momentJ, 8);
    });
  });

  it('rotates the reaction force and preserves the reaction moment', () => {
    const flat = reactionOf(horizontal.reactions, 1);
    const tilted = reactionOf(rotated.reactions, 1);

    expect(tilted.fx).toBeCloseTo(flat.fx * cos - flat.fy * sin, 8);
    expect(tilted.fy).toBeCloseTo(flat.fx * sin + flat.fy * cos, 8);
    expect(tilted.mz).toBeCloseTo(flat.mz, 8);
  });
});

describe('prescribed support movement', () => {
  const L = 6;
  const settlement = -0.01;

  const solution = solveFrame({
    ...straightBeam(L, 2),
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
      {
        node: 3,
        restrainX: true,
        restrainY: true,
        restrainRz: true,
        settlement: { dy: settlement },
      },
    ],
    loads: [],
  });

  it('honours the prescribed value at the restrained DOF', () => {
    expect(displacementOf(solution.nodalDisplacements, 3).uy).toBe(settlement);
  });

  it('develops the 6EI*delta/L^2 end moments of a settling fixed-fixed beam', () => {
    const expected = (6 * EI * Math.abs(settlement)) / L ** 2;
    expect(Math.abs(reactionOf(solution.reactions, 1).mz)).toBeCloseTo(expected, 6);
    expect(Math.abs(reactionOf(solution.reactions, 3).mz)).toBeCloseTo(expected, 6);
  });
});

describe('reactions at a loaded support', () => {
  it('excludes the load applied directly at the restrained DOF', () => {
    const M = 15;
    const solution = solveFrame({
      ...straightBeam(4, 1),
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 2, restrainX: true, restrainY: true, restrainRz: true },
      ],
      loads: [{ node: 2, fx: 0, fy: 0, mz: M }],
    });

    // Everything is restrained, so nothing moves and K*U is zero. The support
    // still has to supply -M to balance the applied moment; reporting K*U
    // alone would report zero and lose it.
    expect(solution.displacements.every((value) => value === 0)).toBe(true);
    expect(reactionOf(solution.reactions, 2).mz).toBeCloseTo(-M, 10);
  });
});

describe('rejected models', () => {
  const base = straightBeam(4, 1);
  const supports = [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }];

  it('rejects a member with no second moment of area', () => {
    expect.assertions(2);
    try {
      solveFrame({
        ...base,
        elements: [{ id: 1, from: 1, to: 2, E, A, I: 0 }],
        supports,
        loads: [],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(FrameError);
      expect((error as FrameError).code).toBe('INVALID_SECTION');
    }
  });

  it('rejects a model with no supports at all', () => {
    expect.assertions(1);
    try {
      solveFrame({ ...base, supports: [], loads: [] });
    } catch (error) {
      expect((error as FrameError).code).toBe('NO_SUPPORTS');
    }
  });

  it('rejects a mechanism rather than returning meaningless numbers', () => {
    expect.assertions(1);
    try {
      // Only the horizontal translation of one node is held: the beam is free
      // to drop and to spin.
      solveFrame({
        ...base,
        supports: [{ node: 1, restrainX: true, restrainY: false, restrainRz: false }],
        loads: [{ node: 2, fx: 0, fy: -10, mz: 0 }],
      });
    } catch (error) {
      expect((error as FrameError).code).toBe('SINGULAR_STIFFNESS');
    }
  });

  it('rejects an inclined support instead of ignoring it', () => {
    expect.assertions(1);
    try {
      solveFrame({
        ...base,
        supports: [
          { node: 1, restrainX: true, restrainY: true, restrainRz: true, inclinationDeg: 30 },
        ],
        loads: [],
      });
    } catch (error) {
      expect((error as FrameError).code).toBe('UNSUPPORTED_FEATURE');
    }
  });
});
