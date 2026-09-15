/**
 * The whole matrix procedure, in three tabs: the element matrices, the global
 * assembly and the reduced system.
 *
 * This is the audit trail of the Direct Stiffness Method. A student can follow
 * their own hand calculation through every stage instead of being handed a
 * final answer, which is what the method is taught for.
 *
 * The element tab gained a second axis for the frame: a member no longer has
 * one matrix but three — [k] in local axes, the transformation [T], and
 * [k] = [T]ᵀ[k]ₗ[T] in global axes — and those three ARE the derivation. They
 * are selectable rather than stacked because rendering three 6x6 tables per
 * member turns a four-member frame into twelve matrices on one screen, which
 * is a wall of digits rather than a lesson.
 *
 * Collapsed by default: it is a lot of numbers, and most sessions are about
 * the results rather than the procedure behind them.
 */

import { useState } from 'react';

import { MatrixTable, dofLabel, elementDofLabels } from './MatrixTable';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import type { TabDefinition } from '../ui/Tabs';
import { TabPanel, Tabs } from '../ui/Tabs';
import type { FrameModel, FrameSolution, Matrix6 } from '../../types/frame';
import { formatFixed } from '../../utils/format';
import { UNITS } from '../../utils/units';

type TabId = 'elements' | 'global' | 'reduced';

// Annotated rather than `as const satisfies`: the explicit type is what lets
// Tabs infer its Id parameter as TabId instead of widening it to string.
const TABS: readonly TabDefinition<TabId>[] = [
  { id: 'elements', label: 'Matrices elementales' },
  { id: 'global', label: 'Matriz global [K]' },
  { id: 'reduced', label: 'Matriz reducida [K]f' },
];

const ID_PREFIX = 'matrix-procedure';

/** Which of a member's three matrices the element tab is showing. */
type Representation = 'local' | 'transformation' | 'global';

const REPRESENTATIONS: readonly { id: Representation; label: string; caption: string }[] = [
  {
    id: 'local',
    label: 'Local [k]ₗ',
    caption:
      'En ejes propios de la barra. Los términos axiales (EA/L) y los de flexión ' +
      '(12EI/L³, 6EI/L², 4EI/L, 2EI/L) no se mezclan: por eso los ceros de esta matriz son ' +
      'exactos, no redondeos.',
  },
  {
    id: 'transformation',
    label: 'Transformación [T]',
    caption:
      'Rota las magnitudes globales a los ejes de la barra. Los dos unos de la diagonal son los ' +
      'giros: un giro alrededor de Z vale lo mismo en ambos sistemas, porque comparten ese eje.',
  },
  {
    id: 'global',
    label: 'Global [k] = [T]ᵀ[k]ₗ[T]',
    caption:
      'La matriz que realmente se ensambla en [K]. Es la misma que usó el solver, no un segundo ' +
      'cálculo hecho para mostrarla.',
  },
];

export interface MatrixProcedureViewerProps {
  model: FrameModel;
  solution: FrameSolution;
}

export function MatrixProcedureViewer({ model, solution }: MatrixProcedureViewerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('elements');

  return (
    <Card>
      <CardHeader
        title="Procedimiento matricial"
        subtitle="Revisa las matrices elementales de 6 × 6, el ensamble global y el sistema reducido."
        actionsClassName="print:hidden"
        actions={
          <Button variant="secondary" size="sm" onClick={() => setIsOpen((open) => !open)}>
            {isOpen ? 'Ocultar matrices' : 'Mostrar matrices'}
          </Button>
        }
      />

      {isOpen && (
        <CardBody className="space-y-7 print:space-y-3">
          {/* Explicit type argument: inference here falls back to the
              `extends string` constraint and widens Id away from TabId. */}
          <div className="print:hidden">
            <Tabs<TabId>
              tabs={TABS}
              activeId={activeTab}
              onChange={setActiveTab}
              idPrefix={ID_PREFIX}
              label="Etapas del procedimiento matricial"
            />
          </div>

          {/*
            All three stages print, not just the selected one. On screen the
            tabs are what makes twelve 6x6 matrices fit; on paper they would
            be throwing away the assembly and the reduced system because of a
            constraint the page does not have. A memoria de cálculo is handed
            in to be followed step by step, and two of the three steps are
            behind the tabs the reader of a PDF cannot click.
          */}
          <TabPanel id="elements" idPrefix={ID_PREFIX} active={activeTab === 'elements'} alsoInPrint>
            <PrintStageHeading>Matrices elementales</PrintStageHeading>
            <ElementMatrices model={model} solution={solution} />
          </TabPanel>

          <TabPanel id="global" idPrefix={ID_PREFIX} active={activeTab === 'global'} alsoInPrint>
            <PrintStageHeading>Matriz global [K]</PrintStageHeading>
            <GlobalMatrix solution={solution} />
          </TabPanel>

          <TabPanel id="reduced" idPrefix={ID_PREFIX} active={activeTab === 'reduced'} alsoInPrint>
            <PrintStageHeading>Matriz reducida [K]f</PrintStageHeading>
            <ReducedMatrix solution={solution} />
          </TabPanel>
        </CardBody>
      )}

      {/*
        Collapsed, the card would print its title and nothing else — the
        toggle that explains the emptiness is itself hidden. Saying so is
        better than an empty section, and it keeps the page count predictable:
        the report contains what the screen contains, and expanding is how you
        ask for more.
      */}
      {!isOpen && (
        <CardBody className="hidden print:block">
          <p className="text-ink-faint text-sm">
            Las matrices no se incluyeron en este reporte. Para añadirlas, pulsa «Mostrar
            matrices» antes de exportar.
          </p>
        </CardBody>
      )}
    </Card>
  );
}

