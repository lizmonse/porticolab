/**
 * Who this project belongs to.
 *
 * A module rather than markup, so the name, the role and the bio have one
 * source. The credit is rendered in exactly one place — the #proyecto section
 * of the landing — but keeping it here is what makes that a decision rather
 * than an accident: a second placement is a two-line change, not a copy of a
 * name that can then be edited in only one of them.
 *
 * It is also read by the print report header, so a name corrected here is
 * corrected on the printed calculation sheet without anyone remembering to.
 *
 * ---------------------------------------------------------------------------
 * No subject field
 * ---------------------------------------------------------------------------
 * The bio deliberately does not name a course. It said "como herramienta de
 * comprobación para la asignatura de X" and the client asked for that to go:
 * the tool outlives any one term, and a credit pinned to a subject dates it
 * the moment the term ends. What is left says what the work IS, which is the
 * part that stays true.
 */

export const AUTHOR = {
  name: 'Lizbeth Villafuerte',
  /**
   * Shown under the name.
   *
   * Says "estudiante", not "desarrolladora" or "ingeniera": a credit that
   * inflates a title is a worse credit than an accurate one, and this is
   * coursework presented as coursework.
   */
  role: 'Estudiante de Ingeniería Mecánica',
  /**
   * Drawn into the monogram badge in the #proyecto card.
   *
   * Two characters. Keep it in step with `name` — a monogram that does not
   * match the name beside it is the kind of detail a reader notices
   * immediately and cannot then unsee.
   */
  initials: 'LV',
  /**
   * States what the project actually is: coursework, not a product.
   *
   * Written in the third person and about the work rather than about the
   * author, because a first-person version reads like a launch page for a
   * tool being sold. The distinction matters for a university submission —
   * it is the difference between presenting an assignment and marketing an
   * application.
   */
  bio:
    'Trabajo académico centrado en el análisis matricial de pórticos planos. ' +
    'Esta calculadora se desarrolló como herramienta de comprobación: permite ' +
    'contrastar paso a paso los resultados obtenidos a mano en clase con los ' +
    'que produce el método de la rigidez directa, desglosando las matrices ' +
    'elementales y la matriz global de la estructura en lugar de entregar ' +
    'únicamente el resultado final.',
} as const;
