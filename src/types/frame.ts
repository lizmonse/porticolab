/**
 * Domain contracts for plane frame (2D frame) analysis by the Direct
 * Stiffness Method.
 *
 * Reference: Kattan, P.I., "MATLAB Guide to Finite Elements", the plane frame
 * element chapter (PlaneFrameElementStiffness, PlaneFrameElementForces),
 * Springer.
 *
 * WHAT CHANGES FROM A PLANE TRUSS
 * A truss bar is pin-jointed: it carries axial force only, so a node has two
 * degrees of freedom and an element has a 4x4 stiffness matrix. A frame
 * member is rigidly connected: it carries axial force, shear and bending, so
 * a node has THREE degrees of freedom (u, v, theta_z) and an element has a
 * 6x6 stiffness matrix. The global system grows from 2n x 2n to 3n x 3n, and
 * every element needs a second section property, the second moment of area I.
 *
 * UNIT CONVENTION
 * The engine is unit-agnostic: it converts nothing. Callers must supply a
 * consistent system. The one used throughout the interface is E in kN/m^2,
 * A in m^2, I in m^4, coordinates in m, forces in kN and moments in kN·m,
 * which yields displacements in m, rotations in rad, forces in kN and
 * moments in kN·m.
 */

// ---------------------------------------------------------------------------
// Matrix and vector aliases
// ---------------------------------------------------------------------------

/**
 * Six-component vector: an element's DOFs, ordered
 * [u_i, v_i, theta_i, u_j, v_j, theta_j].
 *
 * This order is fixed and shared by the element stiffness matrix, the
 * transformation matrix, the displacement vector and the end-force vector.
 * Every module that slices six numbers assumes it.
 */
export type Vec6 = readonly [number, number, number, number, number, number];

/** Element stiffness matrix of a plane frame element, 6x6. */
export type Matrix6 = readonly [Vec6, Vec6, Vec6, Vec6, Vec6, Vec6];

/** Dense matrix of arbitrary size, indexed [row][column]. */
export type Matrix = readonly (readonly number[])[];

// ---------------------------------------------------------------------------
// Identifiers and degrees of freedom
// ---------------------------------------------------------------------------

/**
 * One-based node identifier, matching both the reference text and the UI
 * (users type "node 1", never "node 0").
 *
 * Translation to zero-based indices happens EXCLUSIVELY in `lib/frame/dof.ts`.
 * No other module may perform index arithmetic on a NodeId.
 */
export type NodeId = number;

/** Zero-based degree-of-freedom index, ready to index an array. */
export type DofIndex = number;

/** An element's six global DOFs, zero-based, in the order of `Vec6`. */
export type ElementDofs = readonly [
  DofIndex,
  DofIndex,
  DofIndex,
  DofIndex,
  DofIndex,
  DofIndex,
];

/**
 * Which of a node's three degrees of freedom is meant.
 *
 * 'x' and 'y' are translations along the global axes; 'rz' is the rotation
 * about the out-of-plane Z axis, measured in radians and positive
 * counter-clockwise.
 */
export type DofComponent = 'x' | 'y' | 'rz';

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

/** A frame node, defined by its position in the global XY plane. */
export interface FrameNode {
  readonly id: NodeId;
  readonly x: number;
  readonly y: number;
  /** Optional UI label. Takes no part in the computation. */
  readonly label?: string;
}

/**
 * A rigidly connected member joining two nodes. Carries axial force, shear
 * and bending moment.
 *
 * `from` is node i and `to` is node j. The order determines the sign of theta
 * and the sign convention of the end forces, but NOT the physical result: the
 * global stiffness matrix is invariant under swapping i and j, and the end
 * forces simply swap ends with it (covered by tests).
 */
export interface FrameElement {
  readonly id: number;
  readonly from: NodeId;
  readonly to: NodeId;
  /** Young's modulus E. Must be finite and positive. */
  readonly E: number;
  /** Cross-sectional area A. Must be finite and positive. */
  readonly A: number;
  /**
   * Second moment of area I about the bending axis (the out-of-plane Z axis).
   * Must be finite and positive.
   *
   * This is the property a truss has no use for and a frame cannot do
   * without: it scales every bending term of the stiffness matrix.
   */
  readonly I: number;
}

