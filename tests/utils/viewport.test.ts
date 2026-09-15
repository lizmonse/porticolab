/**
 * Tests for the model-to-screen mapping.
 *
 * The two properties that matter for correctness are the uniform scale, which
 * keeps bar angles truthful, and the Y flip, which keeps the structure the right
 * way up. Both are easy to break and invisible in a type check.
 */

import { describe, expect, it } from 'vitest';

import {
  boundsDiagonal,
  computeBounds,
  createViewTransform,
  deformPoint,
  suggestDeformationScale,
} from '../../src/utils/viewport';

/** The Example 5.1 geometry: nodes at (0,0), (4,0) and (2,3). */
const EXAMPLE_POINTS = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 2, y: 3 },
];

describe('computeBounds', () => {
  it('encloses every point', () => {
    expect(computeBounds(EXAMPLE_POINTS)).toEqual({ minX: 0, maxX: 4, minY: 0, maxY: 3 });
  });

  it('handles negative coordinates', () => {
    expect(computeBounds([{ x: -5, y: -2 }, { x: 3, y: 7 }])).toEqual({
      minX: -5,
      maxX: 3,
      minY: -2,
      maxY: 7,
    });
  });

  it('returns null for an empty model instead of an infinite box', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('ignores non-finite points rather than poisoning the box', () => {
    const bounds = computeBounds([{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 2, y: 2 }]);
    expect(bounds).toEqual({ minX: 0, maxX: 2, minY: 0, maxY: 2 });
  });
});

describe('createViewTransform', () => {
  const bounds = { minX: 0, maxX: 4, minY: 0, maxY: 3 };

  it('flips the Y axis so the structure is not drawn upside down', () => {
    const transform = createViewTransform(bounds, 400, 300, 0);
    // The model's topmost point must land at the smallest screen Y.
    const top = transform.toScreen({ x: 2, y: 3 });
    const bottom = transform.toScreen({ x: 2, y: 0 });
    expect(top.y).toBeLessThan(bottom.y);
  });

  it('uses one scale for both axes, so angles stay truthful', () => {
    // A canvas far wider than it is tall: an independent fit would stretch X.
    const transform = createViewTransform(bounds, 1000, 300, 0);

    const origin = transform.toScreen({ x: 0, y: 0 });
    const alongX = transform.toScreen({ x: 1, y: 0 });
    const alongY = transform.toScreen({ x: 0, y: 1 });

    const pixelsPerUnitX = alongX.x - origin.x;
    const pixelsPerUnitY = origin.y - alongY.y;
    expect(pixelsPerUnitX).toBeCloseTo(pixelsPerUnitY, 10);

    // A 45 degree bar in the model must still measure 45 degrees on screen.
    const diagonal = transform.toScreen({ x: 1, y: 1 });
    const angle = Math.atan2(origin.y - diagonal.y, diagonal.x - origin.x) * (180 / Math.PI);
    expect(angle).toBeCloseTo(45, 10);
  });

  it('fits the content inside the padded area', () => {
    const transform = createViewTransform(bounds, 400, 300, 20);
    const corners = [
      transform.toScreen({ x: 0, y: 0 }),
      transform.toScreen({ x: 4, y: 0 }),
      transform.toScreen({ x: 4, y: 3 }),
      transform.toScreen({ x: 0, y: 3 }),
    ];
    for (const corner of corners) {
      expect(corner.x).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(corner.x).toBeLessThanOrEqual(380 + 1e-9);
      expect(corner.y).toBeGreaterThanOrEqual(20 - 1e-9);
      expect(corner.y).toBeLessThanOrEqual(280 + 1e-9);
    }
  });

  it('centres the drawing on the axis with slack', () => {
    // 4 x 3 model in a 400 x 300 box: the limiting axis is X (100 px/unit vs
    // 100 px/unit — both fit exactly), so widen the canvas to create slack.
    const transform = createViewTransform(bounds, 800, 300, 0);
    const left = transform.toScreen({ x: 0, y: 0 });
    const right = transform.toScreen({ x: 4, y: 0 });
    // Equal margins on both sides.
    expect(left.x).toBeCloseTo(800 - right.x, 9);
  });

  it('does not divide by zero for a structure whose nodes are collinear', () => {
    // Every node on the same horizontal line: the Y span is zero.
    const flat = { minX: 0, maxX: 10, minY: 2, maxY: 2 };
    const transform = createViewTransform(flat, 400, 300, 20);
    const start = transform.toScreen({ x: 0, y: 2 });
    const end = transform.toScreen({ x: 10, y: 2 });
    expect(Number.isFinite(start.x)).toBe(true);
    expect(Number.isFinite(start.y)).toBe(true);
    expect(start.y).toBeCloseTo(end.y, 9);
    expect(start.y).toBeCloseTo(150, 9); // vertically centred
  });

  it('does not divide by zero for a single node', () => {
    const single = { minX: 3, maxX: 3, minY: 3, maxY: 3 };
    const transform = createViewTransform(single, 400, 300, 20);
    const point = transform.toScreen({ x: 3, y: 3 });
    expect(point).toEqual({ x: 200, y: 150 });
  });
});

describe('boundsDiagonal', () => {
  it('measures the characteristic size of the model', () => {
    expect(boundsDiagonal({ minX: 0, maxX: 4, minY: 0, maxY: 3 })).toBeCloseTo(5, 12);
  });
});

describe('suggestDeformationScale', () => {
  const bounds = { minX: 0, maxX: 4, minY: 0, maxY: 3 };

  it('scales the largest displacement to a readable fraction of the model', () => {
    // The Example 5.1 displacements: the largest is about 1.95e-3 m against a
    // 5 m diagonal, so it needs a factor in the hundreds to be visible.
    const scale = suggestDeformationScale(bounds, [
      { x: 0, y: 0 },
      { x: 1.1111111111111109e-3, y: 0 },
      { x: 1.9505605133243616e-3, y: -1.6103747772759757e-3 },
    ]);
    expect(scale).not.toBeNull();

    const largest = Math.hypot(1.9505605133243616e-3, -1.6103747772759757e-3);
    expect(largest * (scale as number)).toBeCloseTo(0.08 * 5, 12);
    expect(scale as number).toBeGreaterThan(100);
  });

  it('is dimensionless: the same structure in different units gets the same factor', () => {
    // The factor is a ratio of two lengths, so re-expressing the model in
    // millimetres scales the diagonal and the displacement by the same 1000
    // and leaves the factor untouched. That is what makes it safe to suggest
    // regardless of the unit system the user picked, where a hard-coded 250x
    // would only ever suit one of them.
    const inMillimetres = { minX: 0, maxX: 4000, minY: 0, maxY: 3000 };
    const scale = suggestDeformationScale(inMillimetres, [{ x: 1.95, y: -1.61 }]);
    const inMetres = suggestDeformationScale(bounds, [{ x: 1.95e-3, y: -1.61e-3 }]);
    expect(scale as number).toBeCloseTo(inMetres as number, 9);
  });

  it('returns null when nothing moves, so no deformed shape is drawn', () => {
    expect(suggestDeformationScale(bounds, [{ x: 0, y: 0 }])).toBeNull();
    expect(suggestDeformationScale(bounds, [])).toBeNull();
  });
});

describe('deformPoint', () => {
  it('magnifies the displacement by the scale', () => {
    expect(deformPoint({ x: 2, y: 3 }, { x: 0.001, y: -0.002 }, 250)).toEqual({
      x: 2.25,
      y: 2.5,
    });
  });

  it('leaves the point untouched at zero scale', () => {
    expect(deformPoint({ x: 2, y: 3 }, { x: 0.001, y: -0.002 }, 0)).toEqual({ x: 2, y: 3 });
  });
});
