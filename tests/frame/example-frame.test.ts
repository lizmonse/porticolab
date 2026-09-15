/**
 * The preset the calculator opens on has to be correct, because it is the
 * first thing every user sees and the model most of them will edit rather than
 * replace. A broken preset would look like a broken engine.
 *
 * It also has three jobs no other fixture does:
 *
 *   - it is the only one exercising a MIXED support condition, one fixed base
 *     and one pinned, which is where the rotational degree of freedom stops
 *     being a formality and starts changing the answer;
 *   - it is the only one where a joint gathers THREE members, so the moment
 *     continuity check has something to fail on;
 *   - it carries both kinds of span load at once, so the two curved diagram
 *     families are on screen from the first second.
 *
 * Every expected value below is either a closed-form result of statics or a
 * consequence of equilibrium. None of them was read off this engine's output.
 */

import { describe, expect, it } from 'vitest';

import { EXAMPLE_FRAME } from '../../src/data/example-frame';
import { solveFrame } from '../../src/lib/frame';
import { elementGeometry } from '../../src/lib/frame/geometry';
import { internalForcesAt, shearZeroStations } from '../../src/lib/frame/postprocess';
import { solveModel } from '../../src/hooks/useFrameSolver';

const solution = solveFrame(EXAMPLE_FRAME);
const nodeById = new Map(EXAMPLE_FRAME.nodes.map((node) => [node.id, node]));
const displacementOf = (node: number) =>
  solution.nodalDisplacements.find((entry) => entry.node === node)!;
const reactionOf = (node: number) =>
  solution.reactions.find((entry) => entry.node === node)!;
const elementOf = (id: number) => solution.elements.find((entry) => entry.elementId === id)!;

/** Span, height and cantilever reach, in metres. */
const SPAN = 5;
const HEIGHT = 3.5;
const REACH = 3;

/** The two span-load intensities, in kN/m, as positive magnitudes. */
const UNIFORM = 18;
const TRIANGULAR_PEAK = 14;

