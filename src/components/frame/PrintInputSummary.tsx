/**
 * The input data, restated as static tables for the printed report.
 *
 * WHY THIS EXISTS, given that the input cards are hidden on paper.
 *
 * Hiding the FORMS is right: number fields, switches, dropdowns and delete
 * buttons are controls, and reprinting them is what makes a document look like
 * a screenshot of an application. But hiding the DATA with them would leave a
 * memoria de cálculo that states results nobody can check. The results tables
 * carry lengths and forces; they carry no coordinate, no applied load, no
 * support condition and no section property, so a marker reading the report
 * alone could not reproduce a single number in it — and reproducing them is
 * the entire purpose of handing one in.
 *
 * So the report drops the forms and keeps their contents, rendered as what
 * they are on paper: a record.
 *
 * Everything is read from the SOLVED model, never the live one. A report whose
 * input section described a structure the tables below it were not computed
 * from would be worse than one with no input section at all.
 *
 * Properties are converted back to the units the user typed — GPa, mm², cm⁴ —
 * rather than printed in the engine's internal kN/m², m² and m⁴. The report
 * has to match the input sheet the student worked from, not the solver's
 * internal bookkeeping.
 */

import { TableBody, TableCell, TableHead, TableRow, TableScroll } from '../ui/DataTable';
import { classifyDistributedLoad } from '../../lib/frame/postprocess';
import type {
  DistributedLoadShape,
  FrameModel,
  NodalLoad,
  Support,
} from '../../types/frame';
import { formatNumber } from '../../utils/format';
import {
  engineToGigapascal,
  engineToQuarticCentimetre,
  engineToSquareMillimetre,
} from '../../utils/unit-conversion';
import { UNITS } from '../../utils/units';

export interface PrintInputSummaryProps {
  /** The solver's `solvedModel`: the structure the report's numbers describe. */
  model: FrameModel;
}

