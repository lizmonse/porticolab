/**
 * Internal-force diagrams: axial, shear and bending moment.
 *
 * Pure geometry, in MODEL coordinates. Nothing here knows about pixels, which
 * is what lets the canvas fold the diagram into the same bounding box it fits
 * the structure into — a diagram drawn after the fit would spill off the
 * canvas at exactly the moment it has most to say.
 *
 * ---------------------------------------------------------------------------
 * Why the ordinates are exact
 * ---------------------------------------------------------------------------
 * A member with no span load has nothing applied between its joints, so
 * sectioning it gives N(x) and V(x) constant and M(x) linear: two stations
 * describe all three diagrams EXACTLY, and that is still the path such a
 * member takes.
 *
 * A member carrying a span load is a curve — V linear or quadratic, M
 * quadratic or cubic — and it is sampled densely. Even then nothing is
 * approximated: every ordinate is a closed-form polynomial evaluated by
 * `internalForcesAt`, so the station count is a drawing decision about
 * smoothness and never a numerical one about accuracy. See
 * `memberDiagramSamplesFor`.
 *
 * ---------------------------------------------------------------------------
 * Sign convention
 * ---------------------------------------------------------------------------
 * The engine hands over `endForces.local` = [N_i, V_i, M_i, N_j, V_j, M_j],
 * the actions ON the member in its own local axes. Those are END ACTIONS, not
 * diagram ordinates, and the difference is a sign at end i that a reader would
 * never catch. Cutting the member at x and taking equilibrium of the piece
 * between i and the cut gives the internal actions:
 *
 *     N(x) = f[3]              tension positive, so it agrees with
 *                              `axialForce` and with the member colouring
 *     V(x) = f[1]              positive shear acts along local -y on the face
 *                              whose outward normal is local +x
 *     M(x) = f[1]*x - f[2]     sagging positive
 *
 * Those three hold for a member with no span load; `internalForcesAt` carries
 * the general forms, which add the integral of the load over the length
 * already passed.
 *
 * The moment expression evaluates to -M_i at end i and, once member
 * equilibrium is used, to +M_j at end j. Those two values are what this module
 * samples, so the ordinate at each end is read straight off the results table
 * rather than re-derived — with the sign flip at i that the table alone does
 * not show.
 *
 * Checked against the cantilever: a downward tip load P gives f[2] = P*L, so
 * M(0) = -P*L. Hogging, tension on the top fibre. That is the right answer,
 * and the opposite of the end action printed for the member.
 */

import { internalForcesAt, shearZeroStations } from '../lib/frame/postprocess';
import type { ElementResult, Vec6 } from '../types/frame';
import type { Bounds, Point } from './viewport';
import { boundsDiagonal } from './viewport';

/** Which internal force a diagram plots. */
export type DiagramKind = 'axial' | 'shear' | 'moment';

/**
 * What the canvas is currently drawing.
 *
 * 'geometry' and 'deformed' are two views of the same drawing rather than one:
 * the undeformed structure on its own, and the same structure with its
 * deflected shape laid over it. They were a single mode with a magnification
 * slider that hid the curve at zero, which made the most characteristic thing
 * a frame does a setting rather than a view.
 */
export type ViewMode = 'geometry' | 'deformed' | DiagramKind;

/** True when the mode is one of the internal-force diagrams. */
export function isDiagramMode(mode: ViewMode): mode is DiagramKind {
  return mode !== 'geometry' && mode !== 'deformed';
}

/** One station of a diagram along a member. */
export interface DiagramSample {
  /** Normalised position along the member: 0 at end i, 1 at end j. */
  readonly s: number;
  /** Ordinate in force units (kN) or moment units (kN·m). */
  readonly value: number;
}

/** Segments per member when a span load makes the diagram a curve. */
const DIAGRAM_SEGMENTS = 50;

/**
 * The ordinates of one member's diagram, sampled along its length.
 *
 * ---------------------------------------------------------------------------
 * Two stations, or fifty
 * ---------------------------------------------------------------------------
 * With no span load, two stations are not an approximation — they are the
 * exact answer, because N and V are constant and M is linear between joints.
 * That path is kept and delegates to `memberDiagramSamples`, so a frame
 * carrying only nodal loads produces the identical two-point diagram it always
 * did.
 *
 * With one, V becomes linear or quadratic and M quadratic or cubic, so the
 * curve has to be drawn as a curve. Fifty segments is a drawing decision and
 * not a numerical one: every ordinate comes from `internalForcesAt`, which
 * evaluates a closed-form polynomial, so the sampling density changes how
 * smooth the outline looks and never how correct a value is.
 *
 * ---------------------------------------------------------------------------
 * The station that uniform sampling would miss
 * ---------------------------------------------------------------------------
 * The bending moment reaches its extremum where the shear crosses zero, and
 * that abscissa is almost never a multiple of L/50. Sampling uniformly steps
 * over it and draws a peak that is flattened by however much the curve moved
 * between the two neighbouring stations — a diagram whose maximum, the single
 * number a designer reads it for, is quietly too small.
 *
 * `shearZeroStations` returns those abscissas exactly, and they are merged
 * into the station list. It matters most on the shear and moment diagrams but
 * is applied to all three, because it costs nothing and an axial diagram under
 * an inclined gravity load is a parabola with its own turning point.
 */
