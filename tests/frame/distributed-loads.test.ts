/**
 * Distributed span loads: fixed-end forces, superposition and V(x)/M(x).
 *
 * ---------------------------------------------------------------------------
 * What these tests are actually guarding
 * ---------------------------------------------------------------------------
 * Span loads reach the system as equivalent nodal loads, and the member end
 * forces only come out right if the fixed-end vector is added BACK during
 * recovery. Omit that second step and the model still solves: the
 * displacements are right, the reactions are right, and only the member
 * actions are wrong.
 *
 * On a fully clamped member the omission is total — every nodal DOF is zero,
 * so `k*T*u` vanishes and the end moments come out as exactly 0.000 instead of
 * wL²/12. Nothing throws, nothing looks odd, and a student reading the table
 * has no way to know. That is why the clamped beam leads this file.
 *
 * The values on the right-hand side are the closed-form results of beam
 * theory, not numbers this engine produced. They are the reason the test is
 * worth anything.
 */

import { describe, expect, it } from 'vitest';

import { solveFrame } from '../../src/lib/frame';
import { internalForcesAt, shearZeroStations } from '../../src/lib/frame/postprocess';
import type { DistributedLoad, FrameModel } from '../../src/types/frame';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Section and material shared by every case, in kN and m. */
const E = 200_000_000; // kN/m^2  (200 GPa)
const A = 0.01; // m^2
const I = 1e-4; // m^4

/** Span of the single-member beams. */
const L = 6;

/** Downward uniform intensity, kN/m. Positive number, applied as -wy. */
const w = 12;

/**
 * A horizontal beam from (0,0) to (L,0) as a single member, with the supports
 * left to the caller. Horizontal on purpose: local +x is then global +x and
 * local +y is global +y, so a downward load is a pure transverse load and the
 * expected values are the textbook ones with no rotation in the way.
 */
function beam(
  restrainRzAtEnds: boolean,
  loads: readonly DistributedLoad[],
  options: { readonly pinnedRight?: boolean } = {},
): FrameModel {
  return {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: L, y: 0 },
    ],
    elements: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: restrainRzAtEnds },
      {
        node: 2,
        // The right-hand support never restrains X: a beam pinned at both ends
        // along its own axis is axially over-restrained, and the axial force
        // that produces has nothing to do with bending.
        restrainX: false,
        restrainY: true,
        restrainRz: options.pinnedRight === true ? false : restrainRzAtEnds,
      },
    ],
    loads: [],
    distributedLoads: loads,
  };
}

/** A full-span uniform downward load of intensity `intensity` on element 1. */
function uniformDown(intensity: number): DistributedLoad {
  return { id: 1, element: 1, wxI: 0, wyI: -intensity, wxJ: 0, wyJ: -intensity };
}

/** A triangular downward load, zero at end i and `intensity` at end j. */
function triangularDown(intensity: number): DistributedLoad {
  return { id: 1, element: 1, wxI: 0, wyI: 0, wxJ: 0, wyJ: -intensity };
}

/** The single element result of a solved single-member model. */
function onlyElement(model: FrameModel) {
  const solution = solveFrame(model);
  const element = solution.elements[0];
  if (element === undefined) throw new Error('the model has no elements');
  return { solution, element };
}

// ---------------------------------------------------------------------------

