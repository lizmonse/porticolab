/**
 * Form 1: nodes, loads and restraints in a single table.
 *
 * One row per node holds everything about that node. The engine keeps
 * coordinates, loads and supports in three separate collections; the
 * flattening happens in `useFrameModel`, so this component only renders rows
 * and writes changes back through one call.
 *
 * A frame node carries three degrees of freedom, so the row grew by two
 * columns against the truss version: the applied moment Mz and the rotational
 * restraint θ = 0, which is the single checkbox that turns a pinned support
 * into a fixed one.
 */

import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { EmptyState, TableBody, TableCell, TableHead, TableRow, TableScroll } from '../ui/DataTable';
import { NumberField } from '../ui/NumberField';
import { Toggle } from '../ui/Toggle';
import { PlusIcon, TrashIcon } from '../ui/icons';
import type { FrameModelStore } from '../../hooks/useFrameModel';
import { UNITS } from '../../utils/units';

export interface NodesCardProps {
  store: FrameModelStore;
}

export function NodesCard({ store }: NodesCardProps) {
  const { nodeRows } = store;

  return (
    <Card>
      <CardHeader
        title="1. Nodos, cargas y apoyos"
        subtitle={`${store.model.nodes.length} ${
          store.model.nodes.length === 1 ? 'nodo' : 'nodos'
        } · Coordenadas, cargas puntuales y grados de libertad restringidos`}
        actions={
          <Button variant="primary" size="sm" onClick={store.addNode}>
            <PlusIcon className="size-4" />
            Agregar nodo
          </Button>
        }
      />
      <CardBody>
        {nodeRows.length === 0 ? (
          <EmptyState>Agrega el primer nodo para empezar a definir el pórtico.</EmptyState>
        ) : (
          <TableScroll>
            <TableHead
              columns={[
                'Nodo',
                `x (${UNITS.length})`,
                `y (${UNITS.length})`,
                `Fx (${UNITS.force})`,
                `Fy (${UNITS.force})`,
                `Mz (${UNITS.moment})`,
                'ux = 0',
                'uy = 0',
                'θz = 0',
                '',
              ]}
            />
            <TableBody>
              {nodeRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="num text-ink font-semibold whitespace-nowrap">
                    n{row.id}
                  </TableCell>

                  <TableCell>
                    <NumberField
                      label={`Coordenada x del nodo ${row.id}`}
                      value={row.x}
                      onChange={(x) => store.updateNodeRow(row.id, { x })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Coordenada y del nodo ${row.id}`}
                      value={row.y}
                      onChange={(y) => store.updateNodeRow(row.id, { y })}
                    />
                  </TableCell>

                  <TableCell>
                    <NumberField
                      label={`Carga horizontal Fx en el nodo ${row.id}`}
                      value={row.fx}
                      onChange={(fx) => store.updateNodeRow(row.id, { fx })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Carga vertical Fy en el nodo ${row.id}`}
                      value={row.fy}
                      onChange={(fy) => store.updateNodeRow(row.id, { fy })}
                    />
                  </TableCell>
                  <TableCell>
                    <NumberField
                      label={`Momento aplicado Mz en el nodo ${row.id}, en ${UNITS.moment}`}
                      value={row.mz}
                      onChange={(mz) => store.updateNodeRow(row.id, { mz })}
                    />
                  </TableCell>

                  <TableCell align="center">
                    <Toggle
                      label={`Restringir el desplazamiento en x del nodo ${row.id}`}
                      checked={row.restrainX}
                      onChange={(restrainX) => store.updateNodeRow(row.id, { restrainX })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Toggle
                      label={`Restringir el desplazamiento en y del nodo ${row.id}`}
                      checked={row.restrainY}
                      onChange={(restrainY) => store.updateNodeRow(row.id, { restrainY })}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Toggle
                      label={`Restringir el giro del nodo ${row.id}`}
                      checked={row.restrainRz}
                      onChange={(restrainRz) => store.updateNodeRow(row.id, { restrainRz })}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => store.removeNode(row.id)}
                      aria-label={`Eliminar el nodo ${row.id}`}
                      title={`Eliminar el nodo ${row.id}`}
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableScroll>
        )}

        {nodeRows.length > 0 && (
          <p className="text-ink-faint mt-4 text-xs leading-relaxed">
            Las fuerzas son positivas hacia la derecha y hacia arriba; el momento{' '}
            <span className="num text-ink-muted font-medium">Mz</span> es positivo en sentido
            antihorario. Marca las tres casillas para un{' '}
            <span className="text-ink-muted font-medium">empotramiento</span>, sólo{' '}
            <span className="num text-ink-muted font-medium">ux</span> y{' '}
            <span className="num text-ink-muted font-medium">uy</span> para un{' '}
            <span className="text-ink-muted font-medium">apoyo articulado</span>, y una sola
            traslación para un <span className="text-ink-muted font-medium">apoyo móvil</span>. Al
            eliminar un nodo se eliminan también las barras que lo usan.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
