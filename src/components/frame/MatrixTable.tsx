/**
 * Renders a stiffness matrix with degree-of-freedom headers.
 *
 * Shared by every matrix in the interface — the element matrices, the global
 * one and the reduced one — so they read identically and a change to how a
 * number is shown lands in all three at once.
 */

import type { DofDescriptor, Matrix } from '../../types/frame';
import { formatFixed } from '../../utils/format';

/**
 * Label of a degree of freedom: u is the horizontal translation of a node, v
 * the vertical one, and θ the rotation about Z — the third one a truss did
 * not have.
 */
export function dofLabel(dof: DofDescriptor): string {
  const symbol = dof.component === 'x' ? 'u' : dof.component === 'y' ? 'v' : 'θ';
  return `${symbol}${dof.node}`;
}

/** The six DOF labels of one element, in the order of its 6x6 matrix. */
export function elementDofLabels(from: number, to: number): string[] {
  return [`u${from}`, `v${from}`, `θ${from}`, `u${to}`, `v${to}`, `θ${to}`];
}

export interface MatrixTableProps {
  matrix: Matrix;
  /** DOF headers, in the order of the matrix rows and columns. */
  labels: readonly string[];
  /** Decimal places. Fixed, so the columns cannot reflow between cells. */
  decimals?: number;
}

export function MatrixTable({ matrix, labels, decimals = 2 }: MatrixTableProps) {
  return (
    // A 15x15 matrix cannot shrink to fit a phone, so the scroll is confined
    // here rather than left to push the whole page sideways. A frame reaches
    // that size sooner than a truss did: five nodes are enough.
    <div className="rounded-inset border-ink overflow-x-auto border bg-sunken">
      <table className="num w-full min-w-max border-collapse text-sm">
        <thead className="bg-surface-raised">
          <tr>
            <th className="border-ink border-b px-4 py-2.5" />
            {labels.map((label) => (
              <th
                key={`col-${label}`}
                scope="col"
                className="border-ink text-ink-muted border-b px-4 py-2.5 text-right text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, rowIndex) => (
            <tr key={`row-${labels[rowIndex] ?? rowIndex}`} className="even:bg-wash/3">
              <th
                scope="row"
                className="bg-surface-raised text-ink-muted px-4 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
              >
                {labels[rowIndex]}
              </th>
              {row.map((value, columnIndex) => (
                <td
                  key={`cell-${rowIndex}-${columnIndex}`}
                  className={[
                    'px-4 py-2.5 text-right whitespace-nowrap',
                    // Three weights of ink, carrying three different facts: the
                    // diagonal is the structure of the matrix, a zero is an
                    // absence, and everything else is a value. Dimming the
                    // zeros is what lets the sparsity pattern become visible
                    // at a glance — and in a frame element that pattern is
                    // itself the lesson: the axial rows are empty where the
                    // bending rows are full.
                    rowIndex === columnIndex
                      ? 'bg-accent/15 text-ink font-semibold'
                      : value === 0
                        ? 'text-ink-dim'
                        : 'text-ink-muted',
                  ].join(' ')}
                >
                  {formatFixed(value, decimals)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
