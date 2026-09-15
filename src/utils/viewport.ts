/**
 * Mapping from model coordinates to SVG screen coordinates.
 *
 * Kept as pure functions, separate from the React component, so the scaling
 * and the Y-axis flip can be tested without rendering anything.
 *
 * Two rules drive the whole module:
 *
 *   1. The scale is UNIFORM. Fitting X and Y independently would stretch the
 *      drawing and show wrong angles: a 45 degree bar would no longer look
 *      like 45 degrees, which for a structural diagram is a correctness bug,
 *      not a cosmetic one.
 *
 *   2. The Y axis is FLIPPED. Model Y grows upward, DOM Y grows downward, so
 *      without the flip every truss would be drawn upside down.
 */

import type { LocalSpanLoad } from '../types/frame';

/** A point in either coordinate space. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Axis-aligned bounding box in model coordinates. */
export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** Converts model coordinates to screen coordinates. */
export interface ViewTransform {
  /** Pixels per model unit. Same for both axes. */
  readonly scale: number;
  /** Projects a model point onto the SVG canvas. */
  toScreen(point: Point): Point;
}

/**
 * Bounding box of a set of points, or null when there are none.
 *
 * Callers should pass the deformed positions too: at a high deformation
 * scale the deformed shape reaches outside the undeformed box, and fitting
 * only the original would let it spill past the edges of the canvas.
 */
export function computeBounds(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return { minX, maxX, minY, maxY };
}

/** Diagonal of a bounding box: the model's characteristic size. */
export function boundsDiagonal(bounds: Bounds): number {
  return Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
}

/**
 * Builds the transform that fits `bounds` into a canvas, centred.
 *
 * Degenerate models are handled explicitly rather than left to produce
 * Infinity: a single node has zero span on both axes, and a truss whose nodes
 * are all collinear has zero span on one of them.
 *
 * @param width Canvas width in pixels.
 * @param height Canvas height in pixels.
 * @param padding Margin in pixels, leaving room for labels and supports.
 */
export function createViewTransform(
  bounds: Bounds,
  width: number,
  height: number,
  padding: number,
): ViewTransform {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;

  const available = {
    width: Math.max(width - 2 * padding, 1),
    height: Math.max(height - 2 * padding, 1),
  };

  // An axis with zero span imposes no limit on the scale, so it contributes
  // Infinity and loses the Math.min.
  const scaleX = spanX > 0 ? available.width / spanX : Number.POSITIVE_INFINITY;
  const scaleY = spanY > 0 ? available.height / spanY : Number.POSITIVE_INFINITY;

  // Both spans zero means a single point: any scale works, so pick 1.
  const fitted = Math.min(scaleX, scaleY);
  const scale = Number.isFinite(fitted) && fitted > 0 ? fitted : 1;

  // Centre whatever space the uniform scale left over on each axis.
  const offsetX = padding + (available.width - spanX * scale) / 2;
  const offsetY = padding + (available.height - spanY * scale) / 2;

  return {
    scale,
    toScreen(point) {
      return {
        x: offsetX + (point.x - bounds.minX) * scale,
        // maxY - y instead of y - minY: this is the vertical flip.
        y: offsetY + (bounds.maxY - point.y) * scale,
      };
    },
  };
}

/** Fraction of the model's size that the largest displacement should reach. */
const TARGET_DEFORMATION_FRACTION = 0.08;

/**
 * Peak of the Hermite term N2 = L(s - 2s^2 + s^3), which is 4/27 at s = 1/3.
 *
 * How much a member bulges sideways per unit of end rotation, as a fraction of
 * its length. Used only to size the deformation slider when nothing
 * translates.
 */
const ROTATION_BULGE_FACTOR = 4 / 27;

/**
 * Suggests a deformation scale that makes the deflected shape readable.
 *
 * Real displacements are several orders of magnitude smaller than the
 * structure, so at 1:1 the deformed shape sits exactly on top of the original.
 * A fixed default like 250x only suits one model; this derives a factor that
 * makes the largest displacement reach a fixed fraction of the model size, so
 * it works for a 4 m truss in metres and a 4000 mm truss in millimetres alike.
 *
 * @returns A positive factor, or null when nothing moves and no scale applies.
 */