describe('fixed-fixed beam under a uniform load', () => {
  const { solution, element } = onlyElement(beam(true, [uniformDown(w)]));

  it('leaves every nodal degree of freedom at zero', () => {
    // The whole point of the case: there is nothing for `k*T*u` to contribute,
    // so the end forces below can only come from the fixed-end vector.
    for (const displacement of solution.nodalDisplacements) {
      expect(displacement.ux).toBeCloseTo(0, 12);
      expect(displacement.uy).toBeCloseTo(0, 12);
      expect(displacement.rz).toBeCloseTo(0, 12);
    }
  });

  it('produces end moments of wL²/12', () => {
    const expected = (w * L * L) / 12;
    // Hogging at both ends, and the two end actions carry opposite signs
    // because they are measured about the same local axis at opposite faces.
    expect(Math.abs(element.endForces.momentI)).toBeCloseTo(expected, 9);
    expect(Math.abs(element.endForces.momentJ)).toBeCloseTo(expected, 9);
    expect(Math.sign(element.endForces.momentI)).toBe(-Math.sign(element.endForces.momentJ));
  });

  it('produces end shears of wL/2', () => {
    expect(Math.abs(element.endForces.shearI)).toBeCloseTo((w * L) / 2, 9);
    expect(Math.abs(element.endForces.shearJ)).toBeCloseTo((w * L) / 2, 9);
  });

  it('carries a sagging midspan moment of wL²/24', () => {
    const mid = internalForcesAt(element, L / 2);
    expect(mid.moment).toBeCloseTo((w * L * L) / 24, 9);
  });

  it('hogs by wL²/12 at both ends of the diagram', () => {
    expect(internalForcesAt(element, 0).moment).toBeCloseTo(-(w * L * L) / 12, 9);
    expect(internalForcesAt(element, L).moment).toBeCloseTo(-(w * L * L) / 12, 9);
  });

  it('crosses zero shear at midspan', () => {
    expect(internalForcesAt(element, L / 2).shear).toBeCloseTo(0, 9);
    expect(shearZeroStations(element)).toEqual([expect.closeTo(L / 2, 9)]);
  });

  it('balances the total applied load with the reactions', () => {
    const totalUp = solution.reactions.reduce((sum, reaction) => sum + reaction.fy, 0);
    expect(totalUp).toBeCloseTo(w * L, 9);
  });
});

describe('simply supported beam under a uniform load', () => {
  const { solution, element } = onlyElement(beam(false, [uniformDown(w)]));

  it('has no moment at either end', () => {
    expect(element.endForces.momentI).toBeCloseTo(0, 9);
    expect(element.endForces.momentJ).toBeCloseTo(0, 9);
  });

  it('reaches wL²/8 at midspan', () => {
    expect(internalForcesAt(element, L / 2).moment).toBeCloseTo((w * L * L) / 8, 9);
  });

  it('deflects by 5wL⁴/384EI at midspan', () => {
    // Read from the rotation-free midspan of the analytical solution rather
    // than from a node, since the model has no node there: the check is that
    // the END ROTATIONS match wL³/24EI, which is the same statement about the
    // same closed-form solution and is available from the nodal results.
    const expectedRotation = (w * L * L * L) / (24 * E * I);
    const [start, end] = solution.nodalDisplacements;
    expect(Math.abs(start?.rz ?? 0)).toBeCloseTo(expectedRotation, 9);
    expect(Math.abs(end?.rz ?? 0)).toBeCloseTo(expectedRotation, 9);
  });

  it('balances the total applied load with the reactions', () => {
    const totalUp = solution.reactions.reduce((sum, reaction) => sum + reaction.fy, 0);
    expect(totalUp).toBeCloseTo(w * L, 9);
  });
});

describe('propped cantilever under a uniform load', () => {
  // Fixed at end i, vertically supported and free to rotate at end j.
  const { element } = onlyElement(beam(true, [uniformDown(w)], { pinnedRight: true }));

  it('produces wL²/8 at the fixed end', () => {
    expect(Math.abs(element.endForces.momentI)).toBeCloseTo((w * L * L) / 8, 9);
  });

  it('produces no moment at the propped end', () => {
    expect(element.endForces.momentJ).toBeCloseTo(0, 9);
  });

  it('reports the sagging peak where the shear crosses zero', () => {
    const stations = shearZeroStations(element);
    expect(stations).toHaveLength(1);
    // Closed form: the shear vanishes at 5L/8 from the propped end, i.e. 3L/8
    // from the fixed one, where the sagging moment reaches 9wL²/128.
    expect(stations[0]).toBeCloseTo((5 * L) / 8, 9);
    expect(internalForcesAt(element, stations[0] as number).moment).toBeCloseTo(
      (9 * w * L * L) / 128,
      9,
    );
  });
});

