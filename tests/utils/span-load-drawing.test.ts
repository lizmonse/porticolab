/**
 * The drawing side of span loads: the deflected shape and the sampled
 * diagrams.
 *
 * Both modules made a claim in their comments that is worth nothing unless it
 * is checked:
 *
 *   - the particular deflection is the SAME polynomial the fixed-end forces
 *     come from, so differentiating it at x = 0 must return them;
 *   - the sampled diagram never clips the peak, because the shear-zero
 *     station is inserted explicitly.
 *
 * The failure both guard against is a picture that is merely plausible. A
 * clamped beam drawn as a straight line and a parabola drawn with its apex
 * shaved off both look like diagrams; neither announces that it is wrong.
 */

import { describe, expect, it } from 'vitest';

import { solveFrame } from '../../src/lib/frame';
import { internalForcesAt } from '../../src/lib/frame/postprocess';
import type { DistributedLoad, FrameModel } from '../../src/types/frame';
import { memberDiagramSamplesFor } from '../../src/utils/diagrams';
import { deformedMemberPoints } from '../../src/utils/viewport';

const E = 200_000_000;
const A = 0.01;
const I = 1e-4;
const L = 6;
const w = 12;

const AT_REST = { ux: 0, uy: 0, rz: 0 };

function beam(restrainRzAtEnds: boolean, loads: readonly DistributedLoad[]): FrameModel {
  return {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: L, y: 0 },
    ],
    elements: [{ id: 1, from: 1, to: 2, E, A, I }],
    supports: [
      { node: 1, restrainX: true, restrainY: true, restrainRz: restrainRzAtEnds },
      { node: 2, restrainX: false, restrainY: true, restrainRz: restrainRzAtEnds },
    ],
    loads: [],
    distributedLoads: loads,
  };
}

const uniformDown = (intensity: number): DistributedLoad => ({
  id: 1,
  element: 1,
  wxI: 0,
  wyI: -intensity,
  wxJ: 0,
  wyJ: -intensity,
});

// ---------------------------------------------------------------------------

describe('deflected shape of a clamped beam under a uniform load', () => {
  const flexure = {
    EI: E * I,
    EA: E * A,
    // Local axes coincide with global ones on a left-to-right horizontal beam,
    // so a downward load is q negative and there is no axial component.
    load: { pI: 0, pJ: 0, qI: -w, qJ: -w },
  };

  const start = { x: 0, y: 0 };
  const end = { x: L, y: 0 };

  it('is a straight line without the span load, which is the bug', () => {
    // Every nodal degree of freedom is zero, so the Hermite interpolation has
    // nothing to work with. This is the drawing the fix replaces.
    const points = deformedMemberPoints(start, end, AT_REST, AT_REST, 1, 24);
    for (const point of points) expect(point.y).toBeCloseTo(0, 12);
  });

  it('sags by wL⁴/384EI at midspan once the span load is passed', () => {
    const points = deformedMemberPoints(start, end, AT_REST, AT_REST, 1, 24, flexure);
    const middle = points[12];
    expect(middle?.x).toBeCloseTo(L / 2, 9);
    expect(middle?.y).toBeCloseTo(-(w * L ** 4) / (384 * E * I), 12);
  });

  it('still meets both joints exactly', () => {
    // The particular solution is the clamped-clamped case, so it is zero in
    // value AND slope at both ends. If it were not, the drawn member would
    // detach from the joints it is attached to.
    const points = deformedMemberPoints(start, end, AT_REST, AT_REST, 1, 24, flexure);
    const first = points[0];
    const last = points[points.length - 1];
    expect(first?.y).toBeCloseTo(0, 12);
    expect(last?.y).toBeCloseTo(0, 12);
    expect(first?.x).toBeCloseTo(0, 12);
    expect(last?.x).toBeCloseTo(L, 12);
  });

  it('is magnified by the same factor as the nodal part', () => {
    const once = deformedMemberPoints(start, end, AT_REST, AT_REST, 1, 24, flexure);
    const tenfold = deformedMemberPoints(start, end, AT_REST, AT_REST, 10, 24, flexure);
    expect(tenfold[12]?.y).toBeCloseTo((once[12]?.y ?? 0) * 10, 12);
  });

  it('agrees with the fixed-end forces it is supposed to share a polynomial with', () => {
    /**
     * The claim in the comment on `spanLoadDeflection`: differentiating the
     * particular solution twice at x = 0 returns the fixed-end MOMENT and
     * three times the fixed-end SHEAR.
     *
     * Differentiated numerically here on purpose. Deriving them symbolically
     * in the test would just restate the implementation; a finite difference
     * over the drawn curve asks whether the CURVE has those derivatives.
     *
     * Compared as a RELATIVE error, not to a number of decimals. A forward
     * second difference carries O(h) truncation error and a third difference
     * O(h) on top of a cubed denominator, so a few tenths of a percent is the
     * method's own noise and not the curve's. The assertion that matters is
     * that both land on the fixed-end values at all — a wrong polynomial
     * misses them by whole multiples, not by 0.06%.
     */
    const stations = 1e4;
    const h = L / stations;
    const points = deformedMemberPoints(start, end, AT_REST, AT_REST, 1, stations, flexure);
    const at = (index: number) => points[index]?.y ?? 0;

    const [v0, v1, v2, v3] = [at(0), at(1), at(2), at(3)];

    // EI·v''(0) is the fixed-end moment, wL²/12 in magnitude.
    const secondDerivative = (v0 - 2 * v1 + v2) / (h * h);
    const moment = Math.abs(E * I * secondDerivative);
    expect(moment / ((w * L * L) / 12)).toBeCloseTo(1, 2);

    // EI·v'''(0) is the fixed-end shear, wL/2.
    const thirdDerivative = (-v0 + 3 * v1 - 3 * v2 + v3) / (h * h * h);
    const shear = Math.abs(E * I * thirdDerivative);
    expect(shear / ((w * L) / 2)).toBeCloseTo(1, 1);
  });
});

