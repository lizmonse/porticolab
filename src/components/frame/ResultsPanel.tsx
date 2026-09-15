/**
 * Right panel: the results of the last solve.
 *
 * Why there is no error or "incomplete" banner here: `SolveBar` sits directly
 * above this panel and already states, in those exact words, why there is
 * nothing to show. Repeating it would render the same sentence twice, a few
 * pixels apart. This panel answers one question only — what did the last solve
 * produce — and shows a placeholder when the answer is "nothing".
 *
 * Results are still rendered while outdated rather than hidden. A user who
 * tweaks an inertia to see how the bending moment responds needs the previous
 * numbers on screen to compare against; taking them away at the first
 * keystroke would defeat the reason for solving on request in the first place.
 * They are labelled instead, by a marker that follows the scroll, so no number
 * can be read without its qualifier.
 */

import { Badge } from '../ui/Badge';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { TableBody, TableCell, TableHead, TableRow, TableScroll } from '../ui/DataTable';
import { TableIcon, WarningIcon } from '../ui/icons';
import { SelectedElementPanel } from './SelectedElementPanel';
import { MatrixProcedureViewer } from './MatrixProcedureViewer';
import type { SolverState } from '../../hooks/useFrameSolver';
import type { FrameModel, FrameSolution } from '../../types/frame';
import { formatDisplacement, formatNumber } from '../../utils/format';
import { STATE_LABEL } from '../../utils/theme';
import { UNITS } from '../../utils/units';

export interface ResultsPanelProps {
  /**
   * The model the solution describes — the solver's `solvedModel`, never the
   * live one. While the user edits, the two differ, and this panel must stay
   * on the side of the numbers it is rendering.
   */
  model: FrameModel;
  solverState: SolverState;
  /** True when the model has changed since these results were produced. */
  isOutdated: boolean;
  /** Element currently under inspection, or null when none is selected. */
  selectedElementId: number | null;
  onSelectElement(id: number | null): void;
}

