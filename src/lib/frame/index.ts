/**
 * Public entry point of the plane frame engine.
 *
 * `solveFrame` runs the six steps of the Direct Stiffness Method end to end:
 *   1. Discretization comes in as the model itself.
 *   2. Element stiffness matrices  -> element.ts
 *   3. Global assembly             -> assembly.ts
 *   4. Boundary conditions         -> solver.ts
 *   5. Solving the system          -> solver.ts
 *   6. Post-processing             -> postprocess.ts
 *
 * The whole module is pure TypeScript: no React, no DOM, no I/O. It can run
 * in the browser, in Node or in a test runner without changes.
 */

import type { FrameModel, FrameSolution } from '../../types/frame';
import { assembleGlobalStiffness } from './assembly';
import {
  computeElementResults,
  computeGlobalForces,
  describeDofs,
  extractNodalDisplacements,
  extractReactions,
} from './postprocess';
import { buildLoadVector, partitionDofs, solveDisplacements } from './solver';
import { validateModel } from './validation';

/**
 * Solves a plane frame model.
 *
 * @throws FrameError with a stable `code` on any invalid or unsolvable
 * model. The UI maps that code to a Spanish message; it must not display
 * `error.message`, which is written for developers.
 */
export function solveFrame(model: FrameModel): FrameSolution {
  validateModel(model);

  const { globalStiffness, dofMap, elements } = assembleGlobalStiffness(model);

  // `elements` carries each member's equivalent nodal loads, so span loads
  // reach the system here rather than being silently dropped.
  const loadVector = buildLoadVector(model, dofMap, elements);
  const partition = partitionDofs(model, dofMap);
  const { displacements, reducedStiffness } = solveDisplacements(
    globalStiffness,
    loadVector,
    partition,
  );

  const forces = computeGlobalForces(globalStiffness, displacements);

  return {
    globalStiffness,
    displacements,
    forces,
    reactions: extractReactions(forces, loadVector, partition, dofMap),
    nodalDisplacements: extractNodalDisplacements(displacements, model, dofMap),
    elements: computeElementResults(model, displacements, dofMap, elements),
    dofs: describeDofs(dofMap),
    freeDofs: partition.free,
    reducedStiffness,
  };
}

export {
  assembleGlobalStiffness,
  planeFrameAssemble,
  scatterElementStiffness,
  zeroMatrix,
} from './assembly';
export type { AssembledElement, AssembledSystem } from './assembly';
export { createDofMap, sequentialElementDofs, DOFS_PER_NODE } from './dof';
export type { DofMap } from './dof';
export {
  elementEndForces,
  elementEndForcesFromGeometry,
  elementStiffness,
  elementStiffnessFromGeometry,
  elementTransformation,
  elementTransformationFromGeometry,
  equivalentNodalLoads,
  fixedEndForces,
  localStiffness,
  resolveSpanLoad,
  NO_FIXED_END_FORCES,
} from './element';
export { FrameError } from './errors';
export type { FrameErrorCode } from './errors';
export {
  degToRad,
  directionCosines,
  elementGeometry,
  elementLength,
  normalizeAngleDeg,
  normalizeAngleRad,
  radToDeg,
} from './geometry';
export {
  classifyAxialState,
  classifyDistributedLoad,
  computeElementResults,
  computeGlobalForces,
  describeDofs,
  elementDisplacementVector,
  extractNodalDisplacements,
  extractReactions,
  internalForcesAt,
  shearZeroStations,
} from './postprocess';
export {
  buildLoadVector,
  multiplyMatrixVector,
  partitionDofs,
  solveDisplacements,
  solveLinearSystem,
  submatrix,
} from './solver';
export type { DofPartition } from './solver';
export { validateModel } from './validation';
