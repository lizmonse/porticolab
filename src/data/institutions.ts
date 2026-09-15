/**
 * The institutions backing the project.
 *
 * A list rather than two hard-coded blocks, so the credits panel and the
 * footer render the same set in the same order and cannot drift apart. Adding
 * a third institution is a line here and nothing else.
 *
 * Both seals are circular JPEGs on pure white — verified, not assumed — which
 * is what lets `.institution-logo` present them as white medallions inside a
 * ruled square that read identically on either theme.
 *
 * `logo` is nullable, and that is not dead weight: it is the state the credits
 * block spent a phase in while these marks were being confirmed, and the
 * components still branch on it to draw a framed monogram of the same size
 * instead of an image. Set it to null and the layout does not move, which is
 * what makes swapping a mark safe.
 *
 * Case matters in the path. Windows would forgive `/facultad.jpg` for
 * `Facultad.jpg`; a Linux host would answer it with a 404.
 */

export interface Institution {
  /** Full name, used as the visible label and as an image's alt text. */
  readonly name: string;
  /**
   * Public path of the mark, or null while none is available.
   *
   * Null is a first-class state rather than an empty string: it is what the
   * components branch on to draw the initials placeholder, and an empty string
   * would instead ask the browser to load the current page as an image.
   */
  readonly logo: string | null;
  /** Intrinsic pixel size of the square source. Ignored when `logo` is null. */
  readonly intrinsicSize: number;
  /**
   * Two or three characters drawn when there is no image.
   *
   * Kept as data rather than derived from the name: initials taken from
   * "Facultad de Ingeniería Civil y Mecánica" by splitting on spaces would
   * include the "de" and the "y".
   */
  readonly initials: string;
}

export const INSTITUTIONS: readonly Institution[] = [
  {
    name: 'Universidad Técnica de Ambato',
    logo: '/utecnicaambato_logo.jpg',
    intrinsicSize: 200,
    initials: 'UTA',
  },
  {
    name: 'Facultad de Ingeniería Civil y Mecánica',
    // Capital F. The file on disk is `Facultad.jpg`.
    logo: '/Facultad.jpg',
    intrinsicSize: 447,
    initials: 'FICM',
  },
];
