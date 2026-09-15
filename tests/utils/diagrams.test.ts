/**
 * Tests for the internal-force diagrams.
 *
 * The failure mode this file exists to catch is the quiet one. A diagram drawn
 * with the wrong sign at end i, or extruded about the global axis instead of
 * the member's own, still looks like a diagram — it is plausible, it is
 * labelled, and a student has no way to know it is wrong. So the assertions
 * here are about the convention itself rather than about pixels:
 *
 *   - the ordinate at end i is MINUS the end moment printed in the table,
 *   - the extrusion is perpendicular to the member, not to the page,
 *   - a sagging moment lands on the tension side,
 *   - and, on a real solved frame, the diagram jumps by exactly the applied
 *     moment where one acts and closes to zero at the joint that gathers
 *     three members and carries none.
 *
 * That last pair is the strongest evidence available that the sign convention
 * is right: both are consequences of joint equilibrium, and neither survives a
 * flipped sign anywhere in the chain — including inside the fixed-end forces,
 * which is why the preset carries span loads on two of its members.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLE_FRAME } from '../../src/data/example-frame';
import { solveFrame } from '../../src/lib/frame';
import type { Vec6 } from '../../src/types/frame';
import {
  diagramOrdinatePoint,
  diagramPlotSign,
  isDiagramMode,
  memberDiagramLobes,
  memberDiagramSamples,
  memberDiagramSamplesFor,
  peakOrdinate,
  splitBySign,
  suggestDiagramScale,
} from '../../src/utils/diagrams';

/** [N_i, V_i, M_i, N_j, V_j, M_j] — the order every module here assumes. */
const END_FORCES: Vec6 = [-10, 4, 6, 10, -4, 10];

const HORIZONTAL = { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } };

describe('isDiagramMode', () => {
  it('separates the geometry view from the three force diagrams', () => {
    expect(isDiagramMode('geometry')).toBe(false);
    expect(isDiagramMode('axial')).toBe(true);
    expect(isDiagramMode('shear')).toBe(true);
    expect(isDiagramMode('moment')).toBe(true);
  });
});

describe('memberDiagramSamples', () => {
  it('reads the axial force at end j, so tension is positive', () => {
    // f[0] and f[3] are equal and opposite; taking f[0] would report every
    // member with the wrong sign, and the colouring would invert with it.
    expect(memberDiagramSamples(END_FORCES, 'axial')).toEqual([
      { s: 0, value: 10 },
      { s: 1, value: 10 },
    ]);
  });

  it('draws the axial force and the shear as constants', () => {
    for (const kind of ['axial', 'shear'] as const) {
      const [first, last] = memberDiagramSamples(END_FORCES, kind);
      expect(first?.value).toBe(last?.value);
    }
  });

  it('takes the shear from end i', () => {
    expect(memberDiagramSamples(END_FORCES, 'shear')[0]?.value).toBe(4);
  });

  it('flips the sign of the end moment at i and keeps it at j', () => {
    // The one place the diagram is NOT the results table. M_i is an action on
    // the member; the internal moment just inside end i is its negative.
    expect(memberDiagramSamples(END_FORCES, 'moment')).toEqual([
      { s: 0, value: -6 },
      { s: 1, value: 10 },
    ]);
  });

  it('matches statics on a cantilever with a downward tip load', () => {
    // Fixed at i, free at j, load P down at j. Equilibrium of the member gives
    // V_i = P, M_i = P*L, and nothing at the free end.
    const P = 5;
    const L = 3;
    const cantilever: Vec6 = [0, P, P * L, 0, -P, 0];

    const [atI, atJ] = memberDiagramSamples(cantilever, 'moment');
    // Hogging at the support: tension on the TOP fibre, so negative.
    expect(atI?.value).toBe(-P * L);
    // Nothing left to bend at the free end.
    expect(atJ?.value).toBe(0);
  });
});

