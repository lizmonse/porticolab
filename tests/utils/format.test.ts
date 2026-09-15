/**
 * Tests for the results formatter.
 *
 * Written after a real defect: the fixed-point branch used `toPrecision`,
 * which silently switches to exponential notation once the exponent reaches
 * the requested precision. Stresses around 5.8e4 rendered as the raw
 * JavaScript string "5.833e+4" instead of a readable fixed-point number.
 */

import { describe, expect, it } from 'vitest';

import {
  formatDisplacement,
  formatFixed,
  formatNumber,
  formatScientific,
} from '../../src/utils/format';

describe('formatNumber', () => {
  it('keeps fixed-point notation across the readable range', () => {
    // The regression: every one of these has an exponent >= the significant
    // digits requested, which is exactly when toPrecision bails out.
    expect(formatNumber(58333.33333333333)).toBe('58333');
    expect(formatNumber(-15023.130313759542)).toBe('-15023');
    expect(formatNumber(-105161.9122001129)).toBe('-105162');
    expect(formatNumber(5250)).toBe('5250');
  });

  it('does not strip significant zeros from whole numbers', () => {
    expect(formatNumber(1000)).toBe('1000');
    expect(formatNumber(10)).toBe('10');
  });

  it('honours the requested significant digits', () => {
    expect(formatNumber(3.605551275463989)).toBe('3.606');
    expect(formatNumber(123.69006752597979)).toBe('123.7');
    expect(formatNumber(3.605551275463989, 6)).toBe('3.60555');
  });

  it('trims trailing zeros left by toFixed', () => {
    expect(formatNumber(4)).toBe('4');
    expect(formatNumber(1.5)).toBe('1.5');
    expect(formatNumber(0.001)).toBe('0.001');
  });

  it('switches to scientific notation outside the readable range', () => {
    expect(formatNumber(1.2e-5)).toBe('1.2 × 10⁻⁵');
    expect(formatNumber(2.5e8)).toBe('2.5 × 10⁸');
  });

  it('renders negligible values as an exact zero', () => {
    // Rounding noise in a reaction at a free DOF must not read as 1e-17.
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1e-15)).toBe('0');
    expect(formatNumber(-1e-15)).toBe('0');
  });

  it('renders non-finite values as a dash rather than "NaN"', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatDisplacement', () => {
  it('keeps enough digits for millimetre-scale movements', () => {
    // The Example 5.1 displacements, which the text prints as 0.0011, 0.0020
    // and -0.0016.
    expect(formatDisplacement(1.1111111111111109e-3)).toBe('0.0011111');
    expect(formatDisplacement(1.9505605133243616e-3)).toBe('0.0019506');
    expect(formatDisplacement(-1.6103747772759757e-3)).toBe('-0.0016104');
  });
});

describe('formatScientific', () => {
  it('uses Unicode superscripts for the exponent', () => {
    expect(formatScientific(1.2345e-7, 4)).toBe('1.235 × 10⁻⁷'); // redondeo a 4 cifras
    expect(formatScientific(9.9e12, 2)).toBe('9.9 × 10¹²');
  });
});

describe('formatFixed', () => {
  it('keeps the decimal count constant so matrix columns line up', () => {
    expect(formatFixed(4)).toBe('4.0000');
    expect(formatFixed(3.605551275463989)).toBe('3.6056');
    expect(formatFixed(5250, 2)).toBe('5250.00');
    expect(formatFixed(1792.1083260244716, 2)).toBe('1792.11');
  });

  it('never prints a negative zero', () => {
    // The CS terms of a horizontal bar land a hair below zero. Printing
    // "-0.0000" in a stiffness matrix reads as a sign error that is not there.
    expect(formatFixed(-1e-17)).toBe('0.0000');
    expect(formatFixed(-0.00001, 4)).toBe('0.0000');
    expect(formatFixed(0)).toBe('0.0000');
  });

  it('still rounds normally either side of zero', () => {
    expect(formatFixed(-0.5)).toBe('-0.5000');
    expect(formatFixed(-0.00006, 4)).toBe('-0.0001');
  });

  it('falls back to scientific notation before a cell can blow up the grid', () => {
    expect(formatFixed(2.5e9, 3)).toBe('2.5 × 10⁹');
    expect(formatFixed(9999999, 2)).toBe('9999999.00');
  });

  it('renders non-finite values as a dash', () => {
    expect(formatFixed(Number.NaN)).toBe('—');
  });
});
