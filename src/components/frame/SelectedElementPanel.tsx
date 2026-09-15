/**
 * Detail panel for one member: its geometry, its internal forces at both ends
 * and its 6x6 stiffness matrix in global coordinates.
 *
 * This is the panel that makes the tool teachable rather than just usable.
 * A student is asked to build [k]e by hand for a given member; seeing the same
 * matrix the solver assembled, next to the C and S that produced it, is what
 * lets them find their own arithmetic mistake.
 *
 * The matrix comes straight from the solution: it is the very matrix the
 * assembler scattered into K, not a second computation that could drift from
 * the engine.
 */

import { MatrixTable, elementDofLabels } from './MatrixTable';
import { Card, CardBody, CardHeader } from '../ui/Card';
import type { ElementResult, FrameElement } from '../../types/frame';
import { formatFixed, formatNumber } from '../../utils/format';
import { STATE_LABEL, STATE_TEXT } from '../../utils/theme';
import { engineToMegapascal } from '../../utils/unit-conversion';
import { UNITS } from '../../utils/units';

export interface SelectedElementPanelProps {
  /** The model element, source of E, A and I. Undefined when none is selected. */
  element: FrameElement | undefined;
  /** The solved result for that element, source of the geometry and forces. */
  result: ElementResult | undefined;
}

export function SelectedElementPanel({ element, result }: SelectedElementPanelProps) {
  if (element === undefined || result === undefined) {
    return (
      // Nothing is selected, so on paper this card would be an instruction to
      // click something — an invitation the reader of a PDF cannot accept.
      <Card className="print:hidden">
        <CardHeader title="Elemento seleccionado" />
        <CardBody>
          <p className="rounded-inset border-line-strong text-ink-faint border border-dashed bg-wash/2 px-4 py-10 text-center text-sm">
            Selecciona una barra en la tabla inferior para revisar sus propiedades, sus fuerzas
            internas y su matriz de rigidez.
          </p>
        </CardBody>
      </Card>
    );
  }

  const { geometry, endForces } = result;

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader
        title={`Elemento seleccionado · e${element.id}`}
        subtitle={`Barra entre los nodos n${element.from} y n${element.to}`}
      />
      <CardBody className="space-y-8">
        {/*
          Container queries, not viewport breakpoints. This card sits in the
          right-hand column, so its width has little to do with the width of
          the window: at a 1200px viewport the column is only ~420px, and a
          plain `lg:grid-cols-4` would squeeze four tiles into it and wrap
          every label onto three lines. `@container` measures the space the
          tiles actually have.
        */}
        <div className="@container space-y-6">
          <section className="space-y-3">
            <h3 className="text-ink-faint text-[11px] font-semibold tracking-[0.18em] uppercase">
              Geometría
            </h3>
            <div className="grid grid-cols-2 gap-4 @sm:grid-cols-4">
              <Metric
                label="Longitud L"
                value={`${formatFixed(geometry.length, 4)} ${UNITS.length}`}
              />
              <Metric label="Ángulo θ" value={`${formatFixed(geometry.angleDeg, 2)}°`} />
              <Metric label="cos θ = C" value={formatFixed(geometry.cos, 4)} />
              <Metric label="sen θ = S" value={formatFixed(geometry.sin, 4)} />
            </div>
          </section>

          {/*
            The internal forces, grouped by end rather than by kind. A frame
            member is checked end by end — the design moment and the shear
            that goes with it belong to the same section — so the tiles are
            ordered the way the check is performed.
          */}
          <section className="space-y-3">
            <h3 className="text-ink-faint text-[11px] font-semibold tracking-[0.18em] uppercase">
              Fuerzas internas
            </h3>
            <div className="grid grid-cols-2 gap-4 @sm:grid-cols-3">
              <Metric
                label="Axial N"
                value={`${formatNumber(endForces.axialForce, 5)} ${UNITS.force}`}
                tone={STATE_TEXT[result.state]}
                note={STATE_LABEL[result.state]}
              />
              <Metric
                label={`Cortante V en n${element.from}`}
                value={`${formatNumber(endForces.shearI, 5)} ${UNITS.force}`}
              />
              <Metric
                label={`Momento M en n${element.from}`}
                value={`${formatNumber(endForces.momentI, 5)} ${UNITS.moment}`}
              />
              <Metric
                label="Esfuerzo axial σ"
                value={`${formatNumber(engineToMegapascal(result.axialStress), 5)} ${UNITS.stress}`}
                tone={STATE_TEXT[result.state]}
              />
              <Metric
                label={`Cortante V en n${element.to}`}
                value={`${formatNumber(endForces.shearJ, 5)} ${UNITS.force}`}
              />
              <Metric
                label={`Momento M en n${element.to}`}
                value={`${formatNumber(endForces.momentJ, 5)} ${UNITS.moment}`}
              />
            </div>
          </section>
        </div>

        <div>
          <h3 className="font-display text-ink text-sm font-semibold tracking-tight">
            Matriz de rigidez [k]<sub>e</sub> en coordenadas globales
          </h3>
          <p className="text-ink-faint mt-2 text-xs">
            6 × 6. Filas y columnas en el orden u<sub>i</sub>, v<sub>i</sub>, θ<sub>i</sub>, u
            <sub>j</sub>, v<sub>j</sub>, θ<sub>j</sub>. La diagonal está resaltada.
          </p>

          <div className="mt-5">
            <MatrixTable
              matrix={result.stiffness}
              labels={elementDofLabels(element.from, element.to)}
            />
          </div>

          <p className="text-ink-faint mt-3 text-xs">
            Unidades: {UNITS.force}/{UNITS.length} en las filas de traslación y {UNITS.moment} por
            radián en las de giro.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

/** One metric tile of the top block. */
function Metric({
  label,
  value,
  tone = 'text-ink',
  note,
}: {
  label: string;
  value: string;
  /** Text colour class, used to carry the tension/compression convention. */
  tone?: string;
  /** Optional word under the value, e.g. the axial state. */
  note?: string;
}) {
  return (
    <div className="rounded-inset border-line hover:border-line-strong border bg-wash/3 p-4 transition-colors">
      <p className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">{label}</p>
      <p className={`num mt-1 text-base font-semibold ${tone}`}>{value}</p>
      {note && <p className={`mt-0.5 text-xs font-medium ${tone}`}>{note}</p>}
    </div>
  );
}
