/**
 * Tests for the interface/engine unit boundary.
 *
 * These conversions sit between the user and a validated solver, so an error
 * here would corrupt every result while the engine's own tests kept passing.
 * The second moment of area is the worst of them: a wrong exponent leaves a
 * model that still solves, still looks plausible, and is wrong by four orders
 * of magnitude.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLE_FRAME } from '../../src/data/example-frame';
import {
  cleanFloat,
  engineToGigapascal,
  engineToMegapascal,
  engineToQuarticCentimetre,
  engineToSquareMillimetre,
  gigapascalToEngine,
  quarticCentimetreToEngine,
  squareMillimetreToEngine,
} from '../../src/utils/unit-conversion';

/** The two sections the preset carries: an HEB 200 column and an IPE 300 beam. */
const COLUMN = EXAMPLE_FRAME.elements[0]!;
const BEAM = EXAMPLE_FRAME.elements[1]!;

describe('Young modulus', () => {
  it('matches the reference model: 210 GPa is 210e6 kN/m²', () => {
    const { E } = EXAMPLE_FRAME.elements[0]!;
    expect(engineToGigapascal(E)).toBe(210);
    expect(gigapascalToEngine(210)).toBe(E);
  });

  it('round-trips without drift', () => {
    for (const gigapascal of [70, 200, 210, 0.5, 1234.5]) {
      expect(engineToGigapascal(gigapascalToEngine(gigapascal))).toBe(gigapascal);
    }
  });
});

describe('Cross-sectional area', () => {
  it('shows the reference sections as their catalogue values in mm²', () => {
    // The regression this guards: 1e-4 / 1e-6 evaluates to 100.00000000000001
    // in double precision, which is what the input field would have shown.
    expect(1e-4 / 1e-6).not.toBe(100);

    // Element 1 is an HEB 200 column, element 2 an IPE 300 beam. Reading both
    // is what keeps the preset honest: a conversion right for one section and
    // wrong for the other would slip past a single-value check.
    expect(engineToSquareMillimetre(COLUMN.A)).toBe(7810);
    expect(engineToSquareMillimetre(BEAM.A)).toBe(5380);
    expect(squareMillimetreToEngine(7810)).toBe(COLUMN.A);
    expect(squareMillimetreToEngine(5380)).toBe(BEAM.A);
  });

  it('round-trips without drift', () => {
    for (const squareMillimetre of [100, 1, 2500, 0.5, 12345]) {
      expect(engineToSquareMillimetre(squareMillimetreToEngine(squareMillimetre))).toBe(
        squareMillimetre,
      );
    }
  });
});

describe('Second moment of area', () => {
  it('shows the reference sections as their catalogue values in cm⁴', () => {
    // HEB 200: 5696 cm⁴. IPE 300: 8356 cm⁴.
    expect(engineToQuarticCentimetre(COLUMN.I)).toBe(5696);
    expect(engineToQuarticCentimetre(BEAM.I)).toBe(8356);
    expect(quarticCentimetreToEngine(5696)).toBe(COLUMN.I);
    expect(quarticCentimetreToEngine(8356)).toBe(BEAM.I);
  });

  it('scales by the FOURTH power of a hundredth, not the second', () => {
    // The mistake worth guarding: reusing the area factor would make every
    // section 10 000 times stiffer, and the model would still solve.
    expect(quarticCentimetreToEngine(1)).toBe(1e-8);
    expect(quarticCentimetreToEngine(1)).not.toBe(1e-4);
    expect(quarticCentimetreToEngine(1) / squareMillimetreToEngine(1)).toBeCloseTo(0.01, 12);
  });

  it('round-trips without drift', () => {
    for (const quarticCentimetre of [8356, 1, 1943, 0.5, 171000]) {
      expect(engineToQuarticCentimetre(quarticCentimetreToEngine(quarticCentimetre))).toBe(
        quarticCentimetre,
      );
    }
  });

  it('keeps a real section table honest end to end', () => {
    // IPE 300: I = 8356 cm⁴. An engineer types the catalogue number and the
    // solver has to receive metres to the fourth.
    expect(quarticCentimetreToEngine(8356)).toBeCloseTo(8.356e-5, 12);
    // HEB 300: I = 25 170 cm⁴.
    expect(quarticCentimetreToEngine(25170)).toBeCloseTo(2.517e-4, 12);
  });
});

describe('Stress', () => {
  it('converts kN/m² to MPa by a factor of a thousand', () => {
    expect(engineToMegapascal(58333.33333333333)).toBeCloseTo(58.3333, 4);
    expect(engineToMegapascal(-15023.130313759542)).toBeCloseTo(-15.023, 3);
    expect(engineToMegapascal(-105161.9122001129)).toBeCloseTo(-105.16, 2);
  });

  it('preserves the sign, so tension and compression stay distinguishable', () => {
    expect(engineToMegapascal(-1000)).toBe(-1);
    expect(engineToMegapascal(1000)).toBe(1);
  });
});

describe('cleanFloat', () => {
  it('removes representation noise without changing the value', () => {
    expect(cleanFloat(100.00000000000001)).toBe(100);
    expect(cleanFloat(0.30000000000000004)).toBe(0.3);
  });

  it('leaves genuine precision alone', () => {
    expect(cleanFloat(3.14159265358)).toBe(3.14159265358);
    expect(cleanFloat(1.5e-7)).toBe(1.5e-7);
  });

  it('passes through zero and non-finite values untouched', () => {
    expect(cleanFloat(0)).toBe(0);
    expect(cleanFloat(Number.NaN)).toBeNaN();
    expect(cleanFloat(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});