describe('the preloaded portal frame with a cantilever', () => {
  it('is complete enough for the solver hook to run it without a click', () => {
    expect(solveModel(EXAMPLE_FRAME).status).toBe('solved');
  });

  it('is geometrically a portal with a cantilever off its right eaves', () => {
    const geometryOf = (id: number) => {
      const element = EXAMPLE_FRAME.elements.find((e) => e.id === id)!;
      return elementGeometry(nodeById.get(element.from)!, nodeById.get(element.to)!);
    };

    // Exact direction cosines, not approximate: a column drawn from (0,0) to
    // (0,3.5) has C = 0/3.5, and anything else would mean the geometry is not
    // truly vertical.
    expect(geometryOf(1).cos).toBe(0);
    expect(geometryOf(1).sin).toBe(1);
    expect(geometryOf(1).length).toBe(HEIGHT);

    expect(geometryOf(2).sin).toBe(0);
    expect(geometryOf(2).cos).toBe(1);
    expect(geometryOf(2).length).toBe(SPAN);

    expect(geometryOf(3).cos).toBe(0);
    expect(geometryOf(3).sin).toBe(-1); // drawn downwards, towards the base
    expect(geometryOf(3).length).toBe(HEIGHT);

    // The cantilever continues the beam rather than turning: same direction,
    // so the two read as one line broken by a joint.
    expect(geometryOf(4).sin).toBe(0);
    expect(geometryOf(4).cos).toBe(1);
    expect(geometryOf(4).length).toBe(REACH);
  });

  it('carries three sections whose inertia and area belong to real profiles', () => {
    // The radius of gyration i = sqrt(I/A) is the dimensional relation between
    // the two, and it is what a made-up pair of numbers gets wrong: an inertia
    // ten times too large or too small moves i out of the range any rolled
    // section occupies. Every member must reproduce its catalogue value.
    const radiusOfGyration = (id: number) => {
      const element = EXAMPLE_FRAME.elements.find((e) => e.id === id)!;
      return Math.sqrt(element.I / element.A) * 100; // cm
    };

    expect(radiusOfGyration(1)).toBeCloseTo(8.54, 2); // HEB 200
    expect(radiusOfGyration(2)).toBeCloseTo(12.46, 2); // IPE 300
    expect(radiusOfGyration(3)).toBeCloseTo(8.54, 2);
    // One decimal for this one: the catalogue prints iy = 9.97 cm, rounded
    // from A and I that are themselves rounded, and sqrt(I/A) of the printed
    // pair gives 9.977. A tenth still catches the error this check exists for,
    // which is an inertia out by a factor of ten.
    expect(radiusOfGyration(4)).toBeCloseTo(9.97, 1); // IPE 240

    // And the columns are the stockier section, as a column should be, while
    // the cantilever is the lightest member in the frame.
    const column = EXAMPLE_FRAME.elements.find((e) => e.id === 1)!;
    const beam = EXAMPLE_FRAME.elements.find((e) => e.id === 2)!;
    const cantilever = EXAMPLE_FRAME.elements.find((e) => e.id === 4)!;
    expect(column.A).toBeGreaterThan(beam.A);
    expect(beam.I).toBeGreaterThan(column.I);
    expect(cantilever.A).toBeLessThan(beam.A);
    expect(EXAMPLE_FRAME.elements.every((e) => e.E === 210e6)).toBe(true);
  });

  it('shows three distinct sections in the table, not one repeated', () => {
    // What the client asked the input table to make obvious. Three pairs, so
    // the A and I columns cannot be mistaken for constants.
    const sections = new Set(EXAMPLE_FRAME.elements.map((e) => `${e.A}/${e.I}`));
    expect(sections.size).toBe(3);
  });

  it('restrains three degrees of freedom at one base and two at the other', () => {
    const fixed = EXAMPLE_FRAME.supports.find((s) => s.node === 1)!;
    const pinned = EXAMPLE_FRAME.supports.find((s) => s.node === 4)!;

    expect([fixed.restrainX, fixed.restrainY, fixed.restrainRz]).toEqual([true, true, true]);
    expect([pinned.restrainX, pinned.restrainY, pinned.restrainRz]).toEqual([true, true, false]);
  });

  it('assembles a 15 x 15 system with 10 free degrees of freedom', () => {
    // Five nodes at three DOF each. The fixed base holds three of them and the
    // pinned base two, leaving ten unknowns.
    expect(solution.globalStiffness.length).toBe(15);
    expect(solution.freeDofs.length).toBe(10);
  });

  it('stays inside the elastic range of structural steel', () => {
    // Elastic section moduli of the real profiles, in m^3.
    const modulus: Record<number, number> = {
      1: 569.6e-6,
      2: 557e-6,
      3: 569.6e-6,
      4: 324e-6,
    };
    const yieldStrength = 275e3; // S275, in kN/m^2

    for (const element of solution.elements) {
      // The peak is taken along the member, not at its ends: with a span load
      // the largest moment is very often in the middle, and checking the ends
      // alone would let a preset that yields at midspan through.
      const stations = Array.from({ length: 21 }, (_unused, index) => (index / 20) * element.geometry.length);
      const peak = Math.max(
        ...stations.map((x) => Math.abs(internalForcesAt(element, x).moment)),
      );
      const total = peak / modulus[element.elementId]! + Math.abs(element.axialStress);

      // Loaded enough to be worth showing, far enough from yield to be a
      // sane demonstration rather than a structure on the point of failing.
      expect(total / yieldStrength).toBeGreaterThan(0.05);
      expect(total / yieldStrength).toBeLessThan(0.75);
    }
  });

  it('drifts by a fraction of its height, not by a visible amount', () => {
    // The check against a preset with absurd loads: a column that sways a few
    // millimetres is a real structure; one that sways 400 mm is a data entry
    // error that would make the drawing meaningless.
    const drift = Math.max(...solution.nodalDisplacements.map((entry) => Math.abs(entry.ux)));

    expect(HEIGHT / drift).toBeGreaterThan(150);
    expect(HEIGHT / drift).toBeLessThan(1000);
  });

  it('produces displacements of a physically sensible order of magnitude', () => {
    // Millimetres, not metres and not microns: a preset silently off by three
    // orders of magnitude would still solve, and the unit conversion of I is
    // exactly where that would come from.
    const largest = solution.nodalDisplacements.reduce(
      (max, d) => Math.max(max, Math.abs(d.ux), Math.abs(d.uy)),
      0,
    );
    expect(largest).toBeGreaterThan(1e-4);
    expect(largest).toBeLessThan(0.1);
  });
});