describe('diagramPlotSign', () => {
  it('draws the bending moment on the tension side and the rest on local +y', () => {
    expect(diagramPlotSign('moment')).toBe(-1);
    expect(diagramPlotSign('axial')).toBe(1);
    expect(diagramPlotSign('shear')).toBe(1);
  });
});

describe('peakOrdinate', () => {
  it('takes the largest magnitude regardless of sign', () => {
    expect(
      peakOrdinate([
        [{ s: 0, value: 3 }, { s: 1, value: -12 }],
        [{ s: 0, value: 7 }, { s: 1, value: 7 }],
      ]),
    ).toBe(12);
  });

  it('reports zero for a structure carrying nothing', () => {
    expect(peakOrdinate([[{ s: 0, value: 0 }, { s: 1, value: 0 }]])).toBe(0);
    expect(peakOrdinate([])).toBe(0);
  });
});

describe('suggestDiagramScale', () => {
  const BOUNDS = { minX: 0, maxX: 6, minY: 0, maxY: 8 }; // diagonal 10

  it('makes the largest ordinate reach a fixed fraction of the model', () => {
    const scale = suggestDiagramScale(BOUNDS, 40);
    expect(scale).not.toBeNull();
    // Whatever the fraction is, the same peak must land at the same height for
    // any unit system: the drawn height is a share of the diagonal.
    expect((scale as number) * 40).toBeCloseTo(0.13 * 10, 10);
  });

  it('scales inversely with the peak, so a bigger force is not drawn bigger', () => {
    const small = suggestDiagramScale(BOUNDS, 10) as number;
    const large = suggestDiagramScale(BOUNDS, 100) as number;
    expect(small * 10).toBeCloseTo(large * 100, 10);
  });

  it('has no scale to offer when nothing is carried', () => {
    expect(suggestDiagramScale(BOUNDS, 0)).toBeNull();
  });

  it('has no scale to offer for a model of zero size', () => {
    expect(suggestDiagramScale({ minX: 2, maxX: 2, minY: 5, maxY: 5 }, 40)).toBeNull();
  });
});

describe('splitBySign', () => {
  it('leaves a single-signed diagram in one piece', () => {
    const runs = splitBySign([{ s: 0, value: 3 }, { s: 1, value: 7 }]);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(2);
  });

  it('cuts at the zero crossing and gives the point to both runs', () => {
    const runs = splitBySign([{ s: 0, value: -3 }, { s: 1, value: 1 }]);

    expect(runs).toHaveLength(2);
    // -3 to 1 crosses zero three quarters of the way along.
    expect(runs[0]?.at(-1)).toEqual({ s: 0.75, value: 0 });
    // Shared, so the two lobes meet on the member instead of leaving a gap.
    expect(runs[1]?.[0]).toEqual({ s: 0.75, value: 0 });
  });
});