export function PrintInputSummary({ model }: PrintInputSummaryProps) {
  const loadByNode = new Map<number, NodalLoad>(model.loads.map((load) => [load.node, load]));
  const supportByNode = new Map<number, Support>(
    model.supports.map((support) => [support.node, support]),
  );
  const spanLoads = model.distributedLoads ?? [];
  /** Intensity is force per unit length: kN/m. */
  const intensityUnit = UNITS.force + '/' + UNITS.length;

  return (
    <section className="hidden print:block print:break-inside-avoid">
      <h2 className="font-display mt-5 mb-2 text-[11pt] font-semibold text-[#111111]">
        Datos de entrada
      </h2>

      <h3 className="mt-3 mb-1.5 text-[9.5pt] font-semibold text-[#3f3f46]">
        Nodos, cargas y condiciones de apoyo
      </h3>
      <TableScroll>
        <TableHead
          columns={[
            'Nodo',
            `X (${UNITS.length})`,
            `Y (${UNITS.length})`,
            `Fx (${UNITS.force})`,
            `Fy (${UNITS.force})`,
            `Mz (${UNITS.moment})`,
            'Apoyo',
          ]}
        />
        <TableBody>
          {model.nodes.map((node) => {
            const load = loadByNode.get(node.id);
            return (
              <TableRow key={node.id}>
                <TableCell className="num font-semibold whitespace-nowrap">n{node.id}</TableCell>
                <TableCell align="right" className="num">
                  {formatNumber(node.x)}
                </TableCell>
                <TableCell align="right" className="num">
                  {formatNumber(node.y)}
                </TableCell>
                <TableCell align="right" className="num">
                  {formatNumber(load?.fx ?? 0)}
                </TableCell>
                <TableCell align="right" className="num">
                  {formatNumber(load?.fy ?? 0)}
                </TableCell>
                <TableCell align="right" className="num">
                  {formatNumber(load?.mz ?? 0)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {describeSupport(supportByNode.get(node.id))}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </TableScroll>

      <h3 className="mt-4 mb-1.5 text-[9.5pt] font-semibold text-[#3f3f46]">
        Elementos, material y sección
      </h3>
      <TableScroll>
        <TableHead
          columns={[
            'Elemento',
            'Nodo i',
            'Nodo j',
            `E (${UNITS.modulus})`,
            `A (${UNITS.area})`,
            `I (${UNITS.inertia})`,
          ]}
        />
        <TableBody>
          {model.elements.map((element) => (
            <TableRow key={element.id}>
              <TableCell className="num font-semibold whitespace-nowrap">e{element.id}</TableCell>
              <TableCell className="num">n{element.from}</TableCell>
              <TableCell className="num">n{element.to}</TableCell>
              <TableCell align="right" className="num">
                {formatNumber(engineToGigapascal(element.E))}
              </TableCell>
              <TableCell align="right" className="num">
                {formatNumber(engineToSquareMillimetre(element.A))}
              </TableCell>
              <TableCell align="right" className="num">
                {formatNumber(engineToQuarticCentimetre(element.I))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </TableScroll>

      {/*
        Span loads. Omitted from this section until now, which was a real hole
        in the document rather than a missing nicety: they are what produce the
        parabolic and cubic diagrams the report goes on to print, and a marker
        given the nodes, the sections and the results but not these could not
        reproduce a single one of those ordinates.

        The section only appears when there are any. A heading over an empty
        table would read as "this structure carries none", which is true, but
        it is already evident from the drawing and the diagrams — and a report
        that prints its empty sections is a report nobody scans.

        Intensities are the GLOBAL components the user typed, unconverted: the
        engine's internal axes have no place on a document meant to match the
        input sheet.
      */}
      {spanLoads.length > 0 && (
        <>
          <h3 className="mt-4 mb-1.5 text-[9.5pt] font-semibold text-[#3f3f46]">
            Cargas distribuidas en barra
          </h3>
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
              ]}
            />
            <TableBody>
              {spanLoads.map((load) => (
                <TableRow key={load.id}>
                  <TableCell className="num font-semibold whitespace-nowrap">q{load.id}</TableCell>
                  <TableCell className="num">e{load.element}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {SHAPE_LABEL[classifyDistributedLoad(load)]}
                  </TableCell>
                  <TableCell align="right" className="num">
                    {formatNumber(load.wxI)}
                  </TableCell>
                  <TableCell align="right" className="num">
                    {formatNumber(load.wyI)}
                  </TableCell>
                  <TableCell align="right" className="num">
                    {formatNumber(load.wxJ)}
                  </TableCell>
                  <TableCell align="right" className="num">
                    {formatNumber(load.wyJ)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableScroll>
        </>
      )}
    </section>
  );
}

/** Spanish name of each span-load shape, for the report's Forma column. */
const SHAPE_LABEL: Record<DistributedLoadShape, string> = {
  zero: '—',
  uniform: 'Uniforme',
  triangular: 'Triangular',
  trapezoidal: 'Trapezoidal',
};

/**
 * Names a support the way the drawing and the course do.
 *
 * The three booleans are the truth, but "x, y, rz" on a report is a puzzle;
 * "Empotramiento" is the answer to it. The unusual combinations fall back to
 * listing the restrained degrees of freedom, which is better than forcing a
 * guided or inclined support into a name that does not fit it.
 */
function describeSupport(support: Support | undefined): string {
  if (support === undefined) return 'Libre';

  const { restrainX, restrainY, restrainRz } = support;

  if (restrainX && restrainY && restrainRz) return 'Empotramiento';
  if (restrainX && restrainY) return 'Articulación';
  if (!restrainRz && (restrainX || restrainY)) {
    return `Apoyo móvil (${restrainX ? 'X' : 'Y'})`;
  }

  const restrained = [
    restrainX ? 'X' : null,
    restrainY ? 'Y' : null,
    restrainRz ? 'θz' : null,
  ].filter((label) => label !== null);

  return restrained.length === 0 ? 'Libre' : `Restringe ${restrained.join(', ')}`;
}