describe('fixed-fixed beam under a triangular load', () => {
  const { solution, element } = onlyElement(beam(true, [triangularDown(w)]));

  it('splits the reactions 3wL/20 and 7wL/20', () => {
    const [start, end] = solution.reactions;
    expect(start?.fy).toBeCloseTo((3 * w * L) / 20, 9);
    expect(end?.fy).toBeCloseTo((7 * w * L) / 20, 9);
    // The two must still add up to the total load, wL/2.
    expect((start?.fy ?? 0) + (end?.fy ?? 0)).toBeCloseTo((w * L) / 2, 9);
  });

  it('produces end moments of wL²/30 and wL²/20', () => {
    expect(Math.abs(element.endForces.momentI)).toBeCloseTo((w * L * L) / 30, 9);
    expect(Math.abs(element.endForces.momentJ)).toBeCloseTo((w * L * L) / 20, 9);
  });
});

describe('trapezoidal loads', () => {
  it('equal the superposition of a rectangle and a triangle', () => {
    const w1 = 5;
    const w2 = 14;

    // One trapezoidal load...
    const single = onlyElement(
      beam(true, [{ id: 1, element: 1, wxI: 0, wyI: -w1, wxJ: 0, wyJ: -w2 }]),
    );

    // ...against a rectangle of w1 plus a triangle rising to (w2 - w1).
    const superposed = onlyElement(
      beam(true, [
        { id: 1, element: 1, wxI: 0, wyI: -w1, wxJ: 0, wyJ: -w1 },
        { id: 2, element: 1, wxI: 0, wyI: 0, wxJ: 0, wyJ: -(w2 - w1) },
      ]),
    );

    for (let index = 0; index < 6; index++) {
      expect(single.element.endForces.local[index]).toBeCloseTo(
        superposed.element.endForces.local[index] as number,
        9,
      );
    }
  });

  it('put the shear extrema inside the span', () => {
    const { element } = onlyElement(
      beam(false, [{ id: 1, element: 1, wxI: 0, wyI: -4, wxJ: 0, wyJ: -20 }]),
    );
    const stations = shearZeroStations(element);
    expect(stations.length).toBeGreaterThanOrEqual(1);
    for (const x of stations) {
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(L);
      expect(internalForcesAt(element, x).shear).toBeCloseTo(0, 9);
    }
  });
});

describe('an inclined member under gravity', () => {
  /**
   * The case decision (a) bought: a GLOBAL load on an inclined member has a
   * component along the member, so the axial force varies along the span
   * instead of being constant.
   */
  const inclined: FrameModel = {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 4, y: 3 },
    ],
    elements: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
      { node: 2, restrainX: true, restrainY: true, restrainRz: true },
    ],
    loads: [],
    distributedLoads: [{ id: 1, element: 1, wxI: 0, wyI: -w, wxJ: 0, wyJ: -w }],
  };

  const { element } = onlyElement(inclined);

  it('resolves the load into an axial and a transverse component', () => {
    const span = element.spanLoad;
    expect(span).not.toBeNull();
    // Direction cosines of a 3-4-5 member: C = 0.8, S = 0.6.
    // p = C*wx + S*wy = -0.6w ; q = -S*wx + C*wy = -0.8w
    expect(span?.pI).toBeCloseTo(-0.6 * w, 9);
    expect(span?.qI).toBeCloseTo(-0.8 * w, 9);
    expect(span?.pJ).toBeCloseTo(-0.6 * w, 9);
    expect(span?.qJ).toBeCloseTo(-0.8 * w, 9);
  });

  it('gives a different axial force at each end', () => {
    const atI = internalForcesAt(element, 0).axial;
    const atJ = internalForcesAt(element, element.geometry.length).axial;
    expect(atI).not.toBeCloseTo(atJ, 6);
  });

  it('varies the axial force by the total axial load over the span', () => {
    const memberLength = element.geometry.length;
    const atI = internalForcesAt(element, 0).axial;
    const atJ = internalForcesAt(element, memberLength).axial;
    // N(L) - N(0) = -∫p dx = -p*L, with p the constant local axial intensity.
    // The sign is the tension-positive convention, not a quirk: see the note
    // on `internalForcesAt`.
    expect(atJ - atI).toBeCloseTo(-(element.spanLoad?.pI ?? 0) * memberLength, 9);
  });

  it('agrees with the end-force vector at both ends', () => {
    // The strongest available check on the axial sign: N(0) and N(L) must
    // reproduce the two end actions the results table prints, and they only do
    // when the integral is subtracted rather than added.
    expect(internalForcesAt(element, 0).axial).toBeCloseTo(-element.endForces.axialI, 9);
    expect(internalForcesAt(element, element.geometry.length).axial).toBeCloseTo(
      element.endForces.axialJ,
      9,
    );
  });

  it('reports the larger of the two end values as the member axial force', () => {
    const atI = internalForcesAt(element, 0).axial;
    const atJ = internalForcesAt(element, element.geometry.length).axial;
    const larger = Math.abs(atI) > Math.abs(atJ) ? atI : atJ;
    expect(element.endForces.axialForce).toBeCloseTo(larger, 9);
  });
});