describe('sampled diagrams', () => {
  it('stay at two stations when a member carries no span load', () => {
    const solution = solveFrame({
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: L, y: 0 },
      ],
      elements: [{ id: 1, from: 1, to: 2, E, A, I }],
      supports: [{ node: 1, restrainX: true, restrainY: true, restrainRz: true }],
      loads: [{ node: 2, fx: 0, fy: -10, mz: 0 }],
    });
    const element = solution.elements[0];
    if (element === undefined) throw new Error('no element');

    for (const kind of ['axial', 'shear', 'moment'] as const) {
      expect(memberDiagramSamplesFor(element, kind)).toHaveLength(2);
    }
  });

  it('sample densely once a span load makes the diagram a curve', () => {
    const solution = solveFrame(beam(true, [uniformDown(w)]));
    const element = solution.elements[0];
    if (element === undefined) throw new Error('no element');

    const samples = memberDiagramSamplesFor(element, 'moment');
    // 51 uniform stations, plus midspan — which for this symmetric case is
    // already one of them, so the set does not grow.
    expect(samples.length).toBeGreaterThanOrEqual(51);
    expect(samples[0]?.s).toBe(0);
    expect(samples[samples.length - 1]?.s).toBe(1);
  });

  it('trace a parabola rather than a straight line', () => {
    const solution = solveFrame(beam(false, [uniformDown(w)]));
    const element = solution.elements[0];
    if (element === undefined) throw new Error('no element');

    const samples = memberDiagramSamplesFor(element, 'moment');
    const midpoint = samples.find((sample) => Math.abs(sample.s - 0.5) < 1e-12);

    // A straight line between the two ends would put zero at midspan, since a
    // simply supported beam has no end moments. The parabola puts wL²/8 there.
    expect(midpoint?.value).toBeCloseTo((w * L * L) / 8, 8);
  });

  it('include the exact station where the shear crosses zero', () => {
    // Propped cantilever: the peak sits at 5L/8, which is not a multiple of
    // L/50 and would therefore be stepped over by uniform sampling alone.
    const propped: FrameModel = {
      ...beam(true, [uniformDown(w)]),
      supports: [
        { node: 1, restrainX: true, restrainY: true, restrainRz: true },
        { node: 2, restrainX: false, restrainY: true, restrainRz: false },
      ],
    };
    const solution = solveFrame(propped);
    const element = solution.elements[0];
    if (element === undefined) throw new Error('no element');

    const samples = memberDiagramSamplesFor(element, 'moment');
    const peakStation = 5 / 8;

    expect(samples.some((sample) => Math.abs(sample.s - peakStation) < 1e-9)).toBe(true);

    // And the sampled maximum equals the analytical one exactly, rather than
    // the slightly smaller value uniform sampling would have found.
    const sampledPeak = Math.max(...samples.map((sample) => sample.value));
    expect(sampledPeak).toBeCloseTo((9 * w * L * L) / 128, 8);
  });

  it('never disagree with the engine at any station they report', () => {
    const solution = solveFrame(beam(true, [{ id: 1, element: 1, wxI: 0, wyI: -5, wxJ: 0, wyJ: -20 }]));
    const element = solution.elements[0];
    if (element === undefined) throw new Error('no element');

    for (const kind of ['axial', 'shear', 'moment'] as const) {
      for (const sample of memberDiagramSamplesFor(element, kind, 8)) {
        const forces = internalForcesAt(element, sample.s * element.geometry.length);
        const expected =
          kind === 'axial' ? forces.axial : kind === 'shear' ? forces.shear : forces.moment;
        expect(sample.value).toBeCloseTo(expected, 12);
      }
    }
  });
});