/**
 * Names a stage in the report.
 *
 * On screen the tab bar is the heading — the selected tab says which matrix is
 * below it. In print the tab bar is gone and all three stages run one after
 * another, so each needs a label of its own or the reader meets an unannounced
 * wall of numbers.
 */
function PrintStageHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-ink hidden text-sm font-semibold print:mb-2 print:block print:break-after-avoid">
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------

function ElementMatrices({ model, solution }: MatrixProcedureViewerProps) {
  const [representation, setRepresentation] = useState<Representation>('global');
  const elementById = new Map(model.elements.map((element) => [element.id, element]));

  const active = REPRESENTATIONS.find((entry) => entry.id === representation) ?? REPRESENTATIONS[2]!;

  return (
    <div className="space-y-7">
      <p className="text-ink-muted text-sm leading-relaxed">
        Cada barra de pórtico aporta una matriz de 6 × 6: tres grados de libertad por nodo
        (u, v, θ). Elige qué paso de la deducción quieres ver.
      </p>

      <div
        role="group"
        aria-label="Representación de la matriz elemental"
        className="flex flex-wrap gap-2 print:hidden"
      >
        {REPRESENTATIONS.map((entry) => (
          <Button
            key={entry.id}
            size="sm"
            variant={entry.id === representation ? 'primary' : 'secondary'}
            aria-pressed={entry.id === representation}
            onClick={() => setRepresentation(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {/*
        Unlike the three tabs, only the SELECTED representation prints.

        The distinction is not arbitrary. The tabs are three consecutive
        stages of the method — element matrices, assembly, reduction — and a
        memoria that skipped two of them would be missing the derivation. The
        three representations are one stage seen three ways, and printing all
        of them would triple the matrix count of the report to restate the
        same member. So the choice stands, and the report names it instead of
        leaving the reader to guess which of [k]ₗ, [T] and [k] they are
        holding.
      */}
      <p className="text-ink hidden text-sm font-semibold print:block">
        Representación: {active.label}
      </p>

      <p className="text-ink-faint text-xs leading-relaxed">{active.caption}</p>

      {solution.elements.map((result) => {
        const element = elementById.get(result.elementId);
        if (element === undefined) return null;

        const matrix: Matrix6 =
          representation === 'local'
            ? result.localStiffness
            : representation === 'transformation'
              ? result.transformation
              : result.stiffness;

        // Labels come from the element's own end nodes, so a renumbered model
        // still reads correctly.
        const labels = elementDofLabels(element.from, element.to);

        return (
          <section key={result.elementId} className="print:break-inside-avoid">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h4 className="font-display text-ink text-sm font-semibold">
                Elemento e{result.elementId} · nodos {element.from}-{element.to}
              </h4>
              <p className="num text-ink-faint text-xs">
                L = {formatFixed(result.geometry.length, 4)} {UNITS.length} · θ ={' '}
                {formatFixed(result.geometry.angleDeg, 2)}° · c ={' '}
                {formatFixed(result.geometry.cos, 4)} · s = {formatFixed(result.geometry.sin, 4)}
              </p>
            </header>
            {/*
              The transformation matrix holds direction cosines, not
              stiffnesses: at two decimals a value of 0.9962 would print as
              1.00 and the matrix would look like the identity. It gets four.
            */}
            <MatrixTable
              matrix={matrix}
              labels={labels}
              decimals={representation === 'transformation' ? 4 : 2}
            />
          </section>
        );
      })}

      {representation !== 'transformation' && (
        <p className="text-ink-faint text-xs">
          Unidades: {UNITS.force}/{UNITS.length} en las filas de traslación y {UNITS.moment} por
          radián en las de giro. La matriz de transformación es adimensional.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function GlobalMatrix({ solution }: { solution: FrameSolution }) {
  const labels = solution.dofs.map(dofLabel);
  const size = solution.globalStiffness.length;

  return (
    <div className="space-y-4 print:break-inside-avoid">
      <p className="text-ink-muted text-sm leading-relaxed">
        Resultado del ensamble de todas las matrices elementales. Dimensión: {size} × {size} (3n ×
        3n, con tres grados de libertad por nodo).
      </p>
      <MatrixTable matrix={solution.globalStiffness} labels={labels} />
      <p className="text-ink-faint text-xs">
        Unidades: {UNITS.force}/{UNITS.length} y {UNITS.moment} por radián.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ReducedMatrix({ solution }: { solution: FrameSolution }) {
  const labelByDof = new Map(solution.dofs.map((dof) => [dof.index, dofLabel(dof)]));
  const labels = solution.freeDofs.map((dof) => labelByDof.get(dof) ?? `?${dof}`);

  return (
    <div className="space-y-4 print:break-inside-avoid">
      <p className="text-ink-muted text-sm leading-relaxed">
        Se conservan únicamente los grados de libertad no restringidos:{' '}
        <span className="num text-ink font-medium">{labels.join(', ')}</span>. Este es el sistema
        que se resuelve; el resto de filas y columnas se elimina al aplicar las condiciones de
        frontera.
      </p>
      <MatrixTable matrix={solution.reducedStiffness} labels={labels} />
      <p className="text-ink-faint text-xs">
        Unidades: {UNITS.force}/{UNITS.length} y {UNITS.moment} por radián.
      </p>
    </div>
  );
}
