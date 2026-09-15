/**
 * Hosts the drawing, the view selector and the magnification controls.
 *
 * All of this is presentation state that nothing outside the panel reads, so
 * it is owned here rather than in the Dashboard: which view is on screen, how
 * far the deflected shape is exaggerated, how tall the diagram ordinates are
 * drawn.
 *
 * The four views share one surface instead of stacking four canvases down the
 * page. A student comparing the shear and the moment on a portal frame wants
 * them in the same place at the same size, and four panels would mean four
 * different fits of the same structure.
 */

import { useEffect, useMemo, useState } from 'react';

import { FrameCanvas } from './FrameCanvas';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { SegmentedControl } from '../ui/SegmentedControl';
import type { SegmentOption } from '../ui/SegmentedControl';
import type { SolverState } from '../../hooks/useFrameSolver';
import type { FrameModel } from '../../types/frame';
import type { ViewMode } from '../../utils/diagrams';
import {
  isDiagramMode,
  memberDiagramSamplesFor,
  peakOrdinate,
  suggestDiagramScale,
} from '../../utils/diagrams';
import { formatFixed, formatNumber } from '../../utils/format';
import { DIAGRAM_LABEL, DIAGRAM_SIGN_LABEL, DIAGRAM_SYMBOL } from '../../utils/theme';
import { UNITS } from '../../utils/units';
import { computeBounds, suggestDeformationScale } from '../../utils/viewport';

export interface FrameViewportProps {
  model: FrameModel;
  solverState: SolverState;
  /** True when the model has changed since the results were produced. */
  isOutdated: boolean;
}

/** The four views, in the order a course covers them. */
const VIEW_OPTIONS: readonly SegmentOption<ViewMode>[] = [
  { id: 'geometry', label: 'Geometría', shortLabel: 'Geom.' },
  { id: 'deformed', label: 'Deformada', shortLabel: 'Def.' },
  { id: 'axial', label: 'Axial', shortLabel: 'N' },
  { id: 'shear', label: 'Cortante', shortLabel: 'V' },
  { id: 'moment', label: 'Momento', shortLabel: 'M' },
];

/** How far the ordinate slider can push past the automatic scale. */
const MAXIMUM_DIAGRAM_ZOOM = 3;