/**
 * Point load applied at a node, in global components.
 *
 * `mz` is a concentrated moment about the out-of-plane Z axis, positive
 * counter-clockwise, and is the third component a truss load did not have.
 *
 * For loads applied along a member rather than at a joint, see
 * `DistributedLoad`.
 */
export interface NodalLoad {
  readonly node: NodeId;
  readonly fx: number;
  readonly fy: number;
  readonly mz: number;
}

/**
 * A load spread along a member, in force per unit length.
 *
 * ---------------------------------------------------------------------------
 * One shape, not three
 * ---------------------------------------------------------------------------
 * The intensity varies LINEARLY from end i to end j, which makes this a
 * trapezoidal load — and the three cases a course names are the degenerate
 * forms of it:
 *
 *     uniform      wI === wJ
 *     triangular   one of the two is zero
 *     trapezoidal  the general case
 *
 * They are not separate variants because the fixed-end formulas collapse into
 * one pair of expressions covering all three (see `fixedEndForces`). A
 * discriminated union would have bought three code paths, three sets of
 * formulas and three chances to get a sign wrong, in exchange for nothing the
 * caller cannot express by passing equal or zero intensities.
 * `classifyDistributedLoad` recovers the name for display.
 *
 * ---------------------------------------------------------------------------
 * Direction: GLOBAL, not local
 * ---------------------------------------------------------------------------
 * `wx` and `wy` are components along the GLOBAL axes, so self-weight and a
 * slab reaction are written the way they are meant — `wy` negative, `wx`
 * zero — regardless of how the member is oriented.
 *
 * The consequence is the reason this deserves a note: on an INCLINED member a
 * global load has a component along the member's own axis, so the axial force
 * N varies along the span instead of being constant. Every consumer of
 * `axialForce` has to know that it is now a member-level summary of a varying
 * quantity rather than the single value it used to be.
 */
export interface DistributedLoad {
  readonly id: number;
  /** The element it acts on, by `FrameElement.id`. */
  readonly element: number;
  /** Global X intensity at end i, force per unit length. */
  readonly wxI: number;
  /** Global Y intensity at end i. Negative is downward. */
  readonly wyI: number;
  /** Global X intensity at end j. */
  readonly wxJ: number;
  /** Global Y intensity at end j. */
  readonly wyJ: number;
}

/** The name of a distributed load's shape, for labelling only. */
export type DistributedLoadShape = 'uniform' | 'triangular' | 'trapezoidal' | 'zero';

/**
 * A span load resolved into the member's own axes.
 *
 * The rotation from global to local is constant along a straight member, so a
 * load that is linear in global components stays linear in local ones — which
 * is what keeps the fixed-end formulas closed-form.
 */
export interface LocalSpanLoad {
  /** Axial intensity along local +x, at end i and at end j. */
  readonly pI: number;
  readonly pJ: number;
  /** Transverse intensity along local +y, at end i and at end j. */
  readonly qI: number;
  readonly qJ: number;
}

/**
 * The internal actions at one station along a member, in local axes.
 *
 * Sign convention is the one `utils/diagrams.ts` documents: N tension
 * positive, M sagging positive.
 */
export interface InternalForces {
  /** Distance from end i, along the member, in [0, L]. */
  readonly x: number;
  readonly axial: number;
  readonly shear: number;
  readonly moment: number;
}

/**
 * Support condition at a node.
 *
 * The three flags mark the DOFs with a prescribed value, which is what
 * distinguishes the usual support types of a frame:
 *
 *     fixed (empotramiento)  x, y and rz restrained
 *     pinned (articulado)    x and y restrained, rz free
 *     roller (móvil)         one translation restrained
 *     guided                 rz restrained with a translation free
 *
 * `settlement` allows a non-zero prescribed value: `dx` and `dy` are support
 * settlements, `rz` an imposed rotation, in radians. When omitted, a
 * restrained DOF is held at zero.
 *
 * `inclinationDeg` corresponds to an inclined support. NOT YET IMPLEMENTED:
 * the solver rejects models that use it rather than ignoring it silently.
 */