describe('memberDiagramLobes', () => {
  it('closes the polygon on the member at both ends', () => {
    const [lobe] = memberDiagramLobes(
      HORIZONTAL.start,
      HORIZONTAL.end,
      [{ s: 0, value: 2 }, { s: 1, value: 2 }],
      1,
      0.5,
    );

    expect(lobe?.points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 0 },
    ]);
    expect(lobe?.positive).toBe(true);
  });

  it('extrudes perpendicular to the MEMBER, not to the page', () => {
    // A member at 45 degrees. Its ordinate must leave the axis at a right
    // angle: extruding vertically instead would shorten every diagonal
    // member's diagram by cos(theta) and silently understate it.
    const start = { x: 0, y: 0 };
    const end = { x: 3, y: 3 };
    const [lobe] = memberDiagramLobes(
      start,
      end,
      [{ s: 0, value: 1 }, { s: 1, value: 1 }],
      1,
      2,
    );

    const points = lobe?.points as { x: number; y: number }[];
    const offset = { x: points[1].x - points[0].x, y: points[1].y - points[0].y };

    // Perpendicular to the axis...
    expect(offset.x * 1 + offset.y * 1).toBeCloseTo(0, 10);
    // ...and exactly value * scale long, in model units.
    expect(Math.hypot(offset.x, offset.y)).toBeCloseTo(2, 10);
    // Local +y is 90 degrees counter-clockwise from the axis, so it points up
    // and to the left.
    expect(offset.x).toBeLessThan(0);
    expect(offset.y).toBeGreaterThan(0);
  });

  it('follows a column, where "above the axis" has no meaning', () => {
    // Bottom-to-top column: axis (0,1), so local +y is (-1,0) and a positive
    // ordinate is drawn to the left.
    const [lobe] = memberDiagramLobes(
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      [{ s: 0, value: 3 }, { s: 1, value: 3 }],
      1,
      1,
    );

    expect(lobe?.points[1]).toEqual({ x: -3, y: 0 });
  });

  it('puts a sagging moment below the member and a hogging one above', () => {
    const runs = memberDiagramLobes(
      HORIZONTAL.start,
      HORIZONTAL.end,
      // Hogging at i, sagging at j: the ordinary pattern for a beam in a frame.
      [{ s: 0, value: -3 }, { s: 1, value: 3 }],
      diagramPlotSign('moment'),
      1,
    );

    expect(runs).toHaveLength(2);

    const negative = runs.find((run) => !run.positive);
    const positive = runs.find((run) => run.positive);

    // Negative moment: tension on the top fibre, drawn above the beam.
    expect(negative?.points[1]).toEqual({ x: 0, y: 3 });
    // Positive moment: tension underneath, drawn below it.
    expect(positive?.points[2]).toEqual({ x: 4, y: -3 });
  });

  it('draws nothing for a member carrying nothing', () => {
    expect(
      memberDiagramLobes(
        HORIZONTAL.start,
        HORIZONTAL.end,
        [{ s: 0, value: 0 }, { s: 1, value: 0 }],
        1,
        1,
      ),
    ).toEqual([]);
  });

  it('draws nothing for a member of zero length rather than dividing by it', () => {
    expect(
      memberDiagramLobes(
        { x: 1, y: 1 },
        { x: 1, y: 1 },
        [{ s: 0, value: 5 }, { s: 1, value: 5 }],
        1,
        1,
      ),
    ).toEqual([]);
  });
});

