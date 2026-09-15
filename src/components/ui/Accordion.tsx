/**
 * Accordion for the input panel sections.
 *
 * Several sections can be open at once: the user often edits nodes and bars
 * together, and an accordion that closes one to open another would fight the
 * task instead of helping it.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';

import { ChevronIcon } from './icons';

export interface AccordionSectionProps {
  title: string;
  /** Item count shown next to the title. */
  count?: number;
  defaultOpen?: boolean;
  /** Controls in the header, e.g. the "add row" button. */
  actions?: ReactNode;
  children: ReactNode;
}

export function AccordionSection({
  title,
  count,
  defaultOpen = true,
  actions,
  children,
}: AccordionSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-line border-b last:border-b-0">
      <div className="flex items-center justify-between gap-3 px-6 py-4">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          // Named explicitly so the control does not depend on how the count
          // badge and icon happen to contribute to the computed name.
          aria-label={`${isOpen ? 'Contraer' : 'Expandir'} la sección ${title}`}
          className="group flex flex-1 items-center gap-2.5 text-left"
        >
          <ChevronIcon
            className={`text-ink-faint group-hover:text-ink-muted size-4 shrink-0 transition-transform duration-200 ${
              isOpen ? '' : '-rotate-90'
            }`}
          />
          <span className="font-display text-ink text-sm font-semibold tracking-tight">{title}</span>
          {count !== undefined && (
            <span className="num rounded-inset border-line-strong text-ink-muted border px-1.5 py-0.5 text-xs font-semibold">
              {count}
            </span>
          )}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      {isOpen && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}