export function FrameViewport({ model, solverState, isOutdated }: FrameViewportProps) {
  /**
   * An outdated solution is dropped entirely, not dimmed.
   *
   * The canvas draws the *current* geometry, so overlaying displacements,
   * axial-force colours or force diagrams computed for a different structure
   * would not merely be stale — it would be a drawing of something that never
   * existed. Undecorated geometry is the only honest thing to show until the
   * user solves again.
   */
  const solution = solverState.status === 'solved' && !isOutdated ? solverState.solution : null;

  const [requestedMode, setRequestedMode] = useState<ViewMode>('geometry');

  /**
   * Internal forces exist only once the structure has been solved, so without
   * a solution the panel falls back to the geometry instead of showing an
   * empty diagram. The choice is not reset, only overridden: solve again and
   * the view the user picked comes back.
   */
  const viewMode: ViewMode = solution === null ? 'geometry' : requestedMode;
  const diagramKind = isDiagramMode(viewMode) ? viewMode : null;

  const bounds = useMemo(
    () => computeBounds(model.nodes.map((node) => ({ x: node.x, y: node.y }))),
    [model.nodes],
  );

  // -------------------------------------------------------------------------
  // Deflected shape
  // -------------------------------------------------------------------------

  /**
   * A factor that makes the largest displacement reach a readable fraction of
   * the model. Null when nothing moves, in which case there is no deflected
   * shape to show and the control is hidden.
   */
  const suggestedScale = useMemo(() => {
    if (solution === null || bounds === null) return null;
    return suggestDeformationScale(
      bounds,
      solution.nodalDisplacements.map((entry) => ({ x: entry.ux, y: entry.uy })),
      // Rotations are the fallback: a frame can bend with every joint standing
      // still, and then the translations alone would report "nothing moves".
      solution.nodalDisplacements.map((entry) => entry.rz),
    );
  }, [bounds, solution]);

  const [scale, setScale] = useState<number | null>(null);

  // Re-centre the slider on the suggestion whenever the structure changes
  // enough to move it by an order of magnitude. Without this a model edited
  // from metres to millimetres would leave the slider pinned at a factor that
  // renders the deflection either invisible or absurd.
  useEffect(() => {
    if (suggestedScale === null) {
      setScale(null);
      return;
    }
    setScale((current) => {
      if (current === null) return suggestedScale;
      const ratio = current / suggestedScale;
      return ratio > 10 || ratio < 0.1 ? suggestedScale : current;
    });
  }, [suggestedScale]);

  const effectiveScale = scale ?? 0;
  const maximumScale = suggestedScale === null ? 0 : suggestedScale * 4;

  // -------------------------------------------------------------------------
  // Internal-force diagram
  // -------------------------------------------------------------------------

  /** The largest ordinate anywhere in the structure, in kN or kN·m. */
  const peak = useMemo(() => {
    if (solution === null || diagramKind === null) return 0;
    // The same sampler the canvas draws with, so the automatic scale is set
    // by the peak that will actually be plotted. Taking it from the end values
    // alone would under-scale every curved diagram — the midspan moment of a
    // simply supported beam is not at either end.
    return peakOrdinate(
      solution.elements.map((element) => memberDiagramSamplesFor(element, diagramKind)),
    );
  }, [solution, diagramKind]);

  /** Model length per force unit. Null when every ordinate is zero. */
  const suggestedDiagramScale = useMemo(
    () => (bounds === null ? null : suggestDiagramScale(bounds, peak)),
    [bounds, peak],
  );

  /**
   * The ordinate slider is a MULTIPLE of the automatic scale, not the scale
   * itself.
   *
   * A raw factor would be measured in metres per kilonewton, which means
   * nothing to the reader, and it would have to be re-derived every time the
   * view changed — the peak moment and the peak shear are different numbers,
   * so the same factor draws two diagrams of wildly different heights.
   * Multiples of the automatic fit survive the switch untouched.
   */
  const [diagramZoom, setDiagramZoom] = useState(1);
  const diagramScale = (suggestedDiagramScale ?? 0) * diagramZoom;

  const diagramUnit = diagramKind === 'moment' ? UNITS.moment : UNITS.force;

  return (
    // `break-inside-avoid`: the drawing is one object. Split across a page
    // boundary it is not a smaller drawing, it is two halves of a structure.
    <Card className="flex flex-col print:block print:break-inside-avoid">
      <CardHeader
        title="Visualización de la estructura"
        subtitle={
          diagramKind === null
            ? 'Geometría original y deformada'
            : `${DIAGRAM_LABEL[diagramKind]} (${DIAGRAM_SYMBOL[diagramKind]}) en ${diagramUnit}`
        }
      />

      {/*
        The view selector, in a band of its own directly above the drawing.

        It used to be a small chip in the header's `actions` slot, right
        aligned, and it was reliably overlooked — which meant the shear and
        moment diagrams, the whole point of the engine work, were effectively
        undiscoverable. Three things fix that and all three are needed: it is
        full width instead of a chip, it sits in the reader's path down to the
        drawing instead of off in a corner, and it is introduced by a line of
        text telling them it is theirs to click.

        The band leaves the report. The caption in the header above already
        names the active view, so a reader of the PDF is told what they are
        looking at; they simply cannot change it.
      */}
      <div className="border-ink bg-surface-raised border-b px-5 py-4 sm:px-6 print:hidden">
        <p className="text-ink-muted text-[11px] font-semibold tracking-[0.18em] uppercase">
          Selecciona una vista o un diagrama
        </p>

        <SegmentedControl
          className="mt-3"
          options={VIEW_OPTIONS.map((option) => ({
            ...option,
            // Nothing to plot until the structure is solved. Disabled rather
            // than hidden, so the reader can see the diagrams are there and
            // learn what unlocks them.
            disabled: option.id !== 'geometry' && solution === null,
          }))}
          value={viewMode}
          // An arrow rather than the setter itself: `Dispatch<SetStateAction<T>>`
          // accepts an updater function too, so passing it directly makes TS
          // infer the option id as `ViewMode | ((previous) => ViewMode)` and
          // then widen it to `string`, losing the union the control is for.
          onChange={(mode) => setRequestedMode(mode)}
          label="Vista del diagrama"
        />

        {/*
          Said once, only while it is true: until the structure is solved four
          of the five segments are disabled, and a greyed-out row with no
          explanation reads as a broken control rather than a locked one.
        */}
        {solution === null && (
          <p className="text-ink-faint mt-2.5 text-xs">
            Resuelve la estructura para habilitar los diagramas de fuerza axial, cortante y
            momento flector.
          </p>
        )}
      </div>

      <div className="px-5 pt-5 sm:px-6 sm:pt-6 print:p-0">
        {/*
          The drawing surface: graph paper under the frame.

          The mesh is a background layer on the container rather than marks
          inside the SVG, so it never enters the coordinate system the engine
          drives and cannot be mistaken for part of the structure. It is drawn
          on a darker inset than the card, which is what makes the panel read
          as a window cut into the surface rather than a patch laid on it.
        */}
        {/*
          `print-canvas` is the hook the print stylesheet uses to let the SVG
          fill the page width. The drawing carries pixel width and height
          attributes measured by a ResizeObserver, which does not run for the
          print layout — so print CSS overrides those two attributes and lets
          the viewBox rescale the drawing instead of re-measuring it.
        */}
        <div className="print-canvas rounded-inset border-line bg-sunken relative h-80 overflow-hidden border sm:h-96">
          <div
            className="blueprint-grid blueprint-grid--paper fade-edges pointer-events-none absolute inset-0"
            aria-hidden="true"
          />
          <div className="relative h-full w-full">
            <FrameCanvas
              model={model}
              solution={solution}
              deformationScale={effectiveScale}
              viewMode={viewMode}
              diagramScale={diagramScale}
            />
          </div>
        </div>

        <div className="pt-3">
          <Legend
            mode={viewMode}
            showDeformed={viewMode === 'deformed' && suggestedScale !== null && effectiveScale > 0}
          />
        </div>
      </div>

      {viewMode === 'deformed' && suggestedScale !== null && (
        <ScaleControl
          label="Escala deformada"
          ariaLabel="Factor de amplificación de la deformada"
          value={effectiveScale}
          max={maximumScale}
          onChange={setScale}
          onAuto={() => setScale(suggestedScale)}
          accentClass="accent-deformed"
          badgeClass="bg-deformed/15 text-deformed ring-deformed/30"
          readout={`×${formatNumber(effectiveScale, 3)}`}
        />
      )}

      {diagramKind !== null && suggestedDiagramScale !== null && (
        <ScaleControl
          label="Escala diagrama"
          ariaLabel={`Factor de amplificación del diagrama de ${DIAGRAM_LABEL[diagramKind].toLowerCase()}`}
          value={diagramZoom}
          max={MAXIMUM_DIAGRAM_ZOOM}
          onChange={setDiagramZoom}
          onAuto={() => setDiagramZoom(1)}
          accentClass="accent-diagram-positive"
          badgeClass="bg-diagram-positive/15 text-diagram-positive ring-diagram-positive/30"
          readout={`×${formatNumber(diagramZoom, 2)}`}
          // The value the scaling is anchored to. Every ordinate on screen is
          // a fraction of this one, so it is what turns a shape back into a
          // number.
          note={`máx |${DIAGRAM_SYMBOL[diagramKind]}| = ${formatFixed(peak, 2)} ${diagramUnit}`}
        />
      )}

      {diagramKind !== null && suggestedDiagramScale === null && (
        <p className="text-ink-faint px-5 py-5 text-sm sm:px-6">
          Todas las ordenadas de {DIAGRAM_LABEL[diagramKind].toLowerCase()} son nulas, así que no
          hay diagrama que dibujar.
        </p>
      )}

      {diagramKind === null && suggestedScale === null && solution !== null && (
        <p className="text-ink-faint px-5 py-5 text-sm sm:px-6">
          La estructura no se desplaza, así que no hay deformada que amplificar.
        </p>
      )}

      {isOutdated && (
        <p className="text-ink-faint px-5 py-5 text-sm leading-relaxed sm:px-6">
          Se muestra solo la geometría: la deformada, los diagramas de esfuerzos y los colores por
          esfuerzo corresponden al modelo anterior, así que se ocultan hasta que vuelvas a resolver.
        </p>
      )}
    </Card>
  );
}