describe('diagramOrdinatePoint', () => {
  it('pushes the label further out along the same normal', () => {
    const point = diagramOrdinatePoint(
      HORIZONTAL.start,
      HORIZONTAL.end,
      { s: 0, value: 2 },
      1,
      0.5,
      0.25,
    );
    // Ordinate tip at y = 1, label a quarter of a unit beyond it.
    expect(point).toEqual({ x: 0, y: 1.25 });
  });

  it('pushes a label the other way when the ordinate is negative', () => {
    const point = diagramOrdinatePoint(
      HORIZONTAL.start,
      HORIZONTAL.end,
      { s: 0, value: -2 },
      1,
      0.5,
      0.25,
    );
    expect(point).toEqual({ x: 0, y: -1.25 });
  });

  it('gives a zero ordinate a side to sit on rather than leaving it on the member', () => {
    const point = diagramOrdinatePoint(
      HORIZONTAL.start,
      HORIZONTAL.end,
      { s: 1, value: 0 },
      1,
      0.5,
      0.25,
    );
    expect(point).toEqual({ x: 4, y: 0.25 });
  });

  it('returns null for a member of zero length', () => {
    expect(
      diagramOrdinatePoint({ x: 0, y: 0 }, { x: 0, y: 0 }, { s: 0, value: 1 }, 1, 1),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Against a solved frame
// ---------------------------------------------------------------------------

describe('the moment diagram of the preloaded portal frame', () => {
  const solution = solveFrame(EXAMPLE_FRAME);
  const momentsOf = (elementId: number) => {
    const element = solution.elements.find((entry) => entry.elementId === elementId);
    const [atI, atJ] = memberDiagramSamples(
      (element as (typeof solution.elements)[number]).endForces.local,
      'moment',
    );
    return { atI: atI?.value as number, atJ: atJ?.value as number };
  };

  const column1 = momentsOf(1); // node 1 (fixed base) -> node 2
  const beam = momentsOf(2); //    node 2 -> node 3
  const column2 = momentsOf(3); //  node 3 -> node 4 (pinned base)
  const cantilever = momentsOf(4); // node 3 -> node 5 (free end)

  it('steps by exactly the applied moment where one acts', () => {
    // Node 2 joins the left column to the beam and carries Mz = -28 kN·m.
    // Joint equilibrium puts the sum of the two member end moments at -28, so
    // once the sign at end i is flipped the diagram steps by exactly 28 across
    // the corner.
    //
    // Get the flip wrong and the step comes out as twice the moment or as
    // zero, which is the single most convincing wrong picture this module
    // could draw.
    expect(beam.atI - column1.atJ).toBeCloseTo(28, 9);
  });

  it('closes to zero at the joint that gathers three members and carries none', () => {
    // Node 3 joins the beam, the right column and the cantilever, with no
    // applied moment. The pairwise continuity of a two-member corner becomes
    // a three-way sum here, and it must vanish.
    //
    // The ordinates are read with the end-i sign flip already applied, so the
    // two members starting at node 3 enter negated relative to the one ending
    // there — which is what turns joint equilibrium into this expression.
    expect(beam.atJ - column2.atI - cantilever.atI).toBeCloseTo(0, 9);
  });

  it('closes at zero on the pinned base, which cannot develop a moment', () => {
    // Node 4 is an articulación with nothing applied: no restraint on the
    // rotation means no moment, and the diagram has to come back to the axis.
    expect(column2.atJ).toBeCloseTo(0, 9);
  });

  it('carries a non-zero moment into the fixed base', () => {
    // The other base is an empotramiento, so the same diagram must NOT close
    // there. Without this the previous test would pass on a diagram that is
    // simply flat everywhere.
    expect(Math.abs(column1.atI)).toBeGreaterThan(1);
  });
});

describe('the shear and axial diagrams of the preloaded portal frame', () => {
  const solution = solveFrame(EXAMPLE_FRAME);

  it('stays constant on the members that carry no span load', () => {
    // The columns. With nothing applied between their joints, N and V are
    // constant and two stations describe them exactly — which is still the
    // path  takes and must keep taking.
    for (const element of solution.elements.filter((entry) => entry.spanLoad === null)) {
      for (const kind of ['axial', 'shear'] as const) {
        const [atI, atJ] = memberDiagramSamples(element.endForces.local, kind);
        expect(atI?.value).toBe(atJ?.value);
      }
    }
  });

  it('varies along the members that do carry one', () => {
    // The beam and the cantilever. A constant shear there would mean the span
    // load never reached the diagram at all.
    const loaded = solution.elements.filter((entry) => entry.spanLoad !== null);
    expect(loaded.length).toBeGreaterThan(0);

    for (const element of loaded) {
      const samples = memberDiagramSamplesFor(element, 'shear');
      const first = samples[0]?.value as number;
      const last = samples[samples.length - 1]?.value as number;
      expect(Math.abs(last - first)).toBeGreaterThan(1);
    }
  });

  it('agrees with the axial force the results table reports', () => {
    for (const element of solution.elements) {
      const [sample] = memberDiagramSamples(element.endForces.local, 'axial');
      expect(sample?.value).toBe(element.endForces.axialForce);
    }
  });

  it('finds something to draw: the frame is loaded', () => {
    const peak = peakOrdinate(
      solution.elements.map((element) => memberDiagramSamples(element.endForces.local, 'moment')),
    );
    expect(peak).toBeGreaterThan(0);
  });
});
