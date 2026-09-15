/**
 * Form 3: loads spread along a member.
 *
 * ---------------------------------------------------------------------------
 * Why this table exists
 * ---------------------------------------------------------------------------
 * The engine gained span loads, and the two curved diagrams they produce were
 * the point of the whole exercise — but a feature no form can reach is a
 * feature the user does not have. Without this card the shear and moment views
 * would still draw the straight lines they always drew, because nothing could
 * ever put a span load into the model.
 *
 * ---------------------------------------------------------------------------
 * One row, three shapes
 * ---------------------------------------------------------------------------
 * The row asks for the intensity at each end of the member, which is the same
 * decision the model makes: equal values are a uniform load, a zero at one end
 * is a triangular one, and anything else is a trapezoid. The shape is shown
 * back as a read-only label so the user can see which of the three they have
 * typed, but nothing branches on it.
 *
 * Intensities are GLOBAL components, so a gravity load is written as a
 * negative `wy` on every member regardless of its inclination — including a
 * column, where the load is then purely axial. The footnote says so, because
 * the alternative reading (perpendicular to the member) is the one a student
 * is more likely to assume.
 */

import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState, TableBody, TableCell, TableHead, TableRow, TableScroll } from '../ui/DataTable';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { PlusIcon, TrashIcon } from '../ui/icons';
import type { FrameModelStore } from '../../hooks/useFrameModel';
import { classifyDistributedLoad } from '../../lib/frame/postprocess';
import type { DistributedLoadShape } from '../../types/frame';
import { UNITS } from '../../utils/units';

export interface DistributedLoadsCardProps {
  store: FrameModelStore;
}

/** Spanish name of each shape, for the read-only column. */
const SHAPE_LABEL: Record<DistributedLoadShape, string> = {
  zero: '—',
  uniform: 'Uniforme',
  triangular: 'Triangular',
  trapezoidal: 'Trapezoidal',
};

export function DistributedLoadsCard({ store }: DistributedLoadsCardProps) {
  const { model } = store;
  const loads = model.distributedLoads ?? [];
  const canAdd = model.elements.length > 0;

  const elementOptions = model.elements.map((element) => ({
    value: element.id,
    label: `e${element.id}`,
  }));

  /** Intensity is force per unit length: kN/m. */
  const intensityUnit = `${UNITS.force}/${UNITS.length}`;

  return (
    <Card>
      <CardHeader
        title="3. Cargas distribuidas en barra"
        subtitle={`${loads.length} ${
          loads.length === 1 ? 'carga' : 'cargas'
        } · Intensidad en los extremos i y j, en componentes globales`}
        actions={
          <Button variant="primary" size="sm" onClick={store.addDistributedLoad} disabled={!canAdd}>
            <PlusIcon className="size-4" />
            Agregar carga
          </Button>
        }
      />
      <CardBody>
        {loads.length === 0 ? (
          <EmptyState>
            {canAdd
              ? 'Sin cargas repartidas. Añade una para ver los diagramas de cortante y momento como curvas.'
              : 'Necesitas al menos una barra para repartir una carga sobre ella.'}
          </EmptyState>
        ) : (
          <TableScroll>
            <TableHead
              columns={[
                'Carga',
                'Elemento',
                'Forma',
                `wx en i (${intensityUnit})`,
                `wy en i (${intensityUnit})`,
                `wx en j (${intensityUnit})`,
                `wy en j (${intensityUnit})`,
                '',
              ]}
            />
            <TableBody>
              {loads.map((load) => (
                <TableRow key={load.id}>
                  <TableCell className="num text-ink font-semibold whitespace-nowrap">
                    q{load.id}
                  </TableCell>

                  <TableCell>
                    <Select
                      label={`Elemento sobre el que actúa la carga ${load.id}`}
                      value={load.element}
                      options={elementOptions}
                      onChange={(element) => store.updateDistributedLoad(load.id, { element })}
                    />
                  </TableCell>

                  {/* Derived, never typed: it is a reading of the four numbers
                      to its right, and letting it be set would allow a row
                      whose declared shape contradicts its own intensities. */}
                  <TableCell className="text-ink-muted whitespace-nowrap">
                    {SHAPE_LABEL[classifyDistributedLoad(load)]}
                  </TableCell>

                  <TableCell>
                    <NumberField
                      label={`Intensidad wx en el extremo i de la carga ${load.id}`}
                      value={load.wxI}
                      onChange={(wxI) => store.updateDistributedLoad(load.id, { wxI })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Intensidad wy en el extremo i de la carga ${load.id}`}
                      value={load.wyI}
                      onChange={(wyI) => store.updateDistributedLoad(load.id, { wyI })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Intensidad wx en el extremo j de la carga ${load.id}`}
                      value={load.wxJ}
                      onChange={(wxJ) => store.updateDistributedLoad(load.id, { wxJ })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Intensidad wy en el extremo j de la carga ${load.id}`}
                      value={load.wyJ}
                      onChange={(wyJ) => store.updateDistributedLoad(load.id, { wyJ })}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => store.removeDistributedLoad(load.id)}
                      aria-label={`Eliminar la carga distribuida ${load.id}`}
                      title={`Eliminar la carga distribuida ${load.id}`}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableScroll>
        )}

        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Las intensidades son componentes <strong className="text-ink-muted">globales</strong>, no
          perpendiculares a la barra: el peso propio se escribe siempre como <span className="num">wy</span>{' '}
          negativa, valga la barra horizontal, inclinada o vertical. En una barra inclinada eso
          genera además componente axial, así que la fuerza axial deja de ser constante a lo largo
          del vano. Para una carga uniforme, escribe el mismo valor en los extremos i y j; para una
          triangular, deja uno de los dos en cero.
        </p>
      </CardBody>
    </Card>
  );
}