describe('models without span loads', () => {
  it('are unaffected by the feature existing', () => {
    const withoutField = beam(true, []);
    const withEmptyArray: FrameModel = { ...withoutField, distributedLoads: [] };
    const { distributedLoads: _omitted, ...noField } = withoutField;

    const a = solveFrame(noField as FrameModel);
    const b = solveFrame(withEmptyArray);

    expect(a.displacements).toEqual(b.displacements);
    expect(a.elements[0]?.endForces.local).toEqual(b.elements[0]?.endForces.local);
    // And the fixed-end vector is exactly zero, not a rounding of it.
    expect(a.elements[0]?.fixedEndForces).toEqual([0, 0, 0, 0, 0, 0]);
    expect(a.elements[0]?.spanLoad).toBeNull();
  });

  it('still reduce V(x) and M(x) to the load-free expressions', () => {
    const model: FrameModel = {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: L, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, E, A, I }],
      supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [{ node: 2, fx: 0, fy: -10, mz: 0 }],
    };
    const { element } = onlyElement(model);

    // A tip-loaded cantilever: constant shear, moment linear from -PL to 0.
    expect(internalForcesAt(element, 0).moment).toBeCloseTo(-10 * L, 9);
    expect(internalForcesAt(element, L).moment).toBeCloseTo(0, 9);
    expect(internalForcesAt(element, L / 2).shear).toBeCloseTo(
      internalForcesAt(element, 0).shear,
      9,
    );
    expect(shearZeroStations(element)).toEqual([]);
  });
});

