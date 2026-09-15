/**
 * Plane frame element geometry.
 *
 * Unchanged in substance from the plane truss: a member's length and
 * orientation depend only on the coordinates of its two end nodes, not on how
 * many degrees of freedom each node carries. The angle theta it produces is
 * the one that builds the 6x6 transformation matrix in `element.ts`.
 *
 * atan2 resolves the quadrant with no manual intervention, replacing the
 * atan(...)*180/pi plus quadrant fixups ("theta3 = 180 - theta2") that the
 * reference text performs by hand.
 */

import type { ElementGeometry, FrameNode } from '../../types/frame';
import { FrameError } from './errors';

const TWO_PI = 2 * Math.PI;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Converts degrees to radians. */
export function degToRad(degrees: number): number {
  return degrees * DEG_TO_RAD;
}

/** Converts radians to degrees. */
export function radToDeg(radians: number): number {
  return radians * RAD_TO_DEG;
}

/** Wraps an angle in radians into [0, 2*pi). */
export function normalizeAngleRad(radians: number): number {
  const wrapped = radians % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

/** Wraps an angle in degrees into [0, 360). */
export function normalizeAngleDeg(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Element length from the coordinates of its two nodes.
 *
 * Math.hypot replaces sqrt(dx*dx + dy*dy): same result, but without
 * intermediate overflow for coordinates of extreme magnitude.
 */
export function elementLength(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/**
 * Derives an element's full geometry from its nodes.
 *
 * C and S come straight from dx/L and dy/L. That is algebraically identical
 * to cos(theta) and sin(theta) but exact: it avoids the round trip through
 * atan2 and back through cos/sin, which introduces rounding error on the
 * order of 1e-16. For a frame that matters more than for a truss, because the
 * same C and S are used six times over inside the transformation matrix.
 *
 * @throws FrameError ZERO_LENGTH_ELEMENT when the two nodes coincide.
 */
export function elementGeometry(from: FrameNode, to: FrameNode): ElementGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (!Number.isFinite(length) || length === 0) {
    throw new FrameError(
      'ZERO_LENGTH_ELEMENT',
      `Nodes ${from.id} and ${to.id} share the same position (${from.x}, ${from.y}): ` +
        'the element would have zero length.',
    );
  }

  const angleRad = normalizeAngleRad(Math.atan2(dy, dx));

  return {
    length,
    angleRad,
    angleDeg: radToDeg(angleRad),
    cos: dx / length,
    sin: dy / length,
  };
}

/** Exact direction cosines at the four quadrant angles, indexed by theta/90. */
const QUADRANT: readonly { cos: number; sin: number }[] = [
  { cos: 1, sin: 0 },
  { cos: 0, sin: 1 },
  { cos: -1, sin: 0 },
  { cos: 0, sin: -1 },
];

/**
 * Direction cosines from an angle in degrees.
 *
 * This is the path the reference text takes (theta supplied as input to
 * PlaneFrameElementStiffness). It is kept for the functions that accept theta
 * and for parity tests; the engine prefers `elementGeometry`, which starts
 * from the coordinates and gets C and S as exact ratios dx/L and dy/L.
 *
 * The quadrant angles are answered from a table rather than handed to
 * Math.cos, which returns 6.123e-17 for 90 degrees rather than 0. That
 * residue is harmless in magnitude but not in kind: it puts an axial term of
 * order 1e-17 * EA/L into cells of a vertical member's global matrix that
 * theory says are exactly empty, so the two entry points into the same
 * element — by angle and by coordinates — would disagree about which cells
 * are zero. A column drawn between (0,0) and (0,4) is the most common member
 * in any frame; it deserves the same exact zeros whichever way it is
 * described.
 */
export function directionCosines(thetaDeg: number): { cos: number; sin: number } {
  const normalized = normalizeAngleDeg(thetaDeg);

  if (Number.isInteger(normalized) && normalized % 90 === 0) {
    return QUADRANT[normalized / 90]!;
  }

  return { cos: Math.cos(degToRad(normalized)), sin: Math.sin(degToRad(normalized)) };
}