export interface Support {
  readonly node: NodeId;
  readonly restrainX: boolean;
  readonly restrainY: boolean;
  /** Restrains the rotation. This is what makes a support fixed rather than pinned. */
  readonly restrainRz: boolean;
  readonly settlement?: {
    readonly dx?: number;
    readonly dy?: number;
    readonly rz?: number;
  };
  readonly inclinationDeg?: number;
}

/** A complete model, ready to be solved. */
export interface FrameModel {
  readonly nodes: readonly FrameNode[];
  readonly elements: readonly FrameElement[];
  readonly supports: readonly Support[];
  readonly loads: readonly NodalLoad[];
  /**
   * Loads spread along members. Optional, and that is deliberate: a model
   * written before span loads existed is still a valid model, and omitting
   * the field must produce results identical to the ones it produced then.
   */
  readonly distributedLoads?: readonly DistributedLoad[];
  /** UI metadata. Takes no part in the computation. */
  readonly meta?: {
    readonly name?: string;
    readonly description?: string;
    readonly units?: { readonly force: string; readonly length: string };
  };
}

// ---------------------------------------------------------------------------
// Derived geometry
// ---------------------------------------------------------------------------

/**
 * An element's geometry, derived from its node coordinates.
 *
 * `cos` and `sin` (C and S) are computed directly as dx/L and dy/L, without a
 * round trip through atan2 and back through cos/sin. That is algebraically
 * identical and avoids the round-trip rounding error. `angleDeg` is kept for
 * display and for comparison against the theta values printed in the
 * reference text.
 */
