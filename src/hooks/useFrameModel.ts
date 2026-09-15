/**
 * Reactive state for the plane frame model.
 *
 * The interface presents one row per node holding its coordinates, its load
 * and its restraints together. The engine keeps those as three separate
 * collections, because a load and a support are genuinely different things to
 * a solver. This hook is the adapter: it exposes the unified row the tables
 * want while writing into the shape the engine expects, so the validated
 * engine needs no changes at all.
 *
 * Every mutation returns a brand-new `FrameModel` object, never a mutated one,
 * so the solver hook can rely on reference identity to decide whether the
 * results on screen are still current.
 *
 * Invariants owned here, so the engine never has to defend against
 * UI-shaped inconsistency:
 *   - node identifiers are unique and monotonically assigned;
 *   - deleting a node cascades to the elements, loads and supports that
 *     reference it, instead of leaving dangling references;
 *   - at most one load entry and one support entry exist per node;
 *   - a load of (0, 0, 0) and a support restraining nothing are dropped
 *     rather than stored as no-op entries.
 */

import { useCallback, useMemo, useState } from 'react';

import type {
  DistributedLoad,
  FrameElement,
  FrameModel,
  NodalLoad,
  NodeId,
  Support,
} from '../types/frame';

/** Default section for newly created members: steel, in engine units. */
export const DEFAULT_E = 210e6; // 210 GPa, in kN/m^2
export const DEFAULT_A = 5.38e-3; // 5380 mm^2
/**
 * 8356 cm^4, in m^4.
 *
 * A default of zero would be worse than useless: the model would be rejected
 * on the first solve with an INVALID_SECTION error the user did not cause. A
 * real rolled section is the honest starting point, and it is the property
 * most likely to be edited anyway.
 */
export const DEFAULT_I = 8.356e-5;

/** An empty model, the starting point of a blank session. */
const EMPTY_MODEL: FrameModel = { nodes: [], elements: [], supports: [], loads: [] };

/**
 * One row of the "Nodos, cargas y apoyos" table: everything about a node,
 * flattened from the three engine collections.
 */
export interface NodeRow {
  readonly id: NodeId;
  readonly x: number;
  readonly y: number;
  readonly fx: number;
  readonly fy: number;
  /** Concentrated moment about Z, positive counter-clockwise. */
  readonly mz: number;
  readonly restrainX: boolean;
  readonly restrainY: boolean;
  /** Restrains the rotation: this is what makes a support fixed, not pinned. */
  readonly restrainRz: boolean;
}

/** Fields of a node row the tables can write to. */
export type NodeRowChanges = Partial<Omit<NodeRow, 'id'>>;

/** Everything the interface needs to read and mutate the model. */
export interface FrameModelStore {
  readonly model: FrameModel;
  /** The unified per-node view the first table renders. */
  readonly nodeRows: readonly NodeRow[];

  addNode(): void;
  /** Writes any mix of coordinates, load components and restraints at once. */
  updateNodeRow(id: NodeId, changes: NodeRowChanges): void;
  removeNode(id: NodeId): void;

  addElement(): void;
  updateElement(id: number, changes: Partial<Omit<FrameElement, 'id'>>): void;
  removeElement(id: number): void;

  /** Adds a zero-intensity span load on the first element, ready to be typed into. */
  addDistributedLoad(): void;
  updateDistributedLoad(id: number, changes: Partial<Omit<DistributedLoad, 'id'>>): void;
  removeDistributedLoad(id: number): void;

  loadModel(model: FrameModel): void;
  reset(): void;
}