export function suggestDeformationScale(
  bounds: Bounds,
  displacements: readonly Point[],
  rotations: readonly number[] = [],
): number | null {
  const diagonal = boundsDiagonal(bounds);
  if (diagonal === 0) return null;

  const largest = displacements.reduce(
    (max, displacement) => Math.max(max, Math.hypot(displacement.x, displacement.y)),
    0,
  );

  if (largest > 0 && Number.isFinite(largest)) {
    return (TARGET_DEFORMATION_FRACTION * diagonal) / largest;
  }

  /*
    Nothing translates, but a frame joint can still ROTATE — and a member
    between two rotating joints bends, so there is a deflected shape to show
    even though every node stayed put. A truss had no such case, which is why
    translations alone used to be the whole answer.

    The equivalence is the Hermite term that carries an end rotation into
    transverse deflection, N2 = L(s - 2s^2 + s^3). It peaks at s = 1/3, where
    it equals 4/27 of L, so a rotation theta bulges the member by about
    0.148 * theta * L. The model's diagonal stands in for L, which is an
    order-of-magnitude estimate, and that is all a starting position for a
    slider needs to be.
  */
  const largestRotation = rotations.reduce(
    (max, rotation) => Math.max(max, Math.abs(rotation)),
    0,
  );
  if (largestRotation === 0 || !Number.isFinite(largestRotation)) return null;

  const bulgePerUnitScale = ROTATION_BULGE_FACTOR * largestRotation * diagonal;
  return (TARGET_DEFORMATION_FRACTION * diagonal) / bulgePerUnitScale;
}

/** Applies a displacement to a point, magnified by the deformation scale. */
export function deformPoint(point: Point, displacement: Point, scale: number): Point {
  return {
    x: point.x + displacement.x * scale,
    y: point.y + displacement.y * scale,
  };
}

// ---------------------------------------------------------------------------
// Deflected shape of a frame member
// ---------------------------------------------------------------------------

/** The three components of a node's motion: two translations and a rotation. */
export interface NodalMotion {
  readonly ux: number;
  readonly uy: number;
  /** Rotation about Z, in radians. */
  readonly rz: number;
}

/** Points per member in the deflected shape. Enough for a smooth quintic. */
const DEFLECTION_SEGMENTS = 24;

/**
 * What a member needs to know about its own span load to draw its true
 * deflected shape.
 *
 * Passed separately from the nodal motions because it is a different kind of
 * fact: the motions say where the ENDS went, this says what happened in
 * between. A member with no span load passes null and the curve is the cubic
 * Hermite interpolation it always was.
 */
export interface MemberFlexure {
  /** Flexural rigidity E·I. */
  readonly EI: number;
  /** Axial rigidity E·A. */
  readonly EA: number;
  /** The span load in the member's own axes. */
  readonly load: LocalSpanLoad;
}

/**
 * The deflection a span load adds on top of the nodal interpolation.
 *
 * ---------------------------------------------------------------------------
 * Why this can simply be added
 * ---------------------------------------------------------------------------
 * The Hermite interpolation reproduces the four end conditions exactly and
 * nothing else. What it misses is the shape the member takes BETWEEN its ends,
 * and that shape is the deflection of the same member with both ends CLAMPED —
 * which is zero in value and zero in slope at x = 0 and x = L.
 *
 * Those four zeros are what make the sum legitimate: the particular solution
 * disturbs neither end, so the total still meets the joints exactly where the
 * nodal results say it does. It is the same superposition as the end forces,
 * one derivative family further down.
 *
 * ---------------------------------------------------------------------------
 * Where the polynomials come from
 * ---------------------------------------------------------------------------
 * Integrating EI·v'''' = q(x) four times under v(0) = v'(0) = v(L) = v'(L) = 0:
 *
 *   uniform q      v = q·x²(x - L)² / (24·EI)
 *   triangular Δ   v = [Δ·x⁵/(120L) - Δ·L·x³/40 + Δ·L²·x²/60] / EI
 *
 * and the general trapezoidal case is the first with q₁ plus the second with
 * Δ = q₂ - q₁, exactly as the fixed-end forces are.
 *
 * The check that ties this to the rest of the engine: differentiating either
 * expression twice at x = 0 returns the fixed-end MOMENT of that load case
 * (qL²/12, ΔL²/30) and three times returns its fixed-end SHEAR (qL/2,
 * 3ΔL/20). The drawing and the results table are therefore not two models of
 * the member — they are two readings of one polynomial. The tests assert it.
 *
 * The axial term is the same idea one order down: EA·u'' = -p under
 * u(0) = u(L) = 0. It is included for completeness rather than for visibility,
 * since axial deformations are typically orders of magnitude smaller than
 * bending ones and are usually invisible at any honest scale.
 */