export interface ElementGeometry {
  /** Element length L. Always > 0. */
  readonly length: number;
  /** Angle theta from the positive global X axis, in radians, in [0, 2*pi). */
  readonly angleRad: number;
  /** The same angle in degrees, in [0, 360). */
  readonly angleDeg: number;
  /** C = cos(theta) = dx / L */
  readonly cos: number;
  /** S = sin(theta) = dy / L */
  readonly sin: number;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Axial state of a member, derived from the sign of its axial force. */
export type AxialState = 'tension' | 'compression' | 'zero';

/**
 * The six end forces of a member, in its LOCAL axes.
 *
 * A truss bar reduced to a single number, the axial force. A frame member
 * needs six, and the sign convention matters:
 *
 *   `local` holds the raw product k_local * T * u, ordered like `Vec6`:
 *   [N_i, V_i, M_i, N_j, V_j, M_j], measured along the member's own local axes
 *   (local x runs from i to j, local y is 90 deg counter-clockwise from it,
 *   moments are positive counter-clockwise).
 *
 *   These are the end actions acting ON THE MEMBER, not the forces the member
 *   exerts on its joints — the two differ by a sign, and getting the direction
 *   backwards inverts every moment diagram drawn from them. The consequence to
 *   check against: at an unrestrained joint the member end moments meeting
 *   there sum to the APPLIED moment, and to zero when none is applied.
 *
 *   The named fields are that same vector, unpacked for the results table.
 *
 * `axialForce` is the member-level axial force with the usual structural
 * sign: POSITIVE MEANS TENSION.
 *
 * Without a span load it is exactly `axialJ`: the end force that points away
 * from the member when the member is being pulled, and equal in magnitude to
 * the one at end i because nothing is applied in between.
 *
 * With an axial span load the two ends no longer agree, and this becomes a
 * SUMMARY: whichever end carries the larger magnitude, keeping its sign. That
 * is what the member colouring and the state badge read, so a member is
 * coloured by its worst axial section rather than by an arbitrary end. Use
 * `axialI` and `axialJ` when the distinction matters, or `internalForcesAt`
 * for the value at an arbitrary station.
 */
export interface ElementEndForces {
  /** Raw local end-force vector, in the `Vec6` order. */
  readonly local: Vec6;
  /** Local axial force at end i. */
  readonly axialI: number;
  /** Local shear force at end i. */
  readonly shearI: number;
  /** Bending moment at end i. */
  readonly momentI: number;
  /** Local axial force at end j. */
  readonly axialJ: number;
  /** Local shear force at end j. */
  readonly shearJ: number;
  /** Bending moment at end j. */
  readonly momentJ: number;
  /** Member axial force, positive in tension. */
  readonly axialForce: number;
}

/** Per-element post-processing results. */
export interface ElementResult {
  readonly elementId: number;
  readonly geometry: ElementGeometry;
  /**
   * The 6x6 stiffness matrix in LOCAL coordinates, before rotation.
   *
   * Carried through for the step-by-step matrix viewer, which shows the
   * method the way it is taught: local matrix, transformation matrix, global
   * matrix, assembly.
   */
  readonly localStiffness: Matrix6;
  /** The 6x6 transformation matrix T that rotates global DOFs into local ones. */
  readonly transformation: Matrix6;
  /**
   * The element stiffness matrix that was assembled into K, in global
   * coordinates and in the `Vec6` DOF order.
   *
   * Carried through from assembly rather than recomputed by the caller: the
   * interface shows this matrix beside the global one, and a second
   * computation path could drift from the one the solver actually used.
   */
  readonly stiffness: Matrix6;
  /** Axial, shear and bending forces at both ends, in local axes. */
  readonly endForces: ElementEndForces;
  /**
   * The span load acting on this member, resolved into its local axes, or
   * null when it carries none.
   *
   * Carried on the result rather than looked up from the model again because
   * everything downstream — the diagrams, the deflected shape, the report —
   * needs the LOCAL intensities, and resolving them twice is one more place
   * for the rotation to be applied with the wrong sign.
   */
  readonly spanLoad: LocalSpanLoad | null;
  /**
   * The fixed-end force vector used for this member, in local axes.
   *
   * Zero when the member carries no span load. Exposed because it is half of
   * the superposition — `endForces.local` already has it added in — and the
   * step-by-step viewer shows both halves.
   */
  readonly fixedEndForces: Vec6;
  /**
   * Axial stress sigma = N / A, positive in tension.
   *
   * Only the axial part. Bending stress would need the section modulus
   * (sigma = M*c/I), and the model carries no fibre distance c, so reporting
   * a single "stress" number for a frame member would be misleading.
   */
  readonly axialStress: number;
  readonly state: AxialState;
}

/**
 * What a global degree of freedom corresponds to.
 *
 * Exposed so the interface can label the rows and columns of a matrix without
 * re-deriving the base-1 to base-0 mapping that `dof.ts` owns.
 */
export interface DofDescriptor {
  readonly index: DofIndex;
  readonly node: NodeId;
  readonly component: DofComponent;
}

/** A nodal displacement: two translations and a rotation. */
export interface NodalDisplacement {
  readonly node: NodeId;
  /** Translation along global X. */
  readonly ux: number;
  /** Translation along global Y. */
  readonly uy: number;
  /** Rotation about Z, in radians, positive counter-clockwise. */
  readonly rz: number;
}

/** A support reaction: two forces and a moment. */
export interface NodalReaction {
  readonly node: NodeId;
  /** Reaction force along global X. */
  readonly fx: number;
  /** Reaction force along global Y. */
  readonly fy: number;
  /** Reaction moment about Z. Non-zero only where the rotation is restrained. */
  readonly mz: number;
}

/** The complete solution of the system. */
export interface FrameSolution {
  /** Global stiffness matrix K, of size 3n x 3n. */
  readonly globalStiffness: Matrix;
  /** Global displacement vector U, length 3n, in DOF order. */
  readonly displacements: readonly number[];
  /** Global force vector F = K*U, length 3n, in DOF order. */
  readonly forces: readonly number[];
  /** Reactions, reported only at restrained DOFs. */
  readonly reactions: readonly NodalReaction[];
  /** Displacements grouped by node, for the UI. */
  readonly nodalDisplacements: readonly NodalDisplacement[];
  readonly elements: readonly ElementResult[];
  /** Every global DOF in order, with the node and component it belongs to. */
  readonly dofs: readonly DofDescriptor[];
  /** Indices of the DOFs that were solved for, i.e. the unrestrained ones. */
  readonly freeDofs: readonly DofIndex[];
  /**
   * K_ff: the submatrix that was actually factorized, of size
   * freeDofs.length. Its rows and columns follow `freeDofs`.
   */
  readonly reducedStiffness: Matrix;
}