export function useFrameModel(initialModel: FrameModel = EMPTY_MODEL): FrameModelStore {
  const [model, setModel] = useState<FrameModel>(initialModel);

  const nodeRows = useMemo<NodeRow[]>(() => {
    const loadByNode = new Map<NodeId, { fx: number; fy: number; mz: number }>();
    for (const load of model.loads) {
      // Summed rather than overwritten: a model loaded from a preset may carry
      // several loads on one node, and the row must show the resultant instead
      // of silently hiding all but one of them.
      const current = loadByNode.get(load.node) ?? { fx: 0, fy: 0, mz: 0 };
      loadByNode.set(load.node, {
        fx: current.fx + load.fx,
        fy: current.fy + load.fy,
        mz: current.mz + load.mz,
      });
    }

    const supportByNode = new Map<NodeId, Support>(
      model.supports.map((support) => [support.node, support]),
    );

    return model.nodes.map((node) => {
      const load = loadByNode.get(node.id);
      const support = supportByNode.get(node.id);
      return {
        id: node.id,
        x: node.x,
        y: node.y,
        fx: load?.fx ?? 0,
        fy: load?.fy ?? 0,
        mz: load?.mz ?? 0,
        restrainX: support?.restrainX ?? false,
        restrainY: support?.restrainY ?? false,
        restrainRz: support?.restrainRz ?? false,
      };
    });
  }, [model]);

  const addNode = useCallback(() => {
    setModel((current) => {
      const id = nextId(current.nodes.map((node) => node.id));
      // Offset each new node so two of them never land on top of each other,
      // which would make any bar between them a zero-length element.
      const previous = current.nodes[current.nodes.length - 1];
      const x = previous === undefined ? 0 : previous.x + 1;
      return { ...current, nodes: [...current.nodes, { id, x, y: 0 }] };
    });
  }, []);

  const updateNodeRow = useCallback((id: NodeId, changes: NodeRowChanges) => {
    setModel((current) => {
      let next = current;

      if (changes.x !== undefined || changes.y !== undefined) {
        next = {
          ...next,
          nodes: next.nodes.map((node) =>
            node.id === id
              ? { ...node, x: changes.x ?? node.x, y: changes.y ?? node.y }
              : node,
          ),
        };
      }

      if (changes.fx !== undefined || changes.fy !== undefined || changes.mz !== undefined) {
        next = { ...next, loads: writeLoad(next.loads, id, changes) };
      }

      if (
        changes.restrainX !== undefined ||
        changes.restrainY !== undefined ||
        changes.restrainRz !== undefined
      ) {
        next = { ...next, supports: writeSupport(next.supports, id, changes) };
      }

      return next;
    });
  }, []);

  const removeNode = useCallback((id: NodeId) => {
    // Cascade: anything referencing the node goes with it. Leaving dangling
    // references would make the engine throw UNKNOWN_NODE on every keystroke.
    setModel((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      elements: current.elements.filter((element) => element.from !== id && element.to !== id),
      supports: current.supports.filter((support) => support.node !== id),
      loads: current.loads.filter((load) => load.node !== id),
    }));
  }, []);

  const addElement = useCallback(() => {
    setModel((current) => {
      if (current.nodes.length < 2) return current;
      const id = nextId(current.elements.map((element) => element.id));
      const [first, second] = current.nodes;
      return {
        ...current,
        elements: [
          ...current.elements,
          { id, from: first!.id, to: second!.id, E: DEFAULT_E, A: DEFAULT_A, I: DEFAULT_I },
        ],
      };
    });
  }, []);

  const updateElement = useCallback((id: number, changes: Partial<Omit<FrameElement, 'id'>>) => {
    setModel((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === id ? { ...element, ...changes } : element,
      ),
    }));
  }, []);

  const removeElement = useCallback((id: number) => {
    // Cascade, for the same reason removing a node does: a span load pointing
    // at a deleted member throws UNKNOWN_ELEMENT on the next keystroke.
    setModel((current) => ({
      ...current,
      elements: current.elements.filter((element) => element.id !== id),
      distributedLoads: (current.distributedLoads ?? []).filter((load) => load.element !== id),
    }));
  }, []);

  const addDistributedLoad = useCallback(() => {
    setModel((current) => {
      const [first] = current.elements;
      if (first === undefined) return current;
      const existing = current.distributedLoads ?? [];
      return {
        ...current,
        distributedLoads: [
          ...existing,
          {
            id: nextId(existing.map((load) => load.id)),
            element: first.id,
            wxI: 0,
            wyI: 0,
            wxJ: 0,
            wyJ: 0,
          },
        ],
      };
    });
  }, []);

  const updateDistributedLoad = useCallback(
    (id: number, changes: Partial<Omit<DistributedLoad, 'id'>>) => {
      setModel((current) => ({
        ...current,
        distributedLoads: (current.distributedLoads ?? []).map((load) =>
          load.id === id ? { ...load, ...changes } : load,
        ),
      }));
    },
    [],
  );

  const removeDistributedLoad = useCallback((id: number) => {
    setModel((current) => ({
      ...current,
      distributedLoads: (current.distributedLoads ?? []).filter((load) => load.id !== id),
    }));
  }, []);

  const loadModel = useCallback((next: FrameModel) => setModel(next), []);
  const reset = useCallback(() => setModel(EMPTY_MODEL), []);

  return {
    model,
    nodeRows,
    addNode,
    updateNodeRow,
    removeNode,
    addElement,
    updateElement,
    removeElement,
    addDistributedLoad,
    updateDistributedLoad,
    removeDistributedLoad,
    loadModel,
    reset,
  };
}

