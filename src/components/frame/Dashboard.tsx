/**
 * Root of the interactive island on the calculator route.
 *
 * Owns the frame model and wires it to the engine. Everything below is
 * presentational and driven by props.
 *
 * Two models flow out of here, and keeping them straight is the whole point of
 * solving on request. `store.model` is what the user is editing; it feeds the
 * input tables and the drawing. `solver.solvedModel` is what the last
 * calculation was run against; it feeds the results, so a table of bending
 * moments is never captioned with a section the user changed afterwards. They
 * are the same object until the first edit after a solve.
 *
 * Layout: two columns on desktop, stacked on mobile. The drawing and the
 * results lead on the left and take whatever width is going spare; the input
 * tables sit in a fixed-width column on the right, which keeps its own scroll
 * on large screens so the drawing stays in view while the user edits a long
 * table.
 */

import { useState } from 'react';

import { DistributedLoadsCard } from './DistributedLoadsCard';
import { ElementsCard } from './ElementsCard';
import { FrameViewport } from './FrameViewport';
import { Navbar } from './Navbar';
import { NodesCard } from './NodesCard';
import { PrintInputSummary } from './PrintInputSummary';
import { PrintReportHeader } from './PrintReportHeader';
import { PrintSummary } from './PrintSummary';
import { ResultsPanel } from './ResultsPanel';
import { SolveBar } from './SolveBar';
import { UnitsStrip } from './UnitsStrip';
import { EXAMPLE_FRAME } from '../../data/example-frame';
import { useFrameModel } from '../../hooks/useFrameModel';
import { useFrameSolver } from '../../hooks/useFrameSolver';
import { UNITS } from '../../utils/units';