describe('equilibrium of the preloaded frame', () => {
  /** Total applied vertical load: the uniform run plus the triangle. */
  const appliedVertical = UNIFORM * SPAN + (TRIANGULAR_PEAK * REACH) / 2;

  it('balances the vertical span loads with the reactions', () => {
    const reacted = solution.reactions.reduce((sum, r) => sum + r.fy, 0);
    // 18 kN/m over 5 m plus a triangle peaking at 14 kN/m over 3 m: 111 kN.
    expect(appliedVertical).toBe(111);
    expect(reacted).toBeCloseTo(appliedVertical, 8);
  });

  it('balances the horizontal load with the reactions', () => {
    const applied = EXAMPLE_FRAME.loads.reduce((sum, load) => sum + load.fx, 0);
    const reacted = solution.reactions.reduce((sum, r) => sum + r.fx, 0);
    expect(reacted + applied).toBeCloseTo(0, 8);
  });

  it('satisfies moment equilibrium about the origin, span loads included', () => {
    const nodalMoment = (
      entries: readonly { node: number; fx: number; fy: number; mz: number }[],
    ) =>
      entries.reduce((sum, entry) => {
        const node = nodeById.get(entry.node)!;
        return sum + node.x * entry.fy - node.y * entry.fx + entry.mz;
      }, 0);

    // The uniform run acts at midspan; the triangle's resultant sits at two
    // thirds of the reach from its zero end.
    const uniformMoment = -(UNIFORM * SPAN) * (SPAN / 2);
    const triangleMoment =
      -((TRIANGULAR_PEAK * REACH) / 2) * (SPAN + (2 / 3) * REACH);

    const total =
      nodalMoment(solution.reactions) +
      nodalMoment(EXAMPLE_FRAME.loads) +
      uniformMoment +
      triangleMoment;

    expect(total).toBeCloseTo(0, 6);
  });

  it('tells the fixed base from the pinned one', () => {
    // This is the contrast the preset exists to show, and it is the one thing
    // a plane-truss engine could not have produced.
    expect(Math.abs(reactionOf(1).mz)).toBeGreaterThan(1);
    expect(reactionOf(4).mz).toBe(0);

    expect(displacementOf(1).rz).toBe(0);
    expect(displacementOf(4).rz).not.toBe(0);
  });

  it('leaves no moment at the pinned base', () => {
    // The column meeting a hinge cannot deliver bending to it, whatever the
    // rest of the frame does.
    expect(elementOf(3).endForces.momentJ).toBeCloseTo(0, 8);
  });

  it('carries the applied moment into the joint it is applied at', () => {
    // End forces are the actions ON each member, so at an unrestrained joint
    // the member end moments sum to the moment applied there. Node 2 carries
    // -28 kN·m.
    const applied = EXAMPLE_FRAME.loads.find((load) => load.node === 2)!.mz;
    expect(elementOf(1).endForces.momentJ + elementOf(2).endForces.momentI).toBeCloseTo(
      applied,
      6,
    );
  });

  it('closes the three-member joint to zero', () => {
    // Node 3 gathers the beam, the right column and the cantilever, and
    // carries no applied moment. A sign error anywhere in the fixed-end
    // chain shows up here and nowhere else, because it is the only joint
    // where three end moments have to cancel at once.
    const sum =
      elementOf(2).endForces.momentJ +
      elementOf(3).endForces.momentI +
      elementOf(4).endForces.momentI;
    expect(sum).toBeCloseTo(0, 6);
  });
});

