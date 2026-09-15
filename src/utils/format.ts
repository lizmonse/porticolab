/**
 * Number formatting for the results tables.
 *
 * Engineering results span many orders of magnitude in the same table:
 * displacements around 1e-3 m sit next to stresses around 1e5 kN/m^2. A fixed
 * number of decimals is unreadable for both, so the formatter switches to
 * scientific notation outside a comfortable range.
 */

/** Below this magnitude a value is displayed as an exact zero. */
const ZERO_THRESHOLD = 1e-12;

/** Range within which fixed-point notation stays readable. */
const FIXED_LOWER_BOUND = 1e-3;
const FIXED_UPPER_BOUND = 1e6;

/**
 * Formats a number for display with the given significant digits.
 *
 * Uses fixed-point notation inside a readable range and scientific notation
 * outside it, so a table can hold displacements and stresses side by side.
 */
export function formatNumber(value: number, significantDigits = 4): string {
  if (!Number.isFinite(value)) return '—';

  const magnitude = Math.abs(value);
  if (magnitude < ZERO_THRESHOLD) return '0';

  if (magnitude >= FIXED_LOWER_BOUND && magnitude < FIXED_UPPER_BOUND) {
    // toPrecision cannot be used here: it silently switches to exponential
    // notation whenever the exponent reaches the requested precision, so
    // (58333.33).toPrecision(4) yields "5.833e+4" rather than a fixed-point
    // string. The decimal count is derived explicitly instead.
    const exponent = Math.floor(Math.log10(magnitude));
    const decimals = clamp(significantDigits - 1 - exponent, 0, 20);
    return trimTrailingZeros(value.toFixed(decimals));
  }

  return formatScientific(value, significantDigits);
}

/** Restricts a value to the range accepted by toFixed. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Formats a value in scientific notation, e.g. "1.951 × 10⁻³". */
export function formatScientific(value: number, significantDigits = 4): string {
  const [mantissa, exponent] = value.toExponential(significantDigits - 1).split('e');
  const power = Number(exponent);
  return `${trimTrailingZeros(mantissa ?? '0')} × 10${toSuperscript(power)}`;
}

/** Formats a displacement, which is always small and benefits from more digits. */
export function formatDisplacement(value: number): string {
  return formatNumber(value, 5);
}

/** Removes trailing zeros left behind by toPrecision / toExponential. */
function trimTrailingZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const;

/** Renders an integer exponent using Unicode superscript characters. */
function toSuperscript(exponent: number): string {
  const digits = Math.abs(exponent)
    .toString()
    .split('')
    .map((digit) => SUPERSCRIPT_DIGITS[Number(digit)] ?? '')
    .join('');
  return exponent < 0 ? `⁻${digits}` : digits;
}

/**
 * Fixed-decimal formatting for tables whose columns must not reflow.
 *
 * `formatNumber` keeps a constant number of SIGNIFICANT digits, so the width
 * of its output changes with the magnitude. That is right for a results column
 * but wrong for a 4x4 matrix, where every cell has to line up. This keeps the
 * decimal count constant instead.
 *
 * Two guards: magnitudes past 1e7 fall back to scientific notation rather than
 * printing a cell wide enough to break the grid, and values that round to zero
 * are printed as a positive zero, since a stray "-0.0000" in a stiffness
 * matrix reads as a sign error that is not there.
 */
export function formatFixed(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return '—';

  if (Math.abs(value) >= 1e7) return formatScientific(value, decimals);

  const roundsToZero = Math.abs(value) < 0.5 * 10 ** -decimals;
  return roundsToZero ? (0).toFixed(decimals) : value.toFixed(decimals);
}