export function Dashboard() {
  // Start on the validated example rather than a blank canvas: a student
  // opening the tool sees a working structure to modify instead of an empty
  // form with no indication of what belongs in it.
  const store = useFrameModel(EXAMPLE_FRAME);
  const solver = useFrameSolver(store.model);

  // Which member the detail panel is inspecting. Held here rather than inside
  // the results panel so the drawing can highlight the same selection later
  // without lifting state at that point.
  const [selectedElementId, setSelectedElementId] = useState<number | null>(null);

  return (
    /*
      The page ground: the ruled mesh, and nothing else. The accent bloom that
      used to sit behind the top of the layout — a 46rem circle at `blur-3xl` —
      is gone with the rest of the soft skin.
    */
    <div className="bg-base relative min-h-screen print:min-h-0">
      {/*
        `print:hidden` and not merely decorative pruning: the print stylesheet
        forces every position to static, and a `fixed inset-0` backdrop made
        static drops into the flow as a tall empty block at the top of the
        report.
      */}
      <div className="pointer-events-none fixed inset-0 -z-10 print:hidden" aria-hidden="true">
        <div className="blueprint-grid absolute inset-0 opacity-70" />
      </div>

      <div className="print:hidden">
        <Navbar
          onRestoreExample={() => store.loadModel(EXAMPLE_FRAME)}
          onReset={store.reset}
        />
      </div>

      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        {/*
          The report masthead. Rendered against the SOLVED model, not the live
          one, for the same reason the results are: the document must name the
          structure its tables describe.
        */}
        <PrintReportHeader modelName={solver.solvedModel.meta?.name} />
        {/*
          The size of the problem, before anything is drawn. On paper the input
          cards are gone, so without this the document would open on a picture
          with no statement of what it depicts.
        */}
        <PrintSummary
          model={solver.solvedModel}
          freeDofs={
            solver.state.status === 'solved' ? solver.state.solution.freeDofs.length : 0
          }
        />

        {/*
          Reading left, doing right. The left column is the drawing and the
          results — everything the user looks at; the right one is the two
          actions and the three input tables — everything the user touches.

          The drawing leads because it is the thing being reasoned about: the
          tables are how you change the structure, the picture is the
          structure. It takes `1fr` and so grows with the window, while the
          input column is pinned to the 44rem the nodes table needs to show its
          ten columns without scrolling sideways. On a 1600px page that leaves
          the drawing about 800px — half again what it had before.

          The split still happens at xl, not lg. Granting the forms their 44rem
          at 1024px would leave the drawing barely 370px wide, which is worse
          than stacking; below xl both columns get the full width instead.
        */}
        <div className="grid grid-cols-1 items-start gap-8 lg:gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,44rem)] print:block">
          {/*
            `print:block`, and this is the fix for one-table-per-page.

            Chrome fragments a block container across pages well and a FLEX
            container badly: inside a flex column it routinely honours
            `break-inside: avoid` on an item by pushing that item to a fresh
            page rather than by fitting the two that would have shared one.
            The result was a report that spent a sheet per table.

            `gap` has no meaning once this is a block, so the spacing moves to
            `space-y-*` — which is a margin, and margins collapse against a
            page boundary instead of being carried onto the next sheet.
          */}
          <div className="flex flex-col gap-8 print:block print:space-y-3">
            {/* The drawing follows the live model: it is the picture of what
                is being edited, not of what was last solved. */}
            <FrameViewport
              model={store.model}
              solverState={solver.state}
              isOutdated={solver.isOutdated}
            />
            {/*
              The input data, restated as a record — see the note in
              `PrintInputSummary`. It lives HERE, between the drawing and the
              results, purely for the printed order: on screen it is
              `hidden print:block` and contributes nothing to this column.

              Putting it in the DOM where the report wants it is what avoids
              reordering on paper. The print layout turns the grid into a block
              and the children fall in source order, so the document reads
              masthead, summary, drawing, input, results with no `order`
              property involved — which would not have worked anyway, since
              `order` has no effect once the container is a block.
            */}
            <PrintInputSummary model={solver.solvedModel} />
            <ResultsPanel
              model={solver.solvedModel}
              solverState={solver.state}
              isOutdated={solver.isOutdated}
              selectedElementId={selectedElementId}
              onSelectElement={setSelectedElementId}
            />
          </div>

          {/*
            The command column: the two actions, then everything they act on.

            The solve bar used to head the LEFT column, above the drawing. It
            moved here so the split is by kind rather than by accident — the
            left column is now everything the user reads, and this one is
            everything the user touches. Solving is the last thing you do after
            editing a table, and the button now sits where your eyes already
            are instead of across the page.

            It also puts the staleness warning against the forms that cause it:
            "hay cambios sin resolver" appears directly above the row that was
            just edited.

            The whole column leaves the report. Its content is not missing from
            the document — `PrintInputSummary` restates every value as a static
            table — and reprinting an editable form, switches and delete
            buttons included, is what makes a printed interface look like a
            screenshot.
          */}
          {/*
            `xl:pr-2 xl:pb-2` is not decoration. An `overflow-y-auto` box clips
            on BOTH axes, and every card in here carries a 2px offset shadow
            that lives outside its border box — so without that padding the
            right-hand and bottom shadows are sliced off by the scroll
            container, and the neubrutalist edge quietly stops existing on the
            two sides where it is most visible.

            `gap-8` rather than `gap-6`: these are four unrelated panels, not
            four rows of one thing, and at the tighter spacing the offset
            shadow of each was landing close enough to the next card's border
            to read as a double rule.
          */}
          <div className="flex flex-col gap-8 xl:sticky xl:top-24 xl:max-h-[calc(100vh-8rem)] xl:overflow-y-auto xl:pr-2 xl:pb-2 print:hidden">
            <UnitsStrip />
            <SolveBar
              state={solver.state}
              isOutdated={solver.isOutdated}
              onSolve={solver.solve}
            />
            <NodesCard store={store} />
            <ElementsCard store={store} />
            <DistributedLoadsCard store={store} />
          </div>
        </div>

        <Footer />
      </main>
    </div>
  );
}

/**
 * The technical footnote of the calculator.
 *
 * The author credit that used to sit on the right is gone: the project is
 * published unattributed. What is left is the part a user working in the tool
 * actually needs at the bottom of the page — the unit system every field is
 * typed in, and the assumptions behind every number above.
 */
function Footer() {
  return (
    <footer className="border-line-strong text-ink-faint mt-12 border-t pt-6 pb-4 text-xs leading-relaxed print:mt-3 print:pt-2 print:pb-0 print:break-inside-avoid">
      <p>
        Pórticos 2D · Método de la Rigidez Directa para pórticos planos · Tres grados de libertad
        por nodo y matrices elementales de 6 × 6.
      </p>
      <p className="mt-1.5">
        Unidades fijas: {UNITS.force}, {UNITS.length}, {UNITS.modulus}, {UNITS.area} y{' '}
        {UNITS.inertia}. Análisis lineal elástico de primer orden, sin cargas repartidas en barra.
      </p>
    </footer>
  );
}
