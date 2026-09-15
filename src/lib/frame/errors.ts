/**
 * Engine errors.
 *
 * The engine never returns NaN nor silently wrong results: on invalid input
 * it throws a FrameError carrying a stable machine-readable code.
 *
 * LANGUAGE NOTE: `message` is written in English, for developers and logs.
 * User-facing Spanish text is produced by the UI layer, which maps
 * `FrameErrorCode` to a localized string. Never surface `message` directly.
 */

export type FrameErrorCode =
  /** Two nodes of an element share coordinates: L = 0. */
  | 'ZERO_LENGTH_ELEMENT'
  /** E or A is not a finite positive number. */
  | 'INVALID_MATERIAL'
  /** The second moment of area I is not a finite positive number. */
  | 'INVALID_SECTION'
  /** A referenced node does not exist in the model. */
  | 'UNKNOWN_NODE'
  /** A distributed load references an element that does not exist. */
  | 'UNKNOWN_ELEMENT'
  /** Two nodes share the same identifier. */
  | 'DUPLICATE_NODE_ID'
  /** A node identifier is not an integer >= 1. */
  | 'INVALID_NODE_ID'
  /** An element connects a node to itself. */
  | 'SELF_CONNECTED_ELEMENT'
  /** A displacement vector was passed without exactly 6 components. */
  | 'INVALID_DISPLACEMENT_VECTOR'
  /** The model has no nodes or no elements. */
  | 'EMPTY_MODEL'
  /** No DOF is restrained: the structure is free to move as a rigid body. */
  | 'NO_SUPPORTS'
  /** The reduced stiffness matrix is singular: the structure is a mechanism. */
  | 'SINGULAR_STIFFNESS'
  /** A load or coordinate is not a finite number. */
  | 'NON_FINITE_INPUT'
  /** The model uses a feature the engine does not implement yet. */
  | 'UNSUPPORTED_FEATURE';

/** Domain error of the engine, carrying a machine-readable code. */
export class FrameError extends Error {
  public readonly code: FrameErrorCode;

  constructor(code: FrameErrorCode, message: string) {
    super(message);
    this.name = 'FrameError';
    this.code = code;
    // Preserve the prototype chain when compiling down to ES5/ES2015.
    Object.setPrototypeOf(this, FrameError.prototype);
  }
}

/** Throws unless `value` is a finite, strictly positive number. */
export function assertPositiveFinite(
  value: number,
  name: string,
  code: FrameErrorCode,
): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FrameError(code, `${name} must be a finite positive number (received ${value}).`);
  }
}

/** Throws unless `value` is a finite number. Zero and negatives are allowed. */
export function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new FrameError('NON_FINITE_INPUT', `${name} must be a finite number (received ${value}).`);
  }
}
