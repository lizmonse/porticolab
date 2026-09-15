/**
 * Model validation, run before anything is assembled.
 *
 * Every check here exists to turn a would-be NaN, a silently wrong number or
 * a confusing downstream failure into a precise error the UI can explain.
 */

import type { FrameModel } from '../../types/frame';
import { assertFinite, assertPositiveFinite, FrameError } from './errors';

/**
 * Validates a model's structural consistency.
 *
 * Does not check solvability: an insufficiently supported structure is
 * detected by the solver, which is the only stage that can tell a mechanism
 * from a stable structure.
 *
 * @throws FrameError on the first problem found.
 */
export function validateModel(model: FrameModel): void {
  if (model.nodes.length === 0) {
    throw new FrameError('EMPTY_MODEL', 'The model has no nodes.');
  }
  if (model.elements.length === 0) {
    throw new FrameError('EMPTY_MODEL', 'The model has no elements.');
  }

  const knownNodes = new Set<number>();
  for (const node of model.nodes) {
    assertFinite(node.x, `Coordinate x of node ${node.id}`);
    assertFinite(node.y, `Coordinate y of node ${node.id}`);
    knownNodes.add(node.id);
  }

  const seenElementIds = new Set<number>();
  for (const element of model.elements) {
    if (seenElementIds.has(element.id)) {
      throw new FrameError(
        'DUPLICATE_NODE_ID',
        `Element ${element.id} is defined more than once.`,
      );
    }
    seenElementIds.add(element.id);

    requireNode(knownNodes, element.from, `Element ${element.id}`);
    requireNode(knownNodes, element.to, `Element ${element.id}`);

    if (element.from === element.to) {
      throw new FrameError(
        'SELF_CONNECTED_ELEMENT',
        `Element ${element.id} connects node ${element.from} to itself.`,
      );
    }

    assertPositiveFinite(element.E, `Young's modulus E of element ${element.id}`, 'INVALID_MATERIAL');
    assertPositiveFinite(element.A, `Area A of element ${element.id}`, 'INVALID_MATERIAL');
    // Separate code from E and A: a missing or zero I is the mistake a user
    // porting a truss model makes, and it deserves its own message rather
    // than one about "material properties".
    assertPositiveFinite(
      element.I,
      `Second moment of area I of element ${element.id}`,
      'INVALID_SECTION',
    );
  }

  for (const load of model.loads) {
    requireNode(knownNodes, load.node, 'A load');
    assertFinite(load.fx, `Component fx of the load on node ${load.node}`);
    assertFinite(load.fy, `Component fy of the load on node ${load.node}`);
    assertFinite(load.mz, `Moment mz of the load on node ${load.node}`);
  }

  // Span loads are checked against the element ids gathered above, not
  // against the node ids: a distributed load names a member, and pointing it
  // at a node that happens to share the number is the mistake worth catching.
  for (const load of model.distributedLoads ?? []) {
    if (!seenElementIds.has(load.element)) {
      throw new FrameError(
        'UNKNOWN_ELEMENT',
        `Distributed load ${load.id} references element ${load.element}, which does not exist.`,
      );
    }
    assertFinite(load.wxI, `Intensity wxI of distributed load ${load.id}`);
    assertFinite(load.wyI, `Intensity wyI of distributed load ${load.id}`);
    assertFinite(load.wxJ, `Intensity wxJ of distributed load ${load.id}`);
    assertFinite(load.wyJ, `Intensity wyJ of distributed load ${load.id}`);
  }

  for (const support of model.supports) {
    requireNode(knownNodes, support.node, 'A support');
    if (support.settlement?.dx !== undefined) {
      assertFinite(support.settlement.dx, `Settlement dx of node ${support.node}`);
    }
    if (support.settlement?.dy !== undefined) {
      assertFinite(support.settlement.dy, `Settlement dy of node ${support.node}`);
    }
    if (support.settlement?.rz !== undefined) {
      assertFinite(support.settlement.rz, `Imposed rotation rz of node ${support.node}`);
    }
  }
}

/** Throws unless `node` is present in the model. */
function requireNode(knownNodes: ReadonlySet<number>, node: number, owner: string): void {
  if (!knownNodes.has(node)) {
    throw new FrameError('UNKNOWN_NODE', `${owner} references node ${node}, which does not exist.`);
  }
}