function spanLoadDeflection(
  x: number,
  length: number,
  flexure: MemberFlexure,
): { axial: number; transverse: number } {
  const { EI, EA, load } = flexure;
  const { pI, pJ, qI, qJ } = load;

  const L = length;
  const x2 = x * x;
  const x3 = x2 * x;

  // --- Transverse: uniform part qI, plus triangular part (qJ - qI). --------
  const uniform = (qI * x2 * (x - L) * (x - L)) / (24 * EI);

  const delta = qJ - qI;
  const triangular =
    delta === 0
      ? 0
      : ((delta * x2 * x3) / (120 * L) - (delta * L * x3) / 40 + (delta * L * L * x2) / 60) / EI;

  // --- Axial: EA·u'' = -p, again clamped at both ends. ---------------------
  const axialDelta = pJ - pI;
  const axial =
    pI === 0 && axialDelta === 0
      ? 0
      : (-(pI * x2) / 2 -
          (axialDelta * x3) / (6 * L) +
          ((pI * L) / 2 + (axialDelta * L) / 6) * x) /
        EA;

  return { axial, transverse: uniform + triangular };
}

/**
 * The deflected shape of one frame member, as a polyline in model coordinates.
 *
 * A truss bar stays straight when it deforms, so joining the two displaced
 * ends with a line told the whole story. A frame member BENDS: drawing it
 * straight would hide the single most characteristic thing a frame does, and
 * would contradict the end rotations the results table reports.
 *
 * The curve is the element's own interpolation, not a decorative spline. The
 * same cubic Hermite shape functions that build the 12EI/L^3 and 6EI/L^2
 * terms of the stiffness matrix are evaluated here:
 *
 *   N1 = 1 - 3s^2 + 2s^3      N2 = L(s - 2s^2 + s^3)
 *   N3 = 3s^2 - 2s^3          N4 = L(s^3 - s^2)
 *
 * so the picture and the numbers come from one and the same theory.
 *
 * The end motions are rotated into the member's local axes first, the shape is
 * evaluated there, and the result is rotated back — which is why an inclined
 * member bends about its own axis rather than about the global one.
 *
 * Rotations are magnified by the same factor as translations. That is what
 * keeps the curve consistent with its own end points: scaling one without the
 * other would draw a member whose ends do not meet the joints it is attached
 * to.
 *
 * `flexure` adds the span load's own contribution — see `spanLoadDeflection`.
 * Without it a clamped beam under a uniform load is drawn as a PERFECTLY
 * STRAIGHT LINE, because all six of its nodal degrees of freedom are zero and
 * the Hermite terms have nothing to work with. That drawing is not merely
 * imprecise: it is a picture of the one thing the calculation exists to
 * disprove.
 *
 * @param flexure The member's rigidities and span load, or null when it
 * carries none — in which case the curve is the cubic Hermite interpolation
 * and nothing changes.
 */
export function deformedMemberPoints(
  start: Point,
  end: Point,
  startMotion: NodalMotion,
  endMotion: NodalMotion,
  scale: number,
  segments: number = DEFLECTION_SEGMENTS,
  flexure: MemberFlexure | null = null,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);

  if (!Number.isFinite(length) || length === 0) {
    return [deformPoint(start, { x: startMotion.ux, y: startMotion.uy }, scale)];
  }

  const cos = dx / length;
  const sin = dy / length;

  // Global -> local: only the translations rotate; the rotation about Z is
  // shared by both frames of reference.
  const axialStart = (cos * startMotion.ux + sin * startMotion.uy) * scale;
  const transverseStart = (-sin * startMotion.ux + cos * startMotion.uy) * scale;
  const rotationStart = startMotion.rz * scale;

  const axialEnd = (cos * endMotion.ux + sin * endMotion.uy) * scale;
  const transverseEnd = (-sin * endMotion.ux + cos * endMotion.uy) * scale;
  const rotationEnd = endMotion.rz * scale;

  return Array.from({ length: segments + 1 }, (_unused, index) => {
    const s = index / segments;
    const s2 = s * s;
    const s3 = s2 * s;

    const n1 = 1 - 3 * s2 + 2 * s3;
    const n2 = length * (s - 2 * s2 + s3);
    const n3 = 3 * s2 - 2 * s3;
    const n4 = length * (s3 - s2);

    const nodal = {
      axial: (1 - s) * axialStart + s * axialEnd,
      transverse:
        n1 * transverseStart + n2 * rotationStart + n3 * transverseEnd + n4 * rotationEnd,
    };

    // The particular solution is magnified by the same factor as the nodal
    // part. Scaling one without the other would bend the member away from the
    // joints its own end points are pinned to.
    const particular =
      flexure === null
        ? { axial: 0, transverse: 0 }
        : spanLoadDeflection(s * length, length, flexure);

    const axial = nodal.axial + particular.axial * scale;
    const transverse = nodal.transverse + particular.transverse * scale;

    const localX = s * length + axial;

    // Local -> global.
    return {
      x: start.x + cos * localX - sin * transverse,
      y: start.y + sin * localX + cos * transverse,
    };
  });
}