export function ResultsPanel({
  model,
  solverState,
  isOutdated,
  selectedElementId,
  onSelectElement,
}: ResultsPanelProps) {
  if (solverState.status !== 'solved') {
    return <EmptyResults />;
  }

  const { solution } = solverState;

  // Resolved by lookup rather than stored: if the selected member is not part
  // of the solved model, both come back undefined and the panel falls back to
  // its empty state instead of showing numbers for a bar that is not there.
  const selectedElement = model.elements.find((element) => element.id === selectedElementId);
  const selectedResult = solution.elements.find(
    (element) => element.elementId === selectedElementId,
  );

  return (
    // Block, not flex, on paper: see the note in `Dashboard`. A flex column
    // fragments badly and gives every card its own sheet.
    <div className="flex flex-col gap-6 print:block print:space-y-3">
      {isOutdated && <StaleMarker />}
      {/*
        The detail panel is the state of a click, not a result. A memoria de
        calculo is a static record, and "Elemento seleccionado · e2" in one
        would describe the moment the button was pressed rather than the
        structure — the same member matrices are in the matrix procedure, where
        they belong to the method instead of to a selection.
      */}
      <div className="print:hidden">
        <SelectedElementPanel element={selectedElement} result={selectedResult} />
      </div>
      <ElementResultsTable
        solution={solution}
        selectedElementId={selectedElementId}
        onSelectElement={onSelectElement}
      />
      <NodalResultsTable solution={solution} />
      <MatrixProcedureViewer model={model} solution={solution} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Shown whenever the last solve produced no results. Deliberately says nothing
 * about *why*: `SolveBar`, immediately above, is the single place that
 * explains the solver's state.
 */
function EmptyResults() {
  return (
    <Card>
      <CardBody className="py-14 text-center">
        <span className="bg-accent/12 text-accent-ink ring-accent mx-auto mb-4 flex size-11 items-center justify-center ring-1">
          <TableIcon className="size-5" />
        </span>
        <p className="font-display text-ink text-sm font-semibold">Todavía no hay resultados</p>
        <p className="text-ink-faint mx-auto mt-2 max-w-md text-sm leading-relaxed">
          Cuando la estructura se resuelva, aquí aparecerán los desplazamientos y giros, las
          reacciones, las fuerzas internas de cada barra y el procedimiento matricial completo.
        </p>
      </CardBody>
    </Card>
  );
}

/**
 * Travels with the scroll, because the matrices below run long: the warning is
 * useless if it scrolls off before the numbers it qualifies come into view.
 * `top-20` clears the sticky navbar.
 */
function StaleMarker() {
  return (
    <div className="rounded-inset border-warn/40 bg-warn/15 text-warn sticky top-20 z-10 -mb-1 flex items-center gap-2.5 border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-md">
      <WarningIcon className="size-4 shrink-0" />
      Resultados del modelo anterior. Vuelve a resolver para actualizarlos.
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Applied to every numeric cell: monospaced, tabular figures. */
const NUMERIC = 'num';

/**
 * Internal forces, one row per member.
 *
 * A truss table had one force column. A frame member is described by its axial
 * force plus the shear and bending moment at each end, so the row carries five
 * numbers — and they are grouped end by end, which is how a section is
 * actually checked.
 */
function ElementResultsTable({
  solution,
  selectedElementId,
  onSelectElement,
}: {
  solution: FrameSolution;
  selectedElementId: number | null;
  onSelectElement(id: number | null): void;
}) {
  return (
    /*
      `break-inside-avoid` keeps a table off a page boundary where it can.
      When a table is genuinely taller than a page the browser starts it on a
      fresh one and then breaks it anyway, which is the right fallback: the
      rule asks for a whole table, it does not promise one at any length.
    */
    <Card className="print:break-inside-avoid">
      <CardHeader
        title="Fuerzas internas por barra"
        subtitle="Axial, cortante y momento flector en los extremos i y j"
      />
      <CardBody>
        <TableScroll>
          <TableHead
            columns={[
              'Elemento',
              `L (${UNITS.length})`,
              `N (${UNITS.force})`,
              `Vi (${UNITS.force})`,
              `Mi (${UNITS.moment})`,
              `Vj (${UNITS.force})`,
              `Mj (${UNITS.moment})`,
              'Estado',
            ]}
          />
          <TableBody>
            {solution.elements.map((element) => {
              const isSelected = element.elementId === selectedElementId;
              // Clicking the selected row again clears the selection, which is
              // what makes `aria-pressed` on the button an honest description.
              const toggle = () => onSelectElement(isSelected ? null : element.elementId);
              const { endForces } = element;

              return (
                <TableRow key={element.elementId} selected={isSelected} onClick={toggle}>
                  <TableCell className="whitespace-nowrap">
                    {/*
                      A real button rather than a click handler on the row
                      alone: the row click is a mouse affordance, but keyboard
                      and screen-reader users need a focusable control with a
                      name and a pressed state.
                    */}
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggle();
                      }}
                      aria-pressed={isSelected}
                      aria-label={`Inspeccionar el elemento ${element.elementId}`}
                      className="num text-ink hover:text-accent-ink rounded font-semibold underline-offset-4 transition-colors hover:underline"
                    >
                      e{element.elementId}
                    </button>
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-faint`}>
                    {formatNumber(element.geometry.length)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatNumber(endForces.axialForce)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-muted`}>
                    {formatNumber(endForces.shearI)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatNumber(endForces.momentI)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-muted`}>
                    {formatNumber(endForces.shearJ)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatNumber(endForces.momentJ)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={element.state}>{STATE_LABEL[element.state]}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableScroll>
        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Valores en ejes locales de cada barra. La fuerza axial{' '}
          <span className="num text-ink-muted font-medium">N</span> es positiva en tracción; los
          momentos son positivos en sentido antihorario. El estado describe únicamente la
          componente axial: una barra en flexión pura aparece como «nula» en esa columna.
        </p>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function NodalResultsTable({ solution }: { solution: FrameSolution }) {
  const reactionsByNode = new Map(solution.reactions.map((reaction) => [reaction.node, reaction]));

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader
        title="Resultados nodales"
        subtitle="Desplazamientos, giros y reacciones en los apoyos"
      />
      <CardBody>
        <TableScroll>
          <TableHead
            columns={[
              'Nodo',
              `ux (${UNITS.length})`,
              `uy (${UNITS.length})`,
              `θz (${UNITS.rotation})`,
              `Rx (${UNITS.force})`,
              `Ry (${UNITS.force})`,
              `Mz (${UNITS.moment})`,
            ]}
          />
          <TableBody>
            {solution.nodalDisplacements.map((displacement) => {
              const reaction = reactionsByNode.get(displacement.node);
              return (
                <TableRow key={displacement.node}>
                  <TableCell className="num text-ink font-semibold whitespace-nowrap">
                    n{displacement.node}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatDisplacement(displacement.ux)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatDisplacement(displacement.uy)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink font-medium`}>
                    {formatDisplacement(displacement.rz)}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-faint`}>
                    {reaction ? formatNumber(reaction.fx) : <span className="text-ink-dim">—</span>}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-faint`}>
                    {reaction ? formatNumber(reaction.fy) : <span className="text-ink-dim">—</span>}
                  </TableCell>
                  <TableCell align="right" className={`${NUMERIC} text-ink-faint`}>
                    {reaction ? formatNumber(reaction.mz) : <span className="text-ink-dim">—</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </TableScroll>
        <p className="text-ink-faint mt-4 text-xs leading-relaxed">
          Los nodos sin apoyo no tienen reacción, por eso su celda aparece vacía. Un apoyo
          articulado gira libremente, así que su reacción{' '}
          <span className="num text-ink-muted font-medium">Mz</span> es cero; sólo un empotramiento
          desarrolla momento de reacción.
        </p>
      </CardBody>
    </Card>
  );
}
