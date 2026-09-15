/**
 * Tests for the deflected shape of a frame member.
 *
 * This is the one piece of drawing mathematics that carries a physical claim:
 * the curve is the element's own cubic interpolation, so it has to agree with
 * the shape functions the stiffness matrix is built from. A decorative spline
 * would pass the eye and fail here.
 */

import { describe, expect, it } from 'vitest';

import type { Point } from '../../src/utils/viewport';
import {
  computeBounds,
  deformedMemberPoints,
  suggestDeformationScale,
} from '../../src/utils/viewport';

const AT_REST = { ux: 0, uy: 0, rz: 0 };

/** Largest distance from a point of the curve to the chord joining its ends. */
function largestBulge(points: readonly Point[]): number {
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const length = Math.hypot(dx, dy);

  return points.reduce((max, point) => {
    // Perpendicular distance from the point to the chord.
    const cross = Math.abs(dx * (point.y - first.y) - dy * (point.x - first.x));
    return Math.max(max, cross / length);
  }, 0);
}

describe('deformedMemberPoints', () => {
  const start: Point = { x: 0, y: 0 };
  const end: Point = { x: 4, y: 0 };

  it('lands exactly on the displaced end nodes', () => {
    const points = deformedMemberPoints(
      start,
      end,
      { ux: 0.01, uy: -0.02, rz: 0.003 },
      { ux: -0.005, uy: 0.04, rz: -0.001 },
      10,
    );

    expect(points[0]!.x).toBeCloseTo(0 + 0.01 * 10, 10);
    expect(points[0]!.y).toBeCloseTo(0 - 0.02 * 10, 10);
    expect(points[points.length - 1]!.x).toBeCloseTo(4 - 0.005 * 10, 10);
    expect(points[points.length - 1]!.y).toBeCloseTo(0 + 0.04 * 10, 10);
  });

  it('stays straight under a rigid translation', () => {
    const motion = { ux: 0.1, uy: 0.2, rz: 0 };
    const points = deformedMemberPoints(start, end, motion, motion, 1);

    expect(largestBulge(points)).toBeCloseTo(0, 12);
    for (const point of points) {
      expect(point.y).toBeCloseTo(0.2, 12);
    }
  });

  it('bends when only an end rotates, with the textbook peak of 4/27 L', () => {
    // A single end rotation drives N2 = L(s - 2s^2 + s^3), whose maximum is
    // 4/27 of L at s = 1/3. If the drawing used any other interpolation, this
    // number would not come out.
    const rotation = 0.01;
    const length = 4;
    const points = deformedMemberPoints(
      start,
      end,
      { ux: 0, uy: 0, rz: rotation },
      AT_REST,
      1,
      120,
    );

    expect(largestBulge(points)).toBeCloseTo((4 / 27) * length * rotation, 6);
  });

  it('bends about the member axis, not the global one', () => {
    // The same member rotated 90 degrees: a vertical column with a rotation at
    // its base must bulge horizontally by exactly what the horizontal one
    // bulged vertically.
    const horizontal = deformedMemberPoints(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { ux: 0, uy: 0, rz: 0.01 },
      AT_REST,
      1,
      120,
    );
    const vertical = deformedMemberPoints(
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { ux: 0, uy: 0, rz: 0.01 },
      AT_REST,
      1,
      120,
    );

    expect(largestBulge(vertical)).toBeCloseTo(largestBulge(horizontal), 10);
    // And it really is horizontal displacement doing it.
    const widest = vertical.reduce((max, p) => Math.max(max, Math.abs(p.x)), 0);
    expect(widest).toBeCloseTo(largestBulge(horizontal), 10);
  });

  it('scales the bulge linearly with the magnification factor', () => {
    const once = deformedMemberPoints(start, end, { ux: 0, uy: 0, rz: 0.01 }, AT_REST, 1, 60);
    const tenfold = deformedMemberPoints(start, end, { ux: 0, uy: 0, rz: 0.01 }, AT_REST, 10, 60);

    expect(largestBulge(tenfold)).toBeCloseTo(largestBulge(once) * 10, 8);
  });

  it('returns a single point for a degenerate zero-length member', () => {
    const points = deformedMemberPoints(start, start, AT_REST, AT_REST, 1);
    expect(points).toHaveLength(1);
  });
});

describe('suggestDeformationScale with rotations', () => {
  const bounds = computeBounds([
    { x: 0, y: 0 },
    { x: 6, y: 0 },
  ])!;

  it('still prefers translations when there are any', () => {
    const withRotation = suggestDeformationScale(bounds, [{ x: 0, y: 0.01 }], [0.5]);
    const withoutRotation = suggestDeformationScale(bounds, [{ x: 0, y: 0.01 }]);
    expect(withRotation).toBe(withoutRotation);
  });

  it('falls back to rotations when nothing translates', () => {
    // A frame can bend with every joint standing still; the truss-era rule
    // would have reported "nothing moves" and hidden the deflected shape.
    expect(suggestDeformationScale(bounds, [{ x: 0, y: 0 }])).toBeNull();

    const scale = suggestDeformationScale(bounds, [{ x: 0, y: 0 }], [0.002]);
    expect(scale).not.toBeNull();
    expect(scale!).toBeGreaterThan(0);
    expect(Number.isFinite(scale!)).toBe(true);
  });

  it('returns null when neither translations nor rotations exist', () => {
    expect(suggestDeformationScale(bounds, [{ x: 0, y: 0 }], [0])).toBeNull();
  });
});