export function memberDiagramSamplesFor(
  result: ElementResult,
  kind: DiagramKind,
  segments: number = DIAGRAM_SEGMENTS,
): DiagramSample[] {
  if (result.spanLoad === null) {
    return memberDiagramSamples(result.endForces.local, kind);
  }

  const L = result.geometry.length;
  if (L === 0) return memberDiagramSamples(result.endForces.local, kind);

  const stations = new Set<number>();
  for (let index = 0; index <= segments; index++) stations.add(index / segments);
  for (const x of shearZeroStations(result)) stations.add(x / L);

  return [...stations]
    .sort((left, right) => left - right)
    .map((s) => ({ s, value: ordinateAt(result, kind, s * L) }));
}

/** Picks the component of the internal forces that a given diagram plots. */
function ordinateAt(result: ElementResult, kind: DiagramKind, x: number): number {
  const forces = internalForcesAt(result, x);
  switch (kind) {
    case 'axial':
      return forces.axial;
    case 'shear':
      return forces.shear;
    case 'moment':
      return forces.moment;
  }
}

/**
 * The ordinates of one member's diagram, from its local end forces alone.
 *
 * Two stations, because with no span load that is the exact answer for all
 * three diagrams: constant for N and V, linear for M. `memberDiagramSamplesFor`
 * is the general entry point and falls back to this one.
 */
export function memberDiagramSamples(local: Vec6, kind: DiagramKind): DiagramSample[] {
  switch (kind) {
    case 'axial': {
      // f[3], not f[0]: at end j the local x axis points away from the member,
      // so a member being pulled apart reads positive. Same number the results
      // table calls `axialForce`.
      const axial = local[3];
      return [
        { s: 0, value: axial },
        { s: 1, value: axial },
      ];
    }
    case 'shear': {
      const shear = local[1];
      return [
        { s: 0, value: shear },
        { s: 1, value: shear },
      ];
    }
    case 'moment':
      // The sign flip at i is the whole point: see the header note.
      return [
        { s: 0, value: -local[2] },
        { s: 1, value: local[5] },
      ];
  }
}

/**
 * Which side of the member an ordinate is drawn on.
 *
 * +1 puts a positive value on the local +y side, which is 90 degrees
 * counter-clockwise from the i-to-j direction — above a left-to-right beam.
 *
 * The bending moment gets -1, so it is drawn ON THE TENSION SIDE: a sagging
 * moment, which stretches the bottom fibre, is plotted below the member. This
 * is the convention taught in the Spanish-language courses this calculator
 * serves, and it is the one that still means something on a column, where
 * "above the axis" does not.
 *
 * Note that this flips the GEOMETRY only. The colour still follows the sign of
 * the value itself, so a sagging moment reads positive in both the fill and
 * the label whichever side it is drawn on.
 */