// ---------------------------------------------------------------------------

/**
 * Replaces every load on a node with a single resultant entry.
 *
 * Collapsing to one entry is what keeps the table's single Fx/Fy/Mz row
 * honest: the row shows the sum, so writing back anything but one entry would
 * make the next read disagree with what the user just typed.
 */
export function writeLoad(
  loads: readonly NodalLoad[],
  node: NodeId,
  changes: NodeRowChanges,
): NodalLoad[] {
  const existing = loads
    .filter((load) => load.node === node)
    .reduce(
      (sum, load) => ({ fx: sum.fx + load.fx, fy: sum.fy + load.fy, mz: sum.mz + load.mz }),
      { fx: 0, fy: 0, mz: 0 },
    );

  const fx = changes.fx ?? existing.fx;
  const fy = changes.fy ?? existing.fy;
  const mz = changes.mz ?? existing.mz;

  const others = loads.filter((load) => load.node !== node);
  // A zero load is dropped rather than stored: it changes nothing for the
  // solver and would otherwise accumulate one dead entry per node visited.
  return fx === 0 && fy === 0 && mz === 0 ? others : [...others, { node, fx, fy, mz }];
}

/** Replaces the support on a node, dropping it when it restrains nothing. */
export function writeSupport(
  supports: readonly Support[],
  node: NodeId,
  changes: NodeRowChanges,
): Support[] {
  const existing = supports.find((support) => support.node === node);

  const restrainX = changes.restrainX ?? existing?.restrainX ?? false;
  const restrainY = changes.restrainY ?? existing?.restrainY ?? false;
  const restrainRz = changes.restrainRz ?? existing?.restrainRz ?? false;

  const others = supports.filter((support) => support.node !== node);
  if (!restrainX && !restrainY && !restrainRz) return others;

  return [
    ...others,
    {
      node,
      restrainX,
      restrainY,
      restrainRz,
      // Settlements are no longer editable in the interface but the engine
      // still supports them, so a value coming from a preset survives an edit
      // to the restraint checkboxes instead of being silently discarded.
      ...(existing?.settlement !== undefined ? { settlement: existing.settlement } : {}),
      ...(existing?.inclinationDeg !== undefined
        ? { inclinationDeg: existing.inclinationDeg }
        : {}),
    },
  ];
}

/** Next free identifier: one past the highest in use, never reusing a gap. */
function nextId(existing: readonly number[]): number {
  return existing.reduce((max, id) => Math.max(max, id), 0) + 1;
}
