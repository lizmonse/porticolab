/**
 * Validation of the plane frame element mathematics.
 *
 * The reference for the bending terms is the closed-form cantilever: a member
 * fixed at end i with a transverse load P at end j deflects PL^3/3EI and
 * rotates PL^2/2EI. If the 6x6 matrix is right, that solution has to fall out
 * of it, and the end forces have to come back as P, PL at the fixed end and
 * P, 0 at the free one.
 */

import { describe, expect, it } from 'vitest';

import {
  elementEndForces,
  elementEndForcesFromGeometry,
  elementStiffness,
  elementStiffnessFromGeometry,
  elementTransformation,
  localStiffness,
} from '../../src/lib/frame/element';
import { FrameError } from '../../src/lib/frame/errors';
import { elementGeometry } from '../../src/lib/frame/geometry';

/** A steel member: E in kN/m^2, A in m^2, I in m^4, L in m. */
const E = 200e6;
const A = 6e-3;
const I = 8e-5;
const L = 3;
/** Tip load, in kN. */
const P = 10;

describe('localStiffness', () => {
  it('places the axial, shear, coupling and rotation terms where theory puts them', () => {
    const k = localStiffness(E, A, I, L);

    expect(k[0]![0]).toBeCloseTo((E * A) / L, 6);
    expect(k[1]![1]).toBeCloseTo((12 * E * I) / L ** 3, 6);
    expect(k[1]![2]).toBeCloseTo((6 * E * I) / L ** 2, 6);
    expect(k[2]![2]).toBeCloseTo((4 * E * I) / L, 6);
    expect(k[2]![5]).toBeCloseTo((2 * E * I) / L, 6);
  });

  it('keeps axial and bending uncoupled in local axes', () => {
    const k = localStiffness(E, A, I, L);
    for (const row of [0, 3]) {
      for (const column of [1, 2, 4, 5]) {
        expect(k[row]![column]).toBe(0);
      }
    }
  });

  it('is symmetric and singular in the three rigid-body modes', () => {
    const k = localStiffness(E, A, I, L);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(k[r]![c]).toBe(k[c]![r]);
      }
    }

    // A rigid translation along local y produces no end forces.
    const rigid = [0, 1, 0, 0, 1, 0];
    for (let r = 0; r < 6; r++) {
      const force = rigid.reduce((sum, u, c) => sum + k[r]![c]! * u, 0);
      expect(force).toBeCloseTo(0, 6);
    }
  });

  it('rejects a non-positive second moment of area', () => {
    expect(() => localStiffness(E, A, 0, L)).toThrowError(FrameError);
    try {
      localStiffness(E, A, -1, L);
    } catch (error) {
      expect((error as FrameError).code).toBe('INVALID_SECTION');
    }
  });
});

describe('elementStiffness', () => {
  it('reduces to the local matrix for a horizontal member', () => {
    const k = elementStiffness(E, A, I, L, 0);
    const kLocal = localStiffness(E, A, I, L);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(k[r]![c]).toBeCloseTo(kLocal[r]![c]!, 6);
      }
    }
  });

  it('swaps the axial and shear stiffness for a vertical member', () => {
    const k = elementStiffness(E, A, I, L, 90);

    expect(k[1]![1]).toBeCloseTo((E * A) / L, 4);
    expect(k[0]![0]).toBeCloseTo((12 * E * I) / L ** 3, 6);
    // The rotational DOF shares the Z axis with the global frame, so it is
    // the one entry a rotation never touches.
    expect(k[2]![2]).toBeCloseTo((4 * E * I) / L, 6);
  });

  it('stays exactly symmetric at an arbitrary angle', () => {
    const k = elementStiffness(E, A, I, L, 37.5);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(k[r]![c]).toBe(k[c]![r]);
      }
    }
  });

  it('agrees with the geometry-driven path', () => {
    const geometry = elementGeometry({ id: 1, x: 0, y: 0 }, { id: 2, x: 3, y: 4 });
    const fromGeometry = elementStiffnessFromGeometry(E, A, I, geometry);
    const fromAngle = elementStiffness(E, A, I, geometry.length, geometry.angleDeg);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(fromGeometry[r]![c]).toBeCloseTo(fromAngle[r]![c]!, 4);
      }
    }
  });
});

describe('elementTransformation', () => {
  it('leaves the rotational DOFs alone and rotates only the translations', () => {
    const T = elementTransformation(90);

    expect(T[2]![2]).toBe(1);
    expect(T[5]![5]).toBe(1);
    expect(T[0]![1]).toBeCloseTo(1, 12);
    expect(T[1]![0]).toBeCloseTo(-1, 12);
  });
});

describe('elementEndForces', () => {
  it('matches the closed-form cantilever', () => {
    const deflection = -(P * L ** 3) / (3 * E * I);
    const rotation = -(P * L ** 2) / (2 * E * I);

    const f = elementEndForces(E, A, I, L, 0, [0, 0, 0, 0, deflection, rotation]);

    expect(f.axialI).toBeCloseTo(0, 8);
    expect(f.shearI).toBeCloseTo(P, 8);
    expect(f.momentI).toBeCloseTo(P * L, 8);
    expect(f.shearJ).toBeCloseTo(-P, 8);
    // The free end of a cantilever carries no moment.
    expect(f.momentJ).toBeCloseTo(0, 8);
  });

  it('reports tension as a positive axial force', () => {
    const stretch = 1e-3;
    const f = elementEndForces(E, A, I, L, 0, [0, 0, 0, stretch, 0, 0]);

    expect(f.axialForce).toBeCloseTo(((E * A) / L) * stretch, 6);
    expect(f.axialForce).toBeGreaterThan(0);
    expect(f.axialI).toBeCloseTo(-f.axialForce, 6);
  });

  it('gives the same local forces for an inclined member as for a rotated one', () => {
    // A member at 30 deg, stretched along its own axis by the same amount:
    // the local end forces cannot depend on how the member is oriented.
    const angle = (30 * Math.PI) / 180;
    const stretch = 1e-3;
    const global = [
      0,
      0,
      0,
      stretch * Math.cos(angle),
      stretch * Math.sin(angle),
      0,
    ];

    const geometry = elementGeometry(
      { id: 1, x: 0, y: 0 },
      { id: 2, x: L * Math.cos(angle), y: L * Math.sin(angle) },
    );
    const inclined = elementEndForcesFromGeometry(E, A, I, geometry, global);
    const horizontal = elementEndForces(E, A, I, L, 0, [0, 0, 0, stretch, 0, 0]);

    expect(inclined.axialForce).toBeCloseTo(horizontal.axialForce, 6);
    expect(inclined.shearI).toBeCloseTo(0, 6);
    expect(inclined.momentI).toBeCloseTo(0, 6);
  });

  it('rejects a displacement vector that is not six components long', () => {
    expect(() => elementEndForces(E, A, I, L, 0, [0, 0, 0, 0])).toThrowError(FrameError);
  });
});