export function diagramPlotSign(kind: DiagramKind): 1 | -1 {
  return kind === 'moment' ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

/** Fraction of the model's diagonal the largest ordinate should reach. */
const TARGET_DIAGRAM_FRACTION = 0.13;

/** Largest ordinate magnitude across every member, in force units. */
export function peakOrdinate(
  diagrams: Iterable<readonly DiagramSample[]>,
): number {
  let peak = 0;
  for (const samples of diagrams) {
    for (const sample of samples) {
      const magnitude = Math.abs(sample.value);
      if (Number.isFinite(magnitude) && magnitude > peak) peak = magnitude;
    }
  }
  return peak;
}

/**
 * A scale, in model length per force unit, that makes the largest ordinate in
 * the whole structure reach a readable fraction of the model.
 *
 * The peak is taken across ALL members, never per member: scaling each one to
 * its own maximum would draw a 2 kN·m member and a 200 kN·m member the same
 * height, which is the one thing a diagram exists to distinguish.
 *
 * @returns A positive factor, or null when nothing is being carried.
 */
export function suggestDiagramScale(bounds: Bounds, peak: number): number | null {
  const diagonal = boundsDiagonal(bounds);
  if (diagonal === 0) return null;
  if (peak <= 0 || !Number.isFinite(peak)) return null;
  return (TARGET_DIAGRAM_FRACTION * diagonal) / peak;
}

// ---------------------------------------------------------------------------
// Polygons
// ---------------------------------------------------------------------------

/**
 * One filled region of a diagram, of a single sign.
 *
 * A member whose moment changes sign produces two lobes, not one polygon. A
 * single polygon spanning the sign change would be a self-intersecting bow
 * tie — it happens to render acceptably, but it could only be painted one
 * colour, and half of it would then be the wrong one.
 */
export interface DiagramLobe {
  /** Closed polygon in model coordinates: baseline, ordinates, baseline. */
  readonly points: readonly Point[];
  /** True when this lobe's ordinates are positive. */
  readonly positive: boolean;
}

/**
 * The filled lobes of one member's diagram, in model coordinates.
 *
 * The extrusion is perpendicular to the member's OWN axis, using its direction
 * cosines (C, S) — the same pair the transformation matrix is built from. An
 * inclined member therefore carries its diagram square to itself, which is the
 * only orientation in which the ordinate can be read as a length.
 *
 * @param scale Model length per force unit, from `suggestDiagramScale`.
 */
export function memberDiagramLobes(
  start: Point,
  end: Point,
  samples: readonly DiagramSample[],
  plotSign: 1 | -1,
  scale: number,
): DiagramLobe[] {
  const axis = memberAxis(start, end);
  if (axis === null) return [];

  return splitBySign(samples).flatMap((run) => {
    const peak = run.reduce((max, sample) => Math.max(max, Math.abs(sample.value)), 0);
    // A run that is flat zero has no area to fill and no sign to colour.
    if (peak === 0) return [];

    const first = run[0];
    const last = run[run.length - 1];

    return [
      {
        points: [
          baselinePoint(axis, first.s),
          ...run.map((sample) => ordinatePoint(axis, sample, plotSign, scale)),
          baselinePoint(axis, last.s),
        ],
        positive: signOf(run) > 0,
      },
    ];
  });
}

/**
 * Where a single ordinate lands, for the value labels.
 *
 * `outwardOffset` pushes the point further along the same normal, in model
 * units, so a label clears the tip of its own lobe instead of sitting on it.
 */
export function diagramOrdinatePoint(
  start: Point,
  end: Point,
  sample: DiagramSample,
  plotSign: 1 | -1,
  scale: number,
  outwardOffset = 0,
): Point | null {
  const axis = memberAxis(start, end);
  if (axis === null) return null;

  const point = ordinatePoint(axis, sample, plotSign, scale);
  if (outwardOffset === 0) return point;

  // Push away from the member. A zero ordinate has no side of its own, so it
  // is nudged to the positive side rather than left on the axis.
  const direction = sample.value === 0 ? plotSign : Math.sign(sample.value) * plotSign;
  return {
    x: point.x + axis.normalX * direction * outwardOffset,
    y: point.y + axis.normalY * direction * outwardOffset,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** A member's length and its two unit vectors, local x and local y. */
interface MemberAxis {
  readonly start: Point;
  readonly length: number;
  /** C = cos(theta). */
  readonly cos: number;
  /** S = sin(theta). */
  readonly sin: number;
  /** Local +y, 90 degrees counter-clockwise from the axis: (-S, C). */
  readonly normalX: number;
  readonly normalY: number;
}

/** Derives the local frame of a member, or null if the two ends coincide. */
function memberAxis(start: Point, end: Point): MemberAxis | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0) return null;

  const cos = dx / length;
  const sin = dy / length;
  return { start, length, cos, sin, normalX: -sin, normalY: cos };
}

/** The point on the member itself at station s. */
function baselinePoint(axis: MemberAxis, s: number): Point {
  return {
    x: axis.start.x + axis.cos * s * axis.length,
    y: axis.start.y + axis.sin * s * axis.length,
  };
}

/** The tip of the ordinate at station s, offset perpendicular to the member. */
function ordinatePoint(
  axis: MemberAxis,
  sample: DiagramSample,
  plotSign: 1 | -1,
  scale: number,
): Point {
  const base = baselinePoint(axis, sample.s);
  const offset = sample.value * scale * plotSign;
  return {
    x: base.x + axis.normalX * offset,
    y: base.y + axis.normalY * offset,
  };
}

/**
 * Cuts a sampled diagram into runs of one sign, inserting the zero crossing.
 *
 * The crossing is placed by linear interpolation, which is exact here: with no
 * span load the moment varies linearly, so the interpolated root IS the root.
 * The inserted point belongs to both runs, so the two lobes meet on the member
 * rather than leaving a gap at the sign change.
 */
export function splitBySign(samples: readonly DiagramSample[]): DiagramSample[][] {
  const runs: DiagramSample[][] = [];
  let current: DiagramSample[] = [];

  for (const sample of samples) {
    const previous = current[current.length - 1];

    if (previous !== undefined && previous.value * sample.value < 0) {
      const t = previous.value / (previous.value - sample.value);
      const crossing: DiagramSample = {
        s: previous.s + t * (sample.s - previous.s),
        value: 0,
      };
      current.push(crossing);
      runs.push(current);
      current = [crossing];
    }

    current.push(sample);
  }

  // A single station is a point, not a region: nothing to fill.
  if (current.length > 1) runs.push(current);
  return runs;
}

/** The sign of a run, taken from its largest ordinate. */
function signOf(run: readonly DiagramSample[]): number {
  const extreme = run.reduce(
    (best, sample) => (Math.abs(sample.value) > Math.abs(best.value) ? sample : best),
    run[0],
  );
  return extreme.value >= 0 ? 1 : -1;
}