/**
 * The magnification slider, shared by the deflected shape and the diagrams.
 *
 * One control with two callers rather than two near-identical blocks: they
 * differ in their colour, their units and what "auto" means, and every one of
 * those is a value the caller already holds.
 */
function ScaleControl({
  label,
  ariaLabel,
  value,
  max,
  onChange,
  onAuto,
  accentClass,
  badgeClass,
  readout,
  note,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  max: number;
  onChange(value: number): void;
  onAuto(): void;
  accentClass: string;
  badgeClass: string;
  readout: string;
  note?: string;
}) {
  return (
    /*
      The row survives into the report; only its CONTROLS leave.

      The slider and the Auto button are meaningless on paper. The readout is
      the opposite of meaningless: a deflected shape drawn at ×34.8 is not a
      picture of the structure's displacements, it is a picture of them
      exaggerated thirty-four times, and a report that shows the curve without
      the factor invites the reader to measure it. The number stays.
    */
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-5 sm:px-6 print:gap-x-3 print:py-2">
      {/*
        `w-full` below sm, `flex-1` above it. As a flex item with `min-w-0` it
        is allowed to shrink past its own contents, so on a phone it would not
        wrap — it would squeeze the fixed-width caption and the slider's
        `min-w-24` into a box too small for both, and they would spill out of
        the card. Giving it the whole line first removes the conflict instead
        of hiding it.
      */}
      <label className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1 print:w-auto print:flex-none">
        <span className="text-ink-muted shrink-0 text-sm font-medium">{label}</span>
        {/*
          The accent ties the slider's thumb to the colour of the thing it
          controls — green for the deflected shape, teal for a diagram — so
          the control and its effect are visibly the same subject. This is the
          one place a structural colour is allowed on a control.
        */}
        <input
          type="range"
          min={0}
          max={max}
          step={max / 200}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={ariaLabel}
          className={`${accentClass} bg-wash/15 hover:bg-wash/25 h-1.5 min-w-24 flex-1 cursor-pointer appearance-none transition-colors print:hidden`}
        />
      </label>

      <span
        className={`num shrink-0 px-3 py-1 text-xs font-semibold ring-1 ring-inset ${badgeClass}`}
      >
        {readout}
      </span>

      {note !== undefined && (
        <span className="num text-ink-muted shrink-0 text-xs">{note}</span>
      )}

      <Button size="sm" variant="ghost" onClick={onAuto} className="print:hidden">
        Auto
      </Button>
    </div>
  );
}

