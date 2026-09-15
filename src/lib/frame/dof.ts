/**
 * Degree-of-freedom mapping: the only place in the engine that converts
 * between one-based node numbering and zero-based array indices.
 *
 * A plane frame node carries THREE degrees of freedom, so the DOFs of node i
 * are, one-based, rows/columns 3i-2, 3i-1 and 3i. Translated to zero-based:
 *
 *     one-based            zero-based
 *     u  of node i  ->  3i - 2  ->  3i - 3  =  3 * (i - 1)
 *     v  of node i  ->  3i - 1  ->  3i - 2  =  3 * (i - 1) + 1
 *     rz of node i  ->  3i      ->  3i - 1  =  3 * (i - 1) + 2
 *
 * Confining this arithmetic to a single module with its own tests is what
 * prevents the most common off-by-one bug of the method — and the stride
 * change from 2 to 3 is exactly the kind of edit that would scatter that bug
 * across a dozen files if the arithmetic lived anywhere else.
 *
 * This module also does NOT assume node identifiers run 1..n consecutively:
 * if the user deletes node 2 and the model is left with nodes 1, 3 and 4,
 * the mapping stays correct because it keys off each node's POSITION in the
 * model rather than its identifier. When identifiers do run 1..n
 * consecutively, the mapping reduces exactly to the formula above (verified
 * by tests).
 */

import type {
  DofComponent,
  DofIndex,
  ElementDofs,
  FrameNode,
  NodeId,
} from '../../types/frame';
import { FrameError } from './errors';

/** DOFs per node in a plane frame: two translations and one rotation. */
export const DOFS_PER_NODE = 3;

/** The three components of a node, in the order they occupy in the system. */
const COMPONENTS: readonly DofComponent[] = ['x', 'y', 'rz'];

/** Maps a node's zero-based position to its three global DOFs. */
export interface DofMap {
  /** Number of nodes in the model. */
  readonly nodeCount: number;
  /** Size of the global system: 3n. */
  readonly size: number;
  /** Zero-based position of the node within the model. */
  ordinalOf(node: NodeId): number;
  /** Zero-based global DOF index of one component of a node. */
  dofOf(node: NodeId, component: DofComponent): DofIndex;
  /** The three DOFs of a node, ordered [x, y, rz]. */
  nodeDofs(node: NodeId): readonly [DofIndex, DofIndex, DofIndex];
  /** An element's six DOFs, ordered [u_i, v_i, rz_i, u_j, v_j, rz_j]. */
  elementDofs(from: NodeId, to: NodeId): ElementDofs;
  /** Inverse mapping: which node and component a global DOF belongs to. */
  describe(dof: DofIndex): { readonly node: NodeId; readonly component: DofComponent };
}

/**
 * Builds the DOF mapping for a set of nodes.
 *
 * @throws FrameError INVALID_NODE_ID when an identifier is not an integer >= 1.
 * @throws FrameError DUPLICATE_NODE_ID when two nodes share an identifier.
 */
export function createDofMap(nodes: readonly FrameNode[]): DofMap {
  const ordinalByNode = new Map<NodeId, number>();
  const nodeByOrdinal: NodeId[] = [];

  nodes.forEach((node, ordinal) => {
    if (!Number.isInteger(node.id) || node.id < 1) {
      throw new FrameError(
        'INVALID_NODE_ID',
        `Node identifiers must be integers greater than or equal to 1 (received ${node.id}).`,
      );
    }
    if (ordinalByNode.has(node.id)) {
      throw new FrameError('DUPLICATE_NODE_ID', `Node ${node.id} is defined more than once.`);
    }
    ordinalByNode.set(node.id, ordinal);
    nodeByOrdinal.push(node.id);
  });

  const nodeCount = nodes.length;
  const size = nodeCount * DOFS_PER_NODE;

  function ordinalOf(node: NodeId): number {
    const ordinal = ordinalByNode.get(node);
    if (ordinal === undefined) {
      throw new FrameError('UNKNOWN_NODE', `Node ${node} does not exist in the model.`);
    }
    return ordinal;
  }

  function nodeDofs(node: NodeId): readonly [DofIndex, DofIndex, DofIndex] {
    const base = ordinalOf(node) * DOFS_PER_NODE;
    return [base, base + 1, base + 2];
  }

  return {
    nodeCount,
    size,
    ordinalOf,
    nodeDofs,
    dofOf(node, component) {
      const base = ordinalOf(node) * DOFS_PER_NODE;
      return base + COMPONENTS.indexOf(component);
    },
    elementDofs(from, to) {
      const [fromX, fromY, fromRz] = nodeDofs(from);
      const [toX, toY, toRz] = nodeDofs(to);
      return [fromX, fromY, fromRz, toX, toY, toRz];
    },
    describe(dof) {
      if (!Number.isInteger(dof) || dof < 0 || dof >= size) {
        throw new FrameError(
          'UNKNOWN_NODE',
          `Degree of freedom ${dof} is outside the range [0, ${size - 1}].`,
        );
      }
      const ordinal = Math.floor(dof / DOFS_PER_NODE);
      return {
        node: nodeByOrdinal[ordinal] as NodeId,
        component: COMPONENTS[dof % DOFS_PER_NODE] as DofComponent,
      };
    },
  };
}

/**
 * The textbook formula, translated to zero-based indices.
 *
 * Kept only as documentation and for parity tests. The engine itself uses
 * `DofMap`, which additionally tolerates non-consecutive identifiers.
 *
 * @param i One-based number of node i.
 * @param j One-based number of node j.
 */
export function sequentialElementDofs(i: NodeId, j: NodeId): ElementDofs {
  return [3 * i - 3, 3 * i - 2, 3 * i - 1, 3 * j - 3, 3 * j - 2, 3 * j - 1];
}
