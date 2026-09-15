/**
 * Table primitives shared by the input and results tables.
 *
 * Rows are contiguous and striped rather than spaced apart. Striping is what
 * lets the eye track a row across eight columns, and it only works if the
 * rows actually touch, so the table collapses its borders instead of using
 * `border-spacing`. On a dark ground the stripe is a 3% white wash rather
 * than a grey fill — enough to guide the eye, not enough to read as a second
 * kind of row.
 *
 * Every table wraps in a horizontally scrollable container: on a phone an
 * eight-column table cannot shrink to fit, and letting the page itself scroll
 * sideways would break the whole layout.
 */

import type { ReactNode } from 'react';

export function TableScroll({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-inset border-ink overflow-x-auto border">
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function TableHead({ columns }: { columns: readonly string[] }) {
  return (
    // Opaque `surface-raised` rather than a 60% tint, and an ink rule under it
    // rather than a hairline: the header is the one row that has to survive
    // being scrolled past a dozen numeric rows without dissolving into them.
    <thead className="bg-surface-raised">
      <tr>
        {columns.map((column, index) => (
          <th
            key={column === '' ? `spacer-${index}` : column}
            scope="col"
            className="border-ink text-ink-muted border-b px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.12em] whitespace-nowrap uppercase"
          >
            {column}
          </th>
        ))}
      </tr>
    </thead>
  );
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export interface TableRowProps {
  children: ReactNode;
  /** Makes the whole row a click target. Omit for a static row. */
  onClick?: () => void;
  /** Paints the row as the current selection. */
  selected?: boolean;
}

export function TableRow({ children, onClick, selected = false }: TableRowProps) {
  const interactive = onClick !== undefined;

  return (
    <tr
      onClick={onClick}
      className={[
        // `box-shadow` joins the transition so the selected row's accent bar
        // slides in with the tint instead of snapping on a frame ahead of it.
        //
        // A solid `border-line` between rows, where this was a 60% tint of it.
        // Full ink was the obvious reading of "solid rules", and it is wrong
        // here: twenty near-black rules stacked at 30px pitch turn a stiffness
        // matrix into a barcode. The frame and the header carry the ink; the
        // rows inside it get the hairline at full strength.
        'group border-line border-b transition-[background-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] last:border-b-0',
        // The selected row keeps its tint through hover, otherwise hovering a
        // neighbouring row makes it look like the selection moved. It also
        // carries an accent bar on its left edge via box-shadow — colour alone
        // is a weak signal on a dark table.
        selected
          ? 'bg-accent/15 hover:bg-accent/20 shadow-[inset_3px_0_0_0_var(--color-accent)]'
          : 'even:bg-wash/3 hover:bg-accent/8',
        interactive ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  const alignment =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  return <td className={`px-3 py-1.5 align-middle ${alignment} ${className}`}>{children}</td>;
}

/** Placeholder shown when a table has no rows yet. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-inset border-line-strong text-ink-faint bg-sunken border border-dashed px-4 py-10 text-center text-sm">
      {children}
    </p>
  );
}
