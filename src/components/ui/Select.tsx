/** Dropdown used to pick a node in the elements, supports and loads tables. */

import type { ReactNode } from 'react';

export interface SelectProps<T extends string | number> {
  value: T;
  onChange(value: T): void;
  options: readonly { readonly value: T; readonly label: string }[];
  label: string;
  disabled?: boolean;
  className?: string;
}

export function Select<T extends string | number>({
  value,
  onChange,
  options,
  label,
  disabled = false,
  className = '',
}: SelectProps<T>): ReactNode {
  return (
    <select
      aria-label={label}
      value={String(value)}
      disabled={disabled}
      onChange={(event) => {
        const selected = options.find((option) => String(option.value) === event.target.value);
        if (selected) onChange(selected.value);
      }}
      // `appearance-none` plus a background-image chevron: the native arrow is
      // drawn by the OS and several browsers keep it light-themed on a dark
      // control, leaving a bright notch on every row. The replacement is
      // themed from `--app-chevron`, which swaps with the palette.
      className={[
        'select-chevron rounded-inset border-line-strong bg-surface text-ink w-full appearance-none border py-2 pr-8 pl-3 text-sm',
        // The focus ring comes from global.css; suppressing the outline here
        // would remove the only strong keyboard affordance this control has.
        'hover:border-ink hover:bg-wash/5 focus:border-accent transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      ].join(' ')}
    >
      {options.map((option) => (
        // The dropdown list itself is drawn by the OS. The `color-scheme` set
        // per theme on the root gets most browsers there; painting the option
        // explicitly covers the ones that ignore it and would otherwise flash
        // a white list over a dark page.
        <option key={String(option.value)} value={String(option.value)} className="bg-surface text-ink">
          {option.label}
        </option>
      ))}
    </select>
  );
}
