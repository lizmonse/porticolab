/**
 * The report's summary strip: the size of the problem, in four numbers.
 *
 * Invisible on screen, second thing on paper. On screen the same facts are
 * already on display — the element count and the total length sit under the
 * properties table, and the node count is in its own card header — so this
 * would be a third copy of them. On paper none of that survives: the input
 * cards are `print:hidden`, and without this block the document jumps from the
 * masthead straight into a drawing with no statement of what is being drawn.
 *
 * It reads the SOLVED model, like everything else in the report. A summary
 * counting the elements of a structure the tables below were not computed from
 * is worse than no summary at all.
 *
 * The lengths are derived here rather than stored, using the ENGINE's own
 * `elementLength`, so the total printed on the document is the sum of the
 * lengths the stiffness matrices were built from.
 */

import { elementLength } from '../../lib/frame/geometry';
import type { FrameModel } from '../../types/frame';
import { formatFixed } from '../../utils/format';
import { UNITS } from '../../utils/units';

export interface PrintSummaryProps {
  /** The solver's `solvedModel`: the structure the report's numbers describe. */
  model: FrameModel;
  /** Number of degrees of freedom that were actually solved for. */
  freeDofs: number;
}

export function PrintSummary({ model, freeDofs }: PrintSummaryProps) {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));

  const totalLength = model.elements.reduce((sum, element) => {
    const from = nodeById.get(element.from);
    const to = nodeById.get(element.to);
    if (from === undefined || to === undefined) return sum;
    return sum + elementLength(from.x, from.y, to.x, to.y);
  }, 0);

  const spanLoads = model.distributedLoads ?? [];

  const figures = [
    { label: 'Nodos', value: String(model.nodes.length) },
    { label: 'Elementos', value: String(model.elements.length) },
    { label: 'Longitud total', value: `${formatFixed(totalLength, 3)} ${UNITS.length}` },
    { label: 'Grados de libertad', value: `${freeDofs} libres de ${model.nodes.length * 3}` },
    { label: 'Cargas nodales', value: String(model.loads.length) },
    { label: 'Cargas repartidas', value: String(spanLoads.length) },
  ];

  return (
    <section className="hidden print:block print:break-inside-avoid">
      <h2 className="font-display mt-4 mb-2 text-[11pt] font-semibold text-[#111111]">
        Resumen general
      </h2>

      {/*
        A ruled grid rather than a sentence. Six labelled figures read as a
        record to be scanned, which is what the top of a calculation sheet is
        for; the same content as prose would be a paragraph nobody reads.

        The rules are drawn with `gap-px` over an ink ground, the same
        technique the interface uses — see the note in `pages/index.astro`. It
        survives print because it is a background, not a border, so it is not
        touched by the blanket border reset in the print stylesheet.
      */}
      <dl className="grid grid-cols-3 gap-px border border-[#111111] bg-[#111111]">
        {figures.map((figure) => (
          <div key={figure.label} className="bg-white px-3 py-2">
            <dt className="text-[7.5pt] font-semibold tracking-[0.12em] text-[#52525b] uppercase">
              {figure.label}
            </dt>
            <dd className="num mt-0.5 text-[10pt] font-semibold text-[#111111]">{figure.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
