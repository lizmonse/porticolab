/**
 * SVG drawing of the frame: original geometry, deflected shape, supports and
 * loads.
 *
 * SVG rather than Canvas: the marks are ordinary React elements, so they take
 * Tailwind classes, they re-render from state with no imperative redraw, they
 * scale without device-pixel-ratio handling, and each member is a real DOM
 * node that can carry a tooltip without hit-testing by hand.
 *
 * Three things had to change for frames, and each is a case where the truss
 * drawing would have been actively misleading rather than merely incomplete:
 *
 *   1. The deflected shape is a CURVE. A frame member bends; joining its two
 *      displaced ends with a straight line would hide the one behaviour that
 *      separates a frame from a truss.
 *   2. Supports must distinguish a fixed base from a pinned one. A triangle
 *      drawn under an empotramiento says the joint is free to rotate, which
 *      is precisely what it is not.
 *   3. Applied moments need a symbol of their own — a curved arrow — because
 *      a moment has no direction a straight arrow could point in.
 *
 * The canvas also draws the INTERNAL-FORCE DIAGRAMS — axial, shear, bending
 * moment — on the same surface as the structure rather than in a strip
 * underneath it. That placement is the point: on a frame, an ordinate is only
 * readable against the member it belongs to, and a column's diagram has no
 * meaningful home on a horizontal strip at all. The ordinates come from
 * `utils/diagrams.ts`, which owns the sign convention.
 *
 * All the coordinate mathematics lives in `utils/viewport.ts` and
 * `utils/diagrams.ts`; this file only decides what to paint.
 */

import { useMemo } from 'react';

import { useElementSize } from '../../hooks/useElementSize';
import type {
  AxialState,
  ElementResult,
  FrameModel,
  FrameSolution,
  NodeId,
} from '../../types/frame';
import type { DiagramKind, DiagramLobe, DiagramSample, ViewMode } from '../../utils/diagrams';
import {
  diagramOrdinatePoint,
  diagramPlotSign,
  isDiagramMode,
  memberDiagramLobes,
  memberDiagramSamplesFor,
} from '../../utils/diagrams';
import { formatFixed } from '../../utils/format';
import type { NodalMotion, Point, ViewTransform } from '../../utils/viewport';
import {
  boundsDiagonal,
  computeBounds,
  createViewTransform,
  deformedMemberPoints,
} from '../../utils/viewport';
import {
  BAR_STROKE,
  CANVAS_HALO,
  DEFORMED_STROKE,
  diagramStroke,
  LOAD_STROKE,
  NODE_FILL,
  NODE_STROKE,
  SUPPORT_FILL_PINNED,
  SUPPORT_FILL_ROLLER,
  SUPPORT_STROKE,
} from '../../utils/theme';

/** Margin in pixels, leaving room for node labels, supports and load arrows. */
const PADDING = 42;

/** A node that does not move at all. */
const AT_REST: NodalMotion = { ux: 0, uy: 0, rz: 0 };

export interface FrameCanvasProps {
  model: FrameModel;
  /** Null while the model is incomplete or unsolvable. */
  solution: FrameSolution | null;
  /** Magnification applied to the displacements. Zero hides the deflected shape. */
  deformationScale: number;
  /**
   * What to draw. `geometry` is the structure with its deflected shape; the
   * other three replace the deflected shape with an internal-force diagram.
   */
  viewMode?: ViewMode;
  /**
   * Ordinate scale of the active diagram, in model length per force unit.
   * Zero hides the diagram.
   */
  diagramScale?: number;
}