describe('the span loads of the preloaded frame', () => {
  it('carries one uniform load and one triangular load', () => {
    const loads = EXAMPLE_FRAME.distributedLoads ?? [];
    expect(loads).toHaveLength(2);

    const uniform = loads.find((load) => load.element === 2)!;
    expect(uniform.wyI).toBe(uniform.wyJ);

    const triangular = loads.find((load) => load.element === 4)!;
    expect(triangular.wyI).toBe(0);
    expect(triangular.wyJ).not.toBe(0);
  });

  it('bends the beam into a parabola with its peak inside the span', () => {
    const beam = elementOf(2);
    const stations = shearZeroStations(beam);

    // One zero crossing, because a uniform load makes the shear linear.
    expect(stations).toHaveLength(1);
    expect(stations[0]).toBeGreaterThan(0);
    expect(stations[0]).toBeLessThan(SPAN);

    // And the moment there is a genuine maximum: larger than at either end.
    const peak = internalForcesAt(beam, stations[0] as number).moment;
    expect(peak).toBeGreaterThan(internalForcesAt(beam, 0).moment);
    expect(peak).toBeGreaterThan(internalForcesAt(beam, SPAN).moment);
  });

  it('roots the cantilever at exactly wL²/6 and frees its tip', () => {
    const cantilever = elementOf(4);

    // A cantilever is statically determinate whatever the frame behind it
    // does. A triangle of peak w over a reach L has resultant wL/2 acting at
    // 2L/3 from the zero end, so the root moment is wL/2 · 2L/3 = wL²/3.
    // Measured from the free end it is the same number: 14·3/2 · 2 = 42.
    const resultant = (TRIANGULAR_PEAK * REACH) / 2;
    const rootMoment = resultant * ((2 / 3) * REACH);
    expect(rootMoment).toBe(42);

    expect(Math.abs(internalForcesAt(cantilever, 0).moment)).toBeCloseTo(rootMoment, 8);
    expect(Math.abs(cantilever.endForces.shearI)).toBeCloseTo(resultant, 8);

    // The free end closes to zero in both, which is the check a reader can
    // make on the drawing without computing anything.
    expect(internalForcesAt(cantilever, REACH).moment).toBeCloseTo(0, 8);
    expect(internalForcesAt(cantilever, REACH).shear).toBeCloseTo(0, 8);
  });

  it('gives the two curved diagrams different degrees', () => {
    // The uniform load makes the beam's shear linear; the triangular one makes
    // the cantilever's quadratic. Sampling three points and comparing the two
    // successive differences separates them: they are equal for a straight
    // line and not for a curve.
    const straightness = (id: number) => {
      const element = elementOf(id);
      const L = element.geometry.length;
      const shear = [0, 0.5, 1].map((s) => internalForcesAt(element, s * L).shear);
      return Math.abs(shear[1]! - shear[0]! - (shear[2]! - shear[1]!));
    };

    expect(straightness(2)).toBeCloseTo(0, 8); // uniform load: linear shear
    expect(straightness(4)).toBeGreaterThan(1); // triangular load: curved
  });

  it('bends every member: no frame member is a two-force bar', () => {
    for (const element of solution.elements) {
      const { momentI, momentJ } = element.endForces;
      expect(Math.abs(momentI) + Math.abs(momentJ)).toBeGreaterThan(0.5);
    }
  });

  it('includes a nodal moment, so the curved-arrow symbol has something to draw', () => {
    expect(EXAMPLE_FRAME.loads.some((load) => load.mz !== 0)).toBe(true);
  });
});
