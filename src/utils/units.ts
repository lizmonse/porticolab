/**
 * The unit system the interface presents.
 *
 * Fixed, not selectable. The interface commits to one consistent system --
 * kN, m, GPa, mm2, cm4, MPa -- which is the usual convention for structural
 * steel work in SI. The engine itself remains unit-agnostic; conversion
 * happens only at the input boundary, in `utils/unit-conversion.ts`.
 */

export interface UnitLabels {
  /** Force, as typed for loads and reported for reactions. */
  readonly force: string;
  /** Moment, as typed for nodal moments and reported for bending. */
  readonly moment: string;
  /** Length, as typed for coordinates and reported for displacements. */
  readonly length: string;
  /** Rotation, as reported for the third nodal degree of freedom. */
  readonly rotation: string;
  /** Young's modulus, as typed in the elements table. */
  readonly modulus: string;
  /** Cross-sectional area, as typed in the elements table. */
  readonly area: string;
  /** Second moment of area, as typed in the elements table. */
  readonly inertia: string;
  /** Axial stress, as reported in the results table. */
  readonly stress: string;
}

export const UNITS: UnitLabels = {
  force: 'kN',
  moment: 'kN·m',
  length: 'm',
  rotation: 'rad',
  modulus: 'GPa',
  area: 'mm²',
  inertia: 'cm⁴',
  stress: 'MPa',
};