describe('global equilibrium of a portal frame under span loads', () => {
  /**
   * The strongest integration check available, and the one that fails if any
   * single sign in the chain is wrong: the reactions must balance the applied
   * span loads in all three global equations.
   *
   * The frame is deliberately awkward — a pitched member so the load has an
   * axial component, and loads on three members at once, one of them
   * trapezoidal — because a symmetric portal can balance by accident.
   */
  const portal: FrameModel = {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 4 },
      { id: 3, x: 5, y: 6 },
      { id: 4, x: 8, y: 0 },
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
    loads: [],
    distributedLoads: [
      // Wind on the left column: horizontal, uniform.
      { id: 1, element: 1, wxI: 6, wyI: 0, wxJ: 6, wyJ: 0 },
      // Gravity on the pitched rafter: trapezoidal.
      { id: 2, element: 2, wxI: 0, wyI: -10, wxJ: 0, wyJ: -18 },
      // Gravity on the right column: uniform, so purely axial for that member.
      { id: 3, element: 3, wxI: 0, wyI: -4, wxJ: 0, wyJ: -4 },
    ],
  };

  const solution = solveFrame(portal);

  /** Total applied force and moment about the origin, from the span loads. */
  function appliedTotals() {
    let fx = 0;
    let fy = 0;
    let mz = 0;

    for (const load of portal.distributedLoads ?? []) {
      const element = portal.elements.find((candidate) => candidate.id === load.element);
      if (element === undefined) throw new Error(`element ${load.element} missing`);
      const from = portal.nodes.find((node) => node.id === element.from);
      const to = portal.nodes.find((node) => node.id === element.to);
      if (from === undefined || to === undefined) throw new Error('node missing');

      const length = Math.hypot(to.x - from.x, to.y - from.y);

      // Resultant of a linear intensity, and the centroid it acts through.
      // For w varying from a to b: R = L(a+b)/2 at s = (a + 2b)/(3(a+b)).
      const resultant = (component: number, atJ: number) => (length * (component + atJ)) / 2;
      const centroid = (atI: number, atJ: number) =>
        atI + atJ === 0 ? 0.5 : (atI + 2 * atJ) / (3 * (atI + atJ));

      const rx = resultant(load.wxI, load.wxJ);
      const ry = resultant(load.wyI, load.wyJ);

      const sx = centroid(load.wxI, load.wxJ);
      const sy = centroid(load.wyI, load.wyJ);

      // Each component acts through its own centroid along the member.
      const pointAt = (s: number) => ({
        x: from.x + (to.x - from.x) * s,
        y: from.y + (to.y - from.y) * s,
      });
      const px = pointAt(sx);
      const py = pointAt(sy);

      fx += rx;
      fy += ry;
      // M = x*Fy - y*Fx about the origin, counter-clockwise positive. Each
      // component uses its own centroid, since a load whose x and y parts vary
      // differently does not have a single line of action.
      mz += py.x * ry - px.y * rx;
    }

    return { fx, fy, mz };
  }

  const applied = appliedTotals();

  it('balances the horizontal forces', () => {
    const reacted = solution.reactions.reduce((sum, reaction) => sum + reaction.fx, 0);
    expect(reacted + applied.fx).toBeCloseTo(0, 8);
  });

  it('balances the vertical forces', () => {
    const reacted = solution.reactions.reduce((sum, reaction) => sum + reaction.fy, 0);
    expect(reacted + applied.fy).toBeCloseTo(0, 8);
  });

  it('balances the moments about the origin', () => {
    const reacted = solution.reactions.reduce((sum, reaction) => {
      const node = portal.nodes.find((candidate) => candidate.id === reaction.node);
      if (node === undefined) throw new Error('reaction on a missing node');
      return sum + reaction.mz + node.x * reaction.fy - node.y * reaction.fx;
    }, 0);
    expect(reacted + applied.mz).toBeCloseTo(0, 8);
  });

  it('keeps the bending moment continuous across each rigid joint', () => {
    // At a joint carrying no applied moment, the member end moments meeting
    // there must sum to zero. This is what a wrong fixed-end sign breaks
    // without disturbing global equilibrium.
    const [first, second, third] = solution.elements;
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error('the portal should have three elements');
    }
    expect(first.endForces.momentJ + second.endForces.momentI).toBeCloseTo(0, 8);
    expect(second.endForces.momentJ + third.endForces.momentI).toBeCloseTo(0, 8);
  });
});

describe('validation of span loads', () => {
  it('rejects a load on an element that does not exist', () => {
    const model = beam(true, [{ id: 1, element: 99, wxI: 0, wyI: -w, wxJ: 0, wyJ: -w }]);
    expect(() => solveFrame(model)).toThrowError(/element 99/);
  });

  it('rejects a non-finite intensity', () => {
    const model = beam(true, [
      { id: 1, element: 1, wxI: 0, wyI: Number.NaN, wxJ: 0, wyJ: -w },
    ]);
    expect(() => solveFrame(model)).toThrowError(/wyI/);
  });
});
