/**
 * Conversion between the units shown in the interface and the units the
 * engine works in.
 *
 * The engine is unit-agnostic and consistent: it holds the model in kN and
 * metres, so E is in kN/m^2 and A in m^2 (see `types/truss.ts`). Those are
 * terrible numbers to type — a steel bar is E = 210000000 and A = 0.0001 —
 * so the tables ask for GPa and mm^2 instead and convert at the boundary.
 *
 * This module is the ONLY place that converts. The model, the solver and the
 * drawing never see interface units, so the validated engine keeps working
 * exactly as its tests describe.
 */

/** 1 GPa = 1e6 kN/m^2. */
const GPA_IN_KN_PER_M2 = 1e6;

/** 1 mm^2 = 1e-6 m^2. */
const MM2_IN_M2 = 1e-6;

/**
 * 1 cm^4 = 1e-8 m^4.
 *
 * Four powers of a hundredth, not two: an area conversion applied to a second
 * moment of area would be wrong by a factor of ten thousand, and the model
 * would still solve — quietly, with a structure ten thousand times too
 * flexible. The exponent is spelled out here for that reason.
 */
const CM4_IN_M4 = 1e-8;

/** 1 MPa = 1e3 kN/m^2. */
const MPA_IN_KN_PER_M2 = 1e3;

/**
 * Strips floating-point representation noise from a converted value.
 *
 * Dividing exact model values by an exact power of ten does not always give
 * back an exact result: 1e-4 / 1e-6 evaluates to 100.00000000000001, and that
 * is what the area input would display. Rounding to 12 significant digits is
 * far below the precision anyone types and well above what double precision
 * can represent, so it removes the artefact without losing real information.
 */
export function cleanFloat(value: number): number {
  if (!Number.isFinite(value) || value === 0) return value;
  return Number(value.toPrecision(12));
}

/** Young's modulus: GPa as typed by the user -> kN/m^2 for the engine. */
export function gigapascalToEngine(gigapascal: number): number {
  return cleanFloat(gigapascal * GPA_IN_KN_PER_M2);
}

/** Young's modulus: kN/m^2 from the model -> GPa for display. */
export function engineToGigapascal(kilonewtonPerSquareMetre: number): number {
  return cleanFloat(kilonewtonPerSquareMetre / GPA_IN_KN_PER_M2);
}

/**
 * Cross-section: mm^2 as typed by the user -> m^2 for the engine.
 *
 * Cleaned in this direction too, and not only for tidiness: 100 * 1e-6
 * evaluates to 0.00009999999999999999, so without it merely opening the area
 * field and moving on would permanently rewrite an exact 1e-4 in the model.
 * Cleaning both directions makes an edit that changes nothing change nothing.
 */
export function squareMillimetreToEngine(squareMillimetre: number): number {
  return cleanFloat(squareMillimetre * MM2_IN_M2);
}

/** Cross-section: m^2 from the model -> mm^2 for display. */
export function engineToSquareMillimetre(squareMetre: number): number {
  return cleanFloat(squareMetre / MM2_IN_M2);
}

/**
 * Second moment of area: cm^4 as typed by the user -> m^4 for the engine.
 *
 * cm^4 is what a steel section table is written in — an IPE 300 is 8356 cm^4,
 * not 0.00008356 m^4 — so it is the only unit a user can check their input
 * against without a calculator.
 */
export function quarticCentimetreToEngine(quarticCentimetre: number): number {
  return cleanFloat(quarticCentimetre * CM4_IN_M4);
}

/** Second moment of area: m^4 from the model -> cm^4 for display. */
export function engineToQuarticCentimetre(quarticMetre: number): number {
  return cleanFloat(quarticMetre / CM4_IN_M4);
}

/**
 * Stress: kN/m^2 from the solver -> MPa for display.
 *
 * The reference text reports the Example 5.1 stresses as 58.3333 MPa rather
 * than 58333 kN/m^2, and MPa is what a section table is written in, so the
 * results read in the unit an engineer would check them against.
 */
export function engineToMegapascal(kilonewtonPerSquareMetre: number): number {
  return kilonewtonPerSquareMetre / MPA_IN_KN_PER_M2;
}
