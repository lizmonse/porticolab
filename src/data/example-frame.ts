/**
 * The preset the calculator opens on: a portal frame with a cantilever.
 *
 *                Mz = -28 kN·m          w = 18 kN/m (uniforme)
 *                       ↓            ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓
 *        12 kN ->  2 ╭─────────────────────────────╮ 3 ╭──────────╮ 5
 *                    │                               │      ▲▲▲▲▲▲  triangular
 *                e1  │                          e3   │  e4          0 → 14 kN/m
 *                    │                               │
 *                  __1__                           __4__
 *                 empotrado                      articulado
 *
 * Every choice here is meant to exercise something the previous preset could
 * not express, so the first screen a user sees is already a demonstration of
 * everything the engine gained:
 *
 *   - A UNIFORM span load on the beam. Its shear diagram is a sloping line
 *     crossing zero and its moment a parabola — neither of which a model with
 *     only nodal loads can produce, and both of which are what the fixed-end
 *     forces and the superposition on recovery exist for.
 *   - A TRIANGULAR span load on the cantilever, growing outwards. Its shear is
 *     a parabola and its moment a cubic, so the two curved diagrams on screen
 *     are of different degree rather than two copies of the same shape.
 *   - An APPLIED MOMENT at node 2. The bending diagram jumps there by exactly
 *     28 kN·m, which is the clearest single piece of evidence that the sign
 *     convention is right: it is a consequence of joint equilibrium and does
 *     not survive a flipped sign anywhere in the chain.
 *   - THREE different sections. The A and I columns of the input table are
 *     visibly a property of each member rather than a constant, and the
 *     cantilever is deliberately the lightest of them.
 *   - A CANTILEVER, so the model is not a closed rectangle and the drawing has
 *     a free end whose moment must close to zero.
 *   - Two DIFFERENT BASES. Node 1 restrains the rotation and node 4 does not,
 *     so the drawing shows a hatched wall beside a triangle and the results
 *     table shows a reaction moment at one base and a plain zero at the other.
 *     That contrast is the whole difference between an empotramiento and an
 *     articulación, in one picture.
 *
 * The frame is statically indeterminate to the second degree — 3(4) + 5 - 3(5)
 * — which is exactly the case that cannot be solved by statics alone and needs
 * the stiffness method.
 *
 * Sections are real rolled profiles, so the numbers in the table are the ones
 * a steel handbook gives:
 *
 *   HEB 200   A = 7810 mm²   I = 5696 cm⁴   columns
 *   IPE 300   A = 5380 mm²   I = 8356 cm⁴   beam
 *   IPE 240   A = 3910 mm²   I = 3892 cm⁴   cantilever
 *
 * Units: kN and m, which makes E kN/m², A m², I m⁴ and moments kN·m.
 */

import type { FrameModel } from '../types/frame';

/** Young's modulus of structural steel, E = 210 GPa, in kN/m^2. */
const E = 210e6;

/** HEB 200 column: A = 7810 mm^2 in m^2, I = 5696 cm^4 in m^4. */
const COLUMN = { A: 7.81e-3, I: 5.696e-5 };

/** IPE 300 beam: A = 5380 mm^2 in m^2, I = 8356 cm^4 in m^4. */
const BEAM = { A: 5.38e-3, I: 8.356e-5 };

/** IPE 240 cantilever: A = 3910 mm^2 in m^2, I = 3892 cm^4 in m^4. */
const CANTILEVER = { A: 3.91e-3, I: 3.892e-5 };

export const EXAMPLE_FRAME: FrameModel = {
  meta: {
    // UI-facing strings are Spanish by project convention.
    name: 'Pórtico con voladizo',
    description:
      'Pórtico de 5 m de luz y 3,5 m de altura con un voladizo de 3 m, empotrado en la base ' +
      'izquierda y articulado en la derecha. La viga lleva una carga uniforme de 18 kN/m y el ' +
      'voladizo una carga triangular que crece hasta 14 kN/m en el extremo libre; además actúan ' +
      'una acción lateral de 12 kN y un momento aplicado de 28 kN·m en el nudo 2. Columnas ' +
      'HEB 200, viga IPE 300 y voladizo IPE 240 en acero estructural (E = 210 GPa).',
    units: { force: 'kN', length: 'm' },
  },
  nodes: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 0, y: 3.5 },
    { id: 3, x: 5, y: 3.5 },
    { id: 4, x: 5, y: 0 },
    // The free end. Its moment and shear must both close to zero, which is the
    // check a reader can make on the diagram without computing anything.
    { id: 5, x: 8, y: 3.5 },
  ],
  elements: [
    { id: 1, from: 1, to: 2, E, ...COLUMN },
    { id: 2, from: 2, to: 3, E, ...BEAM },
    { id: 3, from: 3, to: 4, E, ...COLUMN },
    { id: 4, from: 3, to: 5, E, ...CANTILEVER },
  ],
  supports: [
    // Empotramiento: the rotation is held too, so this base develops a
    // reaction moment.
    { node: 1, restrainX: true, restrainY: true, restrainRz: true },
    // Articulación: both translations held, rotation free. Its reaction
    // moment is exactly zero, and the joint visibly rotates in the results.
    { node: 4, restrainX: true, restrainY: true, restrainRz: false },
  ],
  loads: [
    // Lateral action at the windward eaves — wind or seismic — and an applied
    // moment at the same joint. They share a node deliberately: the drawing
    // has to place a straight arrow and a curved one on one joint without
    // either becoming illegible, which is a case worth having on screen from
    // the first second.
    { node: 2, fx: 12, fy: 0, mz: -28 },
  ],
  distributedLoads: [
    // Uniform gravity load on the beam: a slab reaction, written the way it is
    // meant — negative wy, equal at both ends.
    { id: 1, element: 2, wxI: 0, wyI: -18, wxJ: 0, wyJ: -18 },
    // Triangular on the cantilever, zero at the support and growing to the
    // free end. Growing OUTWARDS rather than inwards on purpose: it puts the
    // resultant far from the root, so the cubic moment diagram has a
    // pronounced curvature instead of a nearly straight one.
    { id: 2, element: 4, wxI: 0, wyI: 0, wxJ: 0, wyJ: -14 },
  ],
};
