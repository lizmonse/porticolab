/**
 * Form 2: members with their material and section.
 *
 * E, A and I are shown in GPa, mm² and cm⁴ — the units a section table is
 * written in — and converted to the engine's kN/m², m² and m⁴ at this
 * boundary. All the conversion lives in `utils/unit-conversion.ts`; nothing
 * below this component ever sees interface units.
 *
 * I is the column a truss did not need. It is also the one where a unit
 * mistake is invisible: an area conversion applied to a fourth power is wrong
 * by 10 000 and the model still solves, so the conversion is confined to one
 * named function with its own tests rather than written inline here.
 */

import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState, TableBody, TableCell, TableHead, TableRow, TableScroll } from '../ui/DataTable';
import { NumberField } from '../ui/NumberField';
import { Select } from '../ui/Select';
import { PlusIcon, TrashIcon } from '../ui/icons';
import type { FrameModelStore } from '../../hooks/useFrameModel';
import { elementLength } from '../../lib/frame/geometry';
import { formatFixed } from '../../utils/format';
import { UNITS } from '../../utils/units';
import {
  engineToGigapascal,
  engineToQuarticCentimetre,
  engineToSquareMillimetre,
  gigapascalToEngine,
  quarticCentimetreToEngine,
  squareMillimetreToEngine,
} from '../../utils/unit-conversion';

export interface ElementsCardProps {
  store: FrameModelStore;
}

export function ElementsCard({ store }: ElementsCardProps) {
  const { model } = store;
  const canAdd = model.nodes.length >= 2;

  const nodeOptions = model.nodes.map((node) => ({
    value: node.id,
    label: `n${node.id}`,
  }));

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

  /**
   * The member's length, derived from its end nodes rather than stored.
   *
   * L is not an input and must never become one: it is a consequence of the
   * coordinates, and a second copy of it would be one more thing that can
   * disagree with the geometry. Computed with the ENGINE's own
   * `elementLength`, so the number the table prints is the number the
   * stiffness matrix was built from.
   */
  const lengthOf = (from: number, to: number): number | null => {
    const start = nodeById.get(from);
    const end = nodeById.get(to);
    if (start === undefined || end === undefined) return null;
    return elementLength(start.x, start.y, end.x, end.y);
  };

  const totalLength = model.elements.reduce(
    (sum, element) => sum + (lengthOf(element.from, element.to) ?? 0),
    0,
  );

  return (
    <Card>
      <CardHeader
        title="2. Propiedades de material y sección transversal"
        subtitle={`${model.elements.length} ${
          model.elements.length === 1 ? 'elemento' : 'elementos'
        } · Conectividad, longitud L, módulo de elasticidad E, área A e inercia I`}
        actions={
          <Button variant="primary" size="sm" onClick={store.addElement} disabled={!canAdd}>
            <PlusIcon className="size-4" />
            Agregar elemento
          </Button>
        }
      />
      <CardBody>
        {model.elements.length === 0 ? (
          <EmptyState>
            {canAdd
              ? 'Conecta dos nodos con una barra.'
              : 'Necesitas al menos dos nodos para crear una barra.'}
          </EmptyState>
        ) : (
          <TableScroll>
            <TableHead
              columns={[
                'Elemento',
                'Nodo i',
                'Nodo j',
                `L (${UNITS.length})`,
                `E (${UNITS.modulus})`,
                `A (${UNITS.area})`,
                `I (${UNITS.inertia})`,
                '',
              ]}
            />
            <TableBody>
              {model.elements.map((element) => (
                <TableRow key={element.id}>
                  <TableCell className="num text-ink font-semibold whitespace-nowrap">
                    e{element.id}
                  </TableCell>

                  <TableCell>
                    <Select
                      label={`Nodo inicial del elemento ${element.id}`}
                      value={element.from}
                      options={nodeOptions}
                      onChange={(from) => store.updateElement(element.id, { from })}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      label={`Nodo final del elemento ${element.id}`}
                      value={element.to}
                      options={nodeOptions}
                      onChange={(to) => store.updateElement(element.id, { to })}
                    />
                  </TableCell>

                  {/*
                    Read-only, and visually distinct from every editable cell
                    around it: same monospaced figures so it lines up with the
                    numbers it sits between, but no field box, because a box
                    invites a click that will not do anything.
                  */}
                  <TableCell align="right" className="num text-ink-muted whitespace-nowrap">
                    {(() => {
                      const length = lengthOf(element.from, element.to);
                      return length === null ? '—' : formatFixed(length, 3);
                    })()}
                  </TableCell>

                  <TableCell>
                    <NumberField
                      label={`Módulo de elasticidad del elemento ${element.id}, en GPa`}
                      value={engineToGigapascal(element.E)}
                      onChange={(gigapascal) =>
                        store.updateElement(element.id, { E: gigapascalToEngine(gigapascal) })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Área de la sección del elemento ${element.id}, en mm²`}
                      value={engineToSquareMillimetre(element.A)}
                      onChange={(squareMillimetre) =>
                        store.updateElement(element.id, {
                          A: squareMillimetreToEngine(squareMillimetre),
                        })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Momento de inercia del elemento ${element.id}, en cm⁴`}
                      value={engineToQuarticCentimetre(element.I)}
                      onChange={(quarticCentimetre) =>
                        store.updateElement(element.id, {
                          I: quarticCentimetreToEngine(quarticCentimetre),
                        })
                      }
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => store.removeElement(element.id)}
                      aria-label={`Eliminar el elemento ${element.id}`}
                      title={`Eliminar el elemento ${element.id}`}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableScroll>
        )}

        {/*
          The explicit summary. It repeats the count already in the subtitle on
          purpose: the subtitle is read once on arrival, this line sits at the
          bottom of the table where the eye lands after scanning it, and it is
          the only place the total length appears at all.
        */}
        {model.elements.length > 0 && (
          <dl className="bg-line-strong border-ink mt-5 grid grid-cols-2 gap-px border">
            <div className="bg-surface-raised px-4 py-3">
              <dt className="text-ink-faint text-[10px] font-semibold tracking-[0.18em] uppercase">
                Número de elementos
              </dt>
              <dd className="num text-ink mt-1 text-lg font-semibold">
                {model.elements.length}
              </dd>
            </div>
            <div className="bg-surface-raised px-4 py-3">
              <dt className="text-ink-faint text-[10px] font-semibold tracking-[0.18em] uppercase">
                Longitud total
              </dt>
              <dd className="num text-ink mt-1 text-lg font-semibold">
                {formatFixed(totalLength, 3)} {UNITS.length}
              </dd>
            </div>
          </dl>
        )}

        {model.elements.length > 0 && (
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            Acero estructural: E ≈ 200–210 GPa. Valores de referencia para un IPE 300: A = 5380 mm²,
            I = 8356 cm⁴. La inercia gobierna la rigidez a flexión, así que un error de escala en
            esta columna cambia por completo la deformada. El orden de los nodos i y j no altera el
            resultado.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