export function FrameCanvas({
  model,
  solution,
  deformationScale,
  viewMode = 'geometry',
  diagramScale = 0,
}: FrameCanvasProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>();

  const scene = useMemo(
    () =>
      buildScene(model, solution, {
        deformationScale,
        viewMode,
        diagramScale,
        width: size.width,
        height: size.height,
      }),
    [model, solution, deformationScale, viewMode, diagramScale, size.width, size.height],
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      {scene === null ? (
        <EmptyCanvas />
      ) : (
        <svg
          width={size.width}
          height={size.height}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="img"
          aria-label={scene.description}
          className="block"
        >
          <defs>
            <marker
              id="frame-load-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              {/*
                Painted through `style` rather than the `fill` attribute: the
                colour is a `var(--...)` reference, and the SVG attribute
                grammar has no notion of custom properties — as an attribute it
                would silently resolve to nothing. Same reason throughout this
                file.
              */}
              <path d="M 0 0 L 10 5 L 0 10 z" style={{ fill: LOAD_STROKE }} />
            </marker>
          </defs>

          {/*
            The diagram goes underneath everything. Its baseline IS the member,
            so painting the members over it keeps the axis crisp where the fill
            meets it — and a translucent lobe laid on top of the supports would
            tint them instead.
          */}
          {scene.lobes.length > 0 && <DiagramLayer lobes={scene.lobes} />}
          <MemberLayer members={scene.members} />
          {scene.deflected.length > 0 && <DeflectedLayer paths={scene.deflected} />}
          <SupportLayer supports={scene.supports} />
          {scene.spanLoads.length > 0 && <SpanLoadLayer loads={scene.spanLoads} />}
          <ForceLoadLayer loads={scene.forceLoads} />
          <MomentLoadLayer loads={scene.momentLoads} />
          <NodeLayer nodes={scene.nodes} />
          {/* Last, so the halo behind each number cuts through whatever it
              lands on rather than being cut by it. */}
          {scene.diagramLabels.length > 0 && <DiagramLabelLayer labels={scene.diagramLabels} />}
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scene construction
// ---------------------------------------------------------------------------

interface Member {
  readonly id: number;
  readonly from: Point;
  readonly to: Point;
  readonly state: AxialState;
}

interface DeflectedPath {
  readonly id: number;
  /** Screen-space polyline of the bent member. */
  readonly points: readonly Point[];
}

interface RenderedNode {
  readonly id: NodeId;
  readonly at: Point;
}

interface RenderedSupport {
  readonly node: NodeId;
  readonly at: Point;
  readonly restrainX: boolean;
  readonly restrainY: boolean;
  readonly restrainRz: boolean;
}

interface RenderedForce {
  readonly key: string;
  readonly at: Point;
  readonly to: Point;
}

interface RenderedMoment {
  readonly key: string;
  readonly at: Point;
  /** True when the moment is counter-clockwise, i.e. mz > 0. */
  readonly counterClockwise: boolean;
}

/** One filled region of an internal-force diagram, in screen coordinates. */
interface RenderedLobe {
  readonly key: string;
  readonly points: readonly Point[];
  readonly positive: boolean;
}

/** A numeric ordinate printed at one end of a member's diagram. */
interface RenderedDiagramLabel {
  readonly key: string;
  readonly at: Point;
  readonly text: string;
  readonly positive: boolean;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly baseline: 'middle' | 'hanging' | 'auto';
}

interface Scene {
  readonly members: readonly Member[];
  readonly deflected: readonly DeflectedPath[];
  readonly nodes: readonly RenderedNode[];
  readonly supports: readonly RenderedSupport[];
  readonly forceLoads: readonly RenderedForce[];
  readonly spanLoads: readonly RenderedSpanLoad[];
  readonly momentLoads: readonly RenderedMoment[];
  readonly lobes: readonly RenderedLobe[];
  readonly diagramLabels: readonly RenderedDiagramLabel[];
  /** Accessible summary of what the drawing currently shows. */
  readonly description: string;
}

/** Fixed on-screen length of a load arrow, in pixels. */
const LOAD_ARROW_LENGTH = 34;

// ---------------------------------------------------------------------------
// Span loads
// ---------------------------------------------------------------------------

/**
 * How tall the largest span-load ordinate is drawn, as a fraction of the
 * model's diagonal.
 *
 * Half of what an internal-force diagram gets. A load is context for the
 * diagram, not the subject of it, and at equal heights the two compete —
 * which matters most in the deflected view, where the load and the bent
 * member share the same space.
 */
const SPAN_LOAD_TARGET_FRACTION = 0.07;

/** Spacing between arrows, as a fraction of the diagonal. */
const SPAN_LOAD_ARROW_PITCH_FRACTION = 0.038;

/**
 * Bounds on the arrow count per member.
 *
 * The ceiling is what stops a long member under a light load from becoming a
 * solid band of ink: past a dozen arrows the row reads as a filled rectangle
 * and the individual marks stop meaning anything. The floor keeps a very
 * short member from being drawn with a single arrow, which reads as a point
 * load — the one thing this symbol must not be mistaken for.
 */
const MIN_SPAN_LOAD_ARROWS = 3;
const MAX_SPAN_LOAD_ARROWS = 12;

/**
 * Shortest arrow worth drawing, as a fraction of the peak ordinate.
 *
 * A triangular load starts at zero, so its first arrows are microscopic. Below
 * this they are dropped: an arrowhead with no shaft behind it is a smudge on
 * the member, not a smaller force.
 *
 * The number is set against the arrowhead rather than by eye. The marker is
 * five units at a 1.5px stroke, so the head alone is about 7.5px; measured on
 * the preset, the peak ordinate draws at ~44px. A fifth of that keeps the
 * shortest surviving shaft longer than its own head, which is the point at
 * which an arrow stops reading as an arrow.
 *
 * The envelope is unaffected — it is drawn from the true ordinate at each end,
 * so the wedge still comes to a point on the member where the load vanishes.
 */
const SPAN_LOAD_MINIMUM_ARROW = 0.22;

/** One span load drawn on a member: its envelope, and the arrows under it. */
interface RenderedSpanLoad {
  readonly key: string;
  /** The envelope, from the end-i ordinate to the end-j one. */
  readonly from: Point;
  readonly to: Point;
  /** Arrow shafts, each running from the envelope down onto the member. */
  readonly arrows: readonly { readonly from: Point; readonly to: Point }[];
}

/** The same thing before the view transform, in model coordinates. */
interface SpanLoadInModel {
  readonly elementId: number;
  readonly from: Point;
  readonly to: Point;
  readonly arrows: readonly { readonly from: Point; readonly to: Point }[];
}

/**
 * Gap in pixels between the tip of an ordinate and its printed value.
 *
 * A screen distance, not a model one: it exists so the number clears the line,
 * and that requirement is about type size, which does not scale with the
 * structure.
 */
const DIAGRAM_LABEL_GAP = 12;

/**
 * Extra clearance for a label pushed UPWARD from a joint.
 *
 * That direction is already occupied: `NodeLayer` prints the node's number at
 * `y - 11`. Without the extra room a near-zero ordinate on a beam would set
 * its value straight on top of the joint number, and the halo would win —
 * leaving the node unlabelled.
 */
const NODE_LABEL_CLEARANCE = 11;

/** Spanish description of each view, for the SVG's accessible name. */
const VIEW_DESCRIPTION: Record<ViewMode, string> = {
  geometry: 'Diagrama del pórtico con nodos, apoyos y cargas',
  deformed: 'Diagrama del pórtico con su deformada superpuesta',
  axial: 'Diagrama de fuerza axial sobre el pórtico',
  shear: 'Diagrama de fuerza cortante sobre el pórtico',
  moment: 'Diagrama de momento flector sobre el pórtico',
};

interface SceneOptions {
  readonly deformationScale: number;
  readonly viewMode: ViewMode;
  readonly diagramScale: number;
  readonly width: number;
  readonly height: number;
}

function buildScene(
  model: FrameModel,
  solution: FrameSolution | null,
  options: SceneOptions,
): Scene | null {
  const { deformationScale, viewMode, diagramScale, width, height } = options;

  if (width === 0 || height === 0) return null;
  if (model.nodes.length === 0) return null;

  const motionByNode = new Map<NodeId, NodalMotion>(
    (solution?.nodalDisplacements ?? []).map((entry) => [
      entry.node,
      { ux: entry.ux, uy: entry.uy, rz: entry.rz },
    ]),
  );
  const stateByElement = new Map<number, AxialState>(
    (solution?.elements ?? []).map((element) => [element.elementId, element.state]),
  );
  // The whole ElementResult, not just its end-force vector: a diagram over a
  // span load needs the member length and the local intensities as well, and
  // the deflected shape needs its rigidities.
  const resultByElement = new Map<number, ElementResult>(
    (solution?.elements ?? []).map((element) => [element.elementId, element]),
  );

  /**
   * The diagram being drawn, or null.
   *
   * A force diagram and the deflected shape are mutually exclusive: they are
   * two different magnifications of two different quantities laid over the
   * same members, and shown together the reader cannot tell which curve is
   * which. Selecting a diagram is therefore what hides the deformada.
   */
  const diagramKind =
    solution !== null && diagramScale > 0 && isDiagramMode(viewMode) ? viewMode : null;

  // Its own view now, not a side effect of not being on a diagram.
  const showDeflected = solution !== null && deformationScale > 0 && viewMode === 'deformed';

  const positions = new Map<NodeId, Point>(
    model.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
  );

  // Computed in model coordinates first, because the fit has to see them: at a
  // high magnification the bent members reach outside the original outline,
  // and framing only the undeformed geometry would clip the curve.
  const deflectedInModel = showDeflected
    ? model.elements.flatMap((element) => {
        const from = positions.get(element.from);
        const to = positions.get(element.to);
        if (from === undefined || to === undefined) return [];
        // A member carrying a span load bends BETWEEN its joints, and the
        // Hermite interpolation cannot see that: passing its rigidities and
        // local intensities is what turns a clamped beam under a uniform load
        // from a straight line into the curve it actually takes.
        const result = resultByElement.get(element.id);
        const flexure =
          result?.spanLoad == null
            ? null
            : {
                EI: element.E * element.I,
                EA: element.E * element.A,
                load: result.spanLoad,
              };

        return [
          {
            id: element.id,
            points: deformedMemberPoints(
              from,
              to,
              motionByNode.get(element.from) ?? AT_REST,
              motionByNode.get(element.to) ?? AT_REST,
              deformationScale,
              undefined,
              flexure,
            ),
          },
        ];
      })
    : [];

  // Same reason as the deflected shape: the diagram is built in model
  // coordinates so the fit can see it. A diagram scaled after the transform
  // was chosen would run off the canvas exactly when the forces are largest.
  const diagramsInModel = diagramKind === null ? [] : buildMemberDiagrams(
    model,
    positions,
    resultByElement,
    diagramKind,
    diagramScale,
  );

  /*
    Span loads, drawn only outside the diagram views.

    A diagram already occupies the band beside each member, and the load that
    produced it would land in exactly the same place — two red arrows crossing
    a teal lobe, with nothing to say which belongs to which. The geometry and
    deflected views have that band free, and those are the two where knowing
    what is applied actually helps.
  */
  const structureBounds = computeBounds([...positions.values()]);
  const spanLoadsInModel =
    diagramKind === null && structureBounds !== null
      ? buildSpanLoads(model, positions, boundsDiagonal(structureBounds))
      : [];

  const bounds = computeBounds([
    ...positions.values(),
    ...deflectedInModel.flatMap((path) => path.points),
    ...diagramsInModel.flatMap((diagram) =>
      diagram.lobes.flatMap((lobe) => lobe.points as Point[]),
    ),
    // The envelope reaches outside the structure, so the fit has to see it or
    // a heavy load would be drawn straight off the top of the canvas.
    ...spanLoadsInModel.flatMap((load) => [load.from, load.to]),
  ]);
  if (bounds === null) return null;

  const transform = createViewTransform(bounds, width, height, PADDING);

  const members = model.elements.flatMap((element) => {
    const from = positions.get(element.from);
    const to = positions.get(element.to);
    if (from === undefined || to === undefined) return [];
    return [
      {
        id: element.id,
        from: transform.toScreen(from),
        to: transform.toScreen(to),
        // Under a diagram the members go neutral. Leaving them blue and orange
        // would put a second, unrelated colour code beside the diagram's own,
        // and the reader has no way to know that teal and blue are answering
        // different questions.
        state:
          diagramKind !== null
            ? ('zero' as AxialState)
            : (stateByElement.get(element.id) ?? ('zero' as AxialState)),
      },
    ];
  });

  return {
    description: VIEW_DESCRIPTION[diagramKind ?? 'geometry'],
    lobes: diagramsInModel.flatMap((diagram) =>
      diagram.lobes.map((lobe, index) => ({
        key: `lobe-${diagram.id}-${index}`,
        points: lobe.points.map((point) => transform.toScreen(point)),
        positive: lobe.positive,
      })),
    ),
    diagramLabels: diagramsInModel.flatMap((diagram) =>
      buildDiagramLabels(diagram, diagramScale, transform),
    ),
    members,
    deflected: deflectedInModel.map((path) => ({
      id: path.id,
      points: path.points.map((point) => transform.toScreen(point)),
    })),
    nodes: model.nodes.map((node) => ({
      id: node.id,
      at: transform.toScreen({ x: node.x, y: node.y }),
    })),
    supports: model.supports.flatMap((support) => {
      const position = positions.get(support.node);
      if (position === undefined) return [];
      return [
        {
          node: support.node,
          at: transform.toScreen(position),
          restrainX: support.restrainX,
          restrainY: support.restrainY,
          restrainRz: support.restrainRz,
        },
      ];
    }),
    spanLoads: spanLoadsInModel.map((load) => ({
      key: `span-load-${load.elementId}`,
      from: transform.toScreen(load.from),
      to: transform.toScreen(load.to),
      arrows: load.arrows.map((arrow) => ({
        from: transform.toScreen(arrow.from),
        to: transform.toScreen(arrow.to),
      })),
    })),
    forceLoads: buildForceLoads(model, positions, transform),
    momentLoads: buildMomentLoads(model, positions, transform),
  };
}

/**
 * Places the force arrows.
 *
 * Arrow length is a fixed pixel value rather than proportional to magnitude:
 * a model mixing a 5 kN and a 5000 kN load would otherwise render the smaller
 * one as an invisible stub. Direction is what the drawing needs to convey;
 * the magnitudes are in the input table.
 */
/**
 * Builds every span load, in MODEL coordinates.
 *
 * ---------------------------------------------------------------------------
 * Why the arrows are not perpendicular to the member
 * ---------------------------------------------------------------------------
 * The intensity is a GLOBAL vector, so a gravity load points straight down on
 * every member — vertically on the beam, and still vertically on an inclined
 * rafter, where it is neither along nor across the member. Drawing the arrows
 * perpendicular to the member instead would be the picture of a different
 * load, and it would contradict the axial component the results table reports
 * for exactly that case.
 *
 * The tail of each arrow is therefore the point on the member MINUS the scaled
 * intensity: subtracting a downward vector lifts the tail above the beam, and
 * the arrow then points back down onto it. Both the member position and the
 * intensity are linear in s, so the locus of the tails is a straight line and
 * the envelope needs only its two ends — a uniform load draws a rectangle and
 * a triangular one a wedge, with no special case for either.
 *
 * @param diagonal The model's own diagonal, used to size the ordinate and to
 * space the arrows. Taken from the node positions alone, before the loads
 * widen the bounds, for the same reason the diagram scale is.
 */
function buildSpanLoads(
  model: FrameModel,
  positions: ReadonlyMap<NodeId, Point>,
  diagonal: number,
): SpanLoadInModel[] {
  const loads = model.distributedLoads ?? [];
  if (loads.length === 0 || diagonal === 0) return [];

  // Accumulate, so two loads declared on one member draw as the one load they
  // add up to rather than as two overlapping rows of arrows.
  const byElement = new Map<number, { wxI: number; wyI: number; wxJ: number; wyJ: number }>();
  for (const load of loads) {
    const current = byElement.get(load.element) ?? { wxI: 0, wyI: 0, wxJ: 0, wyJ: 0 };
    byElement.set(load.element, {
      wxI: current.wxI + load.wxI,
      wyI: current.wyI + load.wyI,
      wxJ: current.wxJ + load.wxJ,
      wyJ: current.wyJ + load.wyJ,
    });
  }

  // One scale for the whole structure, never per member: scaling each to its
  // own peak would draw a 2 kN/m load and a 200 kN/m load the same height,
  // which is the one comparison the drawing exists to make possible.
  let peak = 0;
  for (const w of byElement.values()) {
    peak = Math.max(peak, Math.hypot(w.wxI, w.wyI), Math.hypot(w.wxJ, w.wyJ));
  }
  if (peak === 0) return [];

  const scale = (SPAN_LOAD_TARGET_FRACTION * diagonal) / peak;
  const pitch = SPAN_LOAD_ARROW_PITCH_FRACTION * diagonal;
  const shortestArrow = SPAN_LOAD_MINIMUM_ARROW * SPAN_LOAD_TARGET_FRACTION * diagonal;

  return model.elements.flatMap((element) => {
    const w = byElement.get(element.id);
    const start = positions.get(element.from);
    const end = positions.get(element.to);
    if (w === undefined || start === undefined || end === undefined) return [];

    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length === 0) return [];

    /** The point on the member at s, and the tail of the arrow standing there. */
    const at = (s: number) => {
      const on = { x: start.x + (end.x - start.x) * s, y: start.y + (end.y - start.y) * s };
      const wx = w.wxI + (w.wxJ - w.wxI) * s;
      const wy = w.wyI + (w.wyJ - w.wyI) * s;
      return {
        on,
        tail: { x: on.x - wx * scale, y: on.y - wy * scale },
      };
    };

    const count = Math.min(
      MAX_SPAN_LOAD_ARROWS,
      Math.max(MIN_SPAN_LOAD_ARROWS, Math.round(length / pitch)),
    );

    const arrows = Array.from({ length: count + 1 }, (_unused, index) => at(index / count))
      .filter(({ on, tail }) => Math.hypot(on.x - tail.x, on.y - tail.y) >= shortestArrow)
      .map(({ on, tail }) => ({ from: tail, to: on }));

    return [
      {
        elementId: element.id,
        from: at(0).tail,
        to: at(1).tail,
        arrows,
      },
    ];
  });
}

function buildForceLoads(
  model: FrameModel,
  positions: ReadonlyMap<NodeId, Point>,
  transform: ViewTransform,
): RenderedForce[] {
  return model.loads.flatMap((load, index) => {
    const position = positions.get(load.node);
    if (position === undefined) return [];

    const magnitude = Math.hypot(load.fx, load.fy);
    if (magnitude === 0) return [];

    const at = transform.toScreen(position);
    return [
      {
        key: `force-${index}-${load.node}`,
        at,
        to: {
          x: at.x + (load.fx / magnitude) * LOAD_ARROW_LENGTH,
          // Negated because screen Y grows downward: an upward load must draw
          // upward.
          y: at.y - (load.fy / magnitude) * LOAD_ARROW_LENGTH,
        },
      },
    ];
  });
}

/** Places the curved arrows that stand for applied moments. */
function buildMomentLoads(
  model: FrameModel,
  positions: ReadonlyMap<NodeId, Point>,
  transform: ViewTransform,
): RenderedMoment[] {
  return model.loads.flatMap((load, index) => {
    if (load.mz === 0) return [];
    const position = positions.get(load.node);
    if (position === undefined) return [];

    return [
      {
        key: `moment-${index}-${load.node}`,
        at: transform.toScreen(position),
        counterClockwise: load.mz > 0,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Internal-force diagrams
// ---------------------------------------------------------------------------

/** One member's diagram, still in model coordinates. */
interface MemberDiagram {
  readonly id: number;
  readonly from: Point;
  readonly to: Point;
  readonly samples: readonly DiagramSample[];
  readonly plotSign: 1 | -1;
  readonly lobes: readonly DiagramLobe[];
}

/**
 * Builds every member's diagram, in model coordinates.
 *
 * Elements missing from the solution are skipped rather than drawn empty: an
 * element with no end forces has no diagram, and inventing a flat zero for it
 * would claim it carries nothing.
 */
function buildMemberDiagrams(
  model: FrameModel,
  positions: ReadonlyMap<NodeId, Point>,
  results: ReadonlyMap<number, ElementResult>,
  kind: DiagramKind,
  scale: number,
): MemberDiagram[] {
  const plotSign = diagramPlotSign(kind);

  return model.elements.flatMap((element) => {
    const from = positions.get(element.from);
    const to = positions.get(element.to);
    const result = results.get(element.id);
    if (from === undefined || to === undefined || result === undefined) return [];

    const samples = memberDiagramSamplesFor(result, kind);
    return [
      {
        id: element.id,
        from,
        to,
        samples,
        plotSign,
        lobes: memberDiagramLobes(from, to, samples, plotSign, scale),
      },
    ];
  });
}

/**
 * Where a label sits relative to its ordinate, given the outward direction in
 * SCREEN space.
 *
 * The gap alone does not keep a label off the joint. A centred label grows
 * BOTH ways from its anchor point, so pushing it 12px clear of a node and then
 * letting half of a six-character number grow back over it puts the text on
 * the node marker again — which is exactly what a near-zero ordinate did: at
 * the pinned base the "0.00" ended one pixel from the centre of the node
 * circle.
 *
 * So the anchor follows the direction of travel. A label pushed left is
 * anchored at its right edge, one pushed down hangs from its top edge, and the
 * text then only ever grows AWAY from the structure.
 *
 * Exported for the tests: the failure it prevents is a collision, which no
 * type check and no assertion about a coordinate would catch.
 */
export function diagramLabelPlacement(outward: Point): {
  anchor: 'start' | 'middle' | 'end';
  baseline: 'middle' | 'hanging' | 'auto';
  gap: number;
} {
  const horizontal = Math.abs(outward.x) >= Math.abs(outward.y);

  if (horizontal) {
    return {
      anchor: outward.x > 0 ? 'start' : 'end',
      baseline: 'middle',
      gap: DIAGRAM_LABEL_GAP,
    };
  }

  const downward = outward.y > 0;
  return {
    anchor: 'middle',
    // `hanging` puts the top of the text on the point, `auto` the alphabetic
    // baseline — so the glyphs fall below or sit above it, never across it.
    baseline: downward ? 'hanging' : 'auto',
    // Upward is the crowded direction: the node's own number lives there.
    gap: downward ? DIAGRAM_LABEL_GAP : DIAGRAM_LABEL_GAP + NODE_LABEL_CLEARANCE,
  };
}

/**
 * The value labels at ends i and j of one member.
 *
 * The outward direction is derived by projecting TWO model points — the
 * ordinate tip and a point one model unit beyond it — and subtracting. The
 * transform is affine with a uniform scale and a Y flip, so that recovers the
 * direction on screen exactly, including the flip, without this function
 * having to know the member's angle or restate the sign convention.
 *
 * The distance, unlike the direction, is a pixel value: it exists to clear
 * glyphs, and type does not scale with the structure.
 */
function buildDiagramLabels(
  diagram: MemberDiagram,
  scale: number,
  transform: ViewTransform,
): RenderedDiagramLabel[] {
  const ends = [diagram.samples[0], diagram.samples[diagram.samples.length - 1]];

  return ends.flatMap((sample, index) => {
    if (sample === undefined) return [];

    const tip = diagramOrdinatePoint(diagram.from, diagram.to, sample, diagram.plotSign, scale);
    const beyond = diagramOrdinatePoint(
      diagram.from,
      diagram.to,
      sample,
      diagram.plotSign,
      scale,
      1,
    );
    if (tip === null || beyond === null) return [];

    const tipOnScreen = transform.toScreen(tip);
    const beyondOnScreen = transform.toScreen(beyond);

    const dx = beyondOnScreen.x - tipOnScreen.x;
    const dy = beyondOnScreen.y - tipOnScreen.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];

    const outward = { x: dx / length, y: dy / length };
    const { anchor, baseline, gap } = diagramLabelPlacement(outward);

    return [
      {
        key: `diagram-label-${diagram.id}-${index === 0 ? 'i' : 'j'}`,
        at: {
          x: tipOnScreen.x + outward.x * gap,
          y: tipOnScreen.y + outward.y * gap,
        },
        // Two decimals, fixed: the spec the students read from. `formatFixed`
        // also prints a positive zero, so a rounded-away negative cannot show
        // up as "-0.00" and read as a sign error.
        text: formatFixed(sample.value, 2),
        positive: sample.value >= 0,
        anchor,
        baseline,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/**
 * The filled diagram lobes.
 *
 * Fill and stroke are the same colour at different opacities: the outline is
 * what carries the shape, the wash is what makes the enclosed area read as a
 * quantity. At full opacity the fill would bury the members and the supports
 * it is drawn over; at 0.3 the structure still shows through it.
 *
 * `strokeLinejoin="round"` matters at the tip of a triangular lobe, where two
 * nearly parallel edges meet: a mitre there spikes out to several times the
 * stroke width and reads as an ordinate that is not in the numbers.
 */
function DiagramLayer({ lobes }: { lobes: readonly RenderedLobe[] }) {
  return (
    <g>
      {lobes.map((lobe) => {
        const colour = diagramStroke(lobe.positive);
        return (
          <polygon
            key={lobe.key}
            points={lobe.points.map((point) => `${point.x},${point.y}`).join(' ')}
            style={{ fill: colour, stroke: colour }}
            fillOpacity={0.3}
            strokeWidth={1.6}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
}

/**
 * The numeric ordinates at each member end.
 *
 * Drawn with a halo — the canvas colour stroked behind the glyphs through
 * `paint-order: stroke` — because these labels land wherever the diagram puts
 * them, which regularly means on top of a member, a support or the neighbouring
 * lobe. Without it a number over a filled lobe is unreadable exactly where the
 * force is largest.
 */
function DiagramLabelLayer({ labels }: { labels: readonly RenderedDiagramLabel[] }) {
  return (
    <g>
      {labels.map((label) => (
        <text
          key={label.key}
          x={label.at.x}
          y={label.at.y}
          textAnchor={label.anchor}
          dominantBaseline={label.baseline}
          className="num text-[10px] font-semibold"
          style={{
            fill: diagramStroke(label.positive),
            stroke: CANVAS_HALO,
            strokeWidth: 3,
            paintOrder: 'stroke',
          }}
        >
          {label.text}
        </text>
      ))}
    </g>
  );
}

function MemberLayer({ members }: { members: readonly Member[] }) {
  return (
    <g>
      {members.map((member) => (
        <line
          key={`member-${member.id}`}
          x1={member.from.x}
          y1={member.from.y}
          x2={member.to.x}
          y2={member.to.y}
          style={{ stroke: BAR_STROKE[member.state] }}
          strokeWidth={3.25}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

/**
 * The bent members.
 *
 * A polyline of the element's own cubic interpolation, not a straight line
 * between displaced joints: see `deformedMemberPoints`.
 */
function DeflectedLayer({ paths }: { paths: readonly DeflectedPath[] }) {
  return (
    <g opacity={0.9}>
      {paths.map((path) => (
        <polyline
          key={`deflected-${path.id}`}
          points={path.points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          style={{ stroke: DEFORMED_STROKE }}
          strokeWidth={1.9}
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

function NodeLayer({ nodes }: { nodes: readonly RenderedNode[] }) {
  return (
    <g>
      {nodes.map((node) => (
        <g key={`node-${node.id}`}>
          <circle
            cx={node.at.x}
            cy={node.at.y}
            r={5}
            style={{ fill: NODE_FILL, stroke: NODE_STROKE }}
            strokeWidth={2}
          />
          <text
            x={node.at.x}
            y={node.at.y - 11}
            textAnchor="middle"
            className="fill-ink-faint font-mono text-[10px] font-medium"
          >
            {node.id}
          </text>
        </g>
      ))}
    </g>
  );
}

/**
 * Support symbols, one per support type.
 *
 * The rotational restraint is what the symbol has to communicate, because it
 * is what the analysis turns on:
 *
 *   fixed   x, y and rz  -> a hatched wall face through the node
 *   pinned  x and y      -> a triangle with a hatched base
 *   roller  one of them  -> a triangle over a free line
 *
 * A support that restrains only X resists horizontally, so its symbol is the
 * vertical one rotated a quarter turn.
 */
function SupportLayer({ supports }: { supports: readonly RenderedSupport[] }) {
  return (
    <g>
      {supports.map((support) => {
        const rotation = support.restrainY ? 0 : -90;
        const isFixed = support.restrainRz;
        const isPinned = !isFixed && support.restrainX && support.restrainY;

        return (
          <g
            key={`support-${support.node}`}
            transform={`translate(${support.at.x} ${support.at.y}) rotate(${rotation})`}
            style={{ stroke: SUPPORT_STROKE }}
            strokeWidth={1.5}
            fill="none"
          >
            {isFixed ? <FixedSymbol /> : <TriangleSymbol pinned={isPinned} />}
          </g>
        );
      })}
    </g>
  );
}

/** Hatching under a wall face: the conventional mark for a rigid boundary. */
function Hatching({ y, from, to }: { y: number; from: number; to: number }) {
  const ticks = [];
  for (let x = from; x <= to; x += 6) {
    ticks.push(<line key={`hatch-${x}`} x1={x} y1={y} x2={x - 4} y2={y + 6} />);
  }
  return <g strokeWidth={1.2}>{ticks}</g>;
}

/** Empotramiento: the node is welded to the wall, rotation included. */
function FixedSymbol() {
  return (
    <g>
      <line x1={-14} y1={0} x2={14} y2={0} strokeWidth={2} />
      <Hatching y={0} from={-11} to={13} />
    </g>
  );
}

/** Pinned or roller: a triangle whose apex sits at the node, so it can rotate. */
function TriangleSymbol({ pinned }: { pinned: boolean }) {
  return (
    <g>
      <path
        d="M 0 0 L -9 15 L 9 15 Z"
        style={{ fill: pinned ? SUPPORT_FILL_PINNED : SUPPORT_FILL_ROLLER }}
      />
      {pinned ? (
        <g>
          <line x1={-11} y1={15} x2={11} y2={15} strokeWidth={1.2} />
          <Hatching y={15} from={-9} to={9} />
        </g>
      ) : (
        <line x1={-11} y1={19} x2={11} y2={19} />
      )}
    </g>
  );
}

/**
 * Span loads: an envelope with a row of arrows hanging from it onto the member.
 *
 * Square caps and no rounding, like every other edge in this skin. The
 * envelope is the heavier of the two strokes because it is the shape of the
 * load — a rectangle or a wedge, read at a glance — while the arrows are the
 * repeated mark that says which way it acts.
 *
 * `shapeRendering="crispEdges"` on the arrows only. A dozen thin near-parallel
 * lines are exactly where antialiasing produces visibly uneven weights, and
 * they are short enough that snapping them to the pixel grid costs nothing.
 * The envelope keeps its smoothing, since it can sit at any angle.
 */
function SpanLoadLayer({ loads }: { loads: readonly RenderedSpanLoad[] }) {
  return (
    <g>
      {loads.map((load) => (
        <g key={load.key}>
          {load.arrows.map((arrow, index) => (
            <line
              key={`${load.key}-arrow-${index}`}
              x1={arrow.from.x}
              y1={arrow.from.y}
              x2={arrow.to.x}
              y2={arrow.to.y}
              style={{ stroke: LOAD_STROKE }}
              strokeWidth={1.5}
              strokeLinecap="square"
              shapeRendering="crispEdges"
              markerEnd="url(#frame-load-arrow)"
            />
          ))}
          <line
            x1={load.from.x}
            y1={load.from.y}
            x2={load.to.x}
            y2={load.to.y}
            style={{ stroke: LOAD_STROKE }}
            strokeWidth={2.5}
            strokeLinecap="square"
          />
        </g>
      ))}
    </g>
  );
}

function ForceLoadLayer({ loads }: { loads: readonly RenderedForce[] }) {
  return (
    <g>
      {loads.map((load) => (
        <line
          key={load.key}
          x1={load.at.x}
          y1={load.at.y}
          x2={load.to.x}
          y2={load.to.y}
          style={{ stroke: LOAD_STROKE }}
          strokeWidth={2}
          markerEnd="url(#frame-load-arrow)"
        />
      ))}
    </g>
  );
}

/** Radius of the curved moment arrow, in pixels. */
const MOMENT_ARC_RADIUS = 17;

/**
 * Applied moments, as a three-quarter circular arrow around the node.
 *
 * A moment has no line of action, so a straight arrow cannot express it. The
 * arc turns the way the moment acts — counter-clockwise for a positive Mz,
 * which is the sign convention the input table states.
 *
 * On the sweep flag: SVG measures angles in a Y-DOWN space, so an arc drawn
 * with sweep = 0 appears counter-clockwise on screen, not clockwise. Getting
 * this backwards would draw every moment turning the wrong way, which is
 * exactly the kind of error a reader would trust rather than question.
 */
function MomentLoadLayer({ loads }: { loads: readonly RenderedMoment[] }) {
  return (
    <g>
      {loads.map((load) => (
        <path
          key={load.key}
          d={momentArcPath(load.at, load.counterClockwise)}
          fill="none"
          style={{ stroke: LOAD_STROKE }}
          strokeWidth={2}
          strokeLinecap="round"
          markerEnd="url(#frame-load-arrow)"
        />
      ))}
    </g>
  );
}

/** Builds the 270-degree arc of a moment arrow, in screen coordinates. */
export function momentArcPath(centre: Point, counterClockwise: boolean): string {
  const startAngle = counterClockwise ? Math.PI / 4 : -Math.PI / 4;
  const sweepDirection = counterClockwise ? -1 : 1;
  const endAngle = startAngle + sweepDirection * (3 * Math.PI) / 2;

  const point = (angle: number): Point => ({
    x: centre.x + MOMENT_ARC_RADIUS * Math.cos(angle),
    y: centre.y + MOMENT_ARC_RADIUS * Math.sin(angle),
  });

  const start = point(startAngle);
  const end = point(endAngle);
  const sweepFlag = counterClockwise ? 0 : 1;

  return (
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ` +
    `A ${MOMENT_ARC_RADIUS} ${MOMENT_ARC_RADIUS} 0 1 ${sweepFlag} ` +
    `${end.x.toFixed(2)} ${end.y.toFixed(2)}`
  );
}

function EmptyCanvas() {
  return (
    <div className="flex h-full w-full items-center justify-center px-6">
      <p className="text-ink-faint text-center text-sm">
        Define nodos y barras para ver la estructura.
      </p>
    </div>
  );
}
