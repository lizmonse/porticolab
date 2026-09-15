/**
 * Tab bar following the ARIA tabs pattern.
 *
 * A row of styled buttons would look the same and behave worse. Real tabs
 * announce themselves as a tab list, expose which one is selected, and move
 * between panels with the arrow keys rather than one Tab press per tab, which
 * is what a keyboard user expects here.
 */

import { useRef } from 'react';

export interface TabDefinition<Id extends string> {
  readonly id: Id;
  readonly label: string;
}

export interface TabsProps<Id extends string> {
  tabs: readonly TabDefinition<Id>[];
  activeId: Id;
  onChange(id: Id): void;
  /** Prefix for the generated ids, so several tab sets can coexist. */
  idPrefix: string;
  /** Accessible name for the tab list. */
  label: string;
}

export function Tabs<Id extends string>({
  tabs,
  activeId,
  onChange,
  idPrefix,
  label,
}: TabsProps<Id>) {
  const buttonRefs = useRef(new Map<Id, HTMLButtonElement>());

  /** Arrow keys move the selection and the focus together, wrapping around. */
  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (offset === 0) return;

    event.preventDefault();
    const next = tabs[(index + offset + tabs.length) % tabs.length];
    if (next === undefined) return;

    onChange(next.id);
    buttonRefs.current.get(next.id)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="border-line rounded-inset flex flex-wrap gap-1 border bg-sunken p-1"
    >
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              if (node) buttonRefs.current.set(tab.id, node);
              else buttonRefs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            // Only the active tab is in the tab order; the arrow keys reach
            // the others. This is the roving tabindex the pattern calls for.
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={[
              'rounded-inset px-3 py-1.5 text-sm font-medium transition-all duration-150',
              isActive
                ? 'border-accent text-ink bg-accent/20 border'
                : 'text-ink-faint hover:text-ink border border-transparent hover:bg-wash/6',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Panel bound to a tab of the same id. */
export function TabPanel({
  id,
  idPrefix,
  active,
  alsoInPrint = false,
  children,
}: {
  id: string;
  idPrefix: string;
  active: boolean;
  /**
   * Keeps the panel mounted when it is not the active tab, hidden on screen
   * and visible in print.
   *
   * Tabs exist because several panels have to share one screen-sized space.
   * Paper has no such limit — it is as long as it needs to be — so a printed
   * report that showed only the tab the user happened to leave selected would
   * be withholding two thirds of its content for a reason that no longer
   * applies. `hidden` keeps the inactive panel out of the accessibility tree
   * and out of the layout exactly as unmounting did.
   */
  alsoInPrint?: boolean;
  children: React.ReactNode;
}) {
  if (!active && !alsoInPrint) return null;

  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${id}`}
      aria-labelledby={`${idPrefix}-tab-${id}`}
      tabIndex={active ? 0 : -1}
      className={active ? '' : 'hidden print:block'}
    >
      {children}
    </div>
  );
}