/** Colour key for the drawing, following whichever view is on screen. */
function Legend({ mode, showDeformed }: { mode: ViewMode; showDeformed: boolean }) {
  // Swatches read straight from the structural tokens, so the legend cannot
  // drift from the colours the drawing actually uses.
  const wrapper = 'text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs';

  if (isDiagramMode(mode)) {
    const signs = DIAGRAM_SIGN_LABEL[mode];
    return (
      <div className={wrapper}>
        {/* The swatch mirrors how a lobe is actually painted: a 30% wash
            inside a solid outline. A flat solid chip would promise a fill the
            drawing never uses. */}
        <span className="inline-flex items-center gap-1.5">
          <span className="border-diagram-positive bg-diagram-positive/30 h-3 w-4 rounded-[3px] border" />
          {signs.positive}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="border-diagram-negative bg-diagram-negative/30 h-3 w-4 rounded-[3px] border" />
          {signs.negative}
        </span>
        <span className="text-ink-faint">Valores en los extremos i y j de cada barra.</span>
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-tension h-0.5 w-4" />
        Tracción
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-compression h-0.5 w-4" />
        Compresión
      </span>
      {showDeformed && (
        <span className="inline-flex items-center gap-1.5">
          <span className="border-deformed h-0 w-4 border-t-2 border-dashed" />
          Deformada
        </span>
      )}
    </div>
  );
}
