/**
 * Tests for the adapter between the flat table rows the interface edits and
 * the three separate collections the engine consumes.
 *
 * These functions are where a frame's third degree of freedom is easiest to
 * drop on the floor: a rotation restraint that never reaches `supports`, or a
 * moment that survives one keystroke and vanishes on the next, would produce a
 * model that solves cleanly and answers the wrong question.
 */

import { describe, expect, it } from 'vitest';

import { writeLoad, writeSupport } from '../../src/hooks/useFrameModel';
import type { NodalLoad, Support } from '../../src/types/frame';

describe('writeLoad', () => {
  it('creates a load entry carrying all three components', () => {
    const loads = writeLoad([], 1, { fx: 10, fy: -5, mz: 3 });
    expect(loads).toEqual([{ node: 1, fx: 10, fy: -5, mz: 3 }]);
  });

  it('keeps the moment when only a force is edited', () => {
    const existing: NodalLoad[] = [{ node: 1, fx: 0, fy: 0, mz: 12 }];
    expect(writeLoad(existing, 1, { fx: 7 })).toEqual([{ node: 1, fx: 7, fy: 0, mz: 12 }]);
  });

  it('keeps the forces when only the moment is edited', () => {
    const existing: NodalLoad[] = [{ node: 1, fx: 4, fy: -9, mz: 0 }];
    expect(writeLoad(existing, 1, { mz: -6 })).toEqual([{ node: 1, fx: 4, fy: -9, mz: -6 }]);
  });

  it('collapses several entries on one node into their resultant', () => {
    const existing: NodalLoad[] = [
      { node: 1, fx: 3, fy: 1, mz: 2 },
      { node: 1, fx: 4, fy: 1, mz: 5 },
    ];
    expect(writeLoad(existing, 1, { fy: 10 })).toEqual([{ node: 1, fx: 7, fy: 10, mz: 7 }]);
  });

  it('drops an entry only when all three components are zero', () => {
    const existing: NodalLoad[] = [{ node: 1, fx: 0, fy: 0, mz: 5 }];
    // A load with only a moment must survive: it is a perfectly ordinary way
    // to load a frame, and dropping it would silently delete the user's input.
    expect(writeLoad(existing, 1, { fx: 0 })).toHaveLength(1);
    expect(writeLoad(existing, 1, { mz: 0 })).toHaveLength(0);
  });

  it('leaves loads on other nodes untouched', () => {
    const existing: NodalLoad[] = [{ node: 2, fx: 1, fy: 2, mz: 3 }];
    const loads = writeLoad(existing, 1, { fx: 9 });
    expect(loads).toContainEqual({ node: 2, fx: 1, fy: 2, mz: 3 });
    expect(loads).toHaveLength(2);
  });
});

describe('writeSupport', () => {
  it('records the rotational restraint that makes a support fixed', () => {
    const supports = writeSupport([], 1, { restrainX: true, restrainY: true, restrainRz: true });
    expect(supports).toEqual([
      { node: 1, restrainX: true, restrainY: true, restrainRz: true },
    ]);
  });

  it('distinguishes a pinned support from a fixed one', () => {
    const pinned = writeSupport([], 1, { restrainX: true, restrainY: true });
    expect(pinned[0]!.restrainRz).toBe(false);
  });

  it('keeps the other two flags when one checkbox is toggled', () => {
    const existing: Support[] = [
      { node: 1, restrainX: true, restrainY: true, restrainRz: false },
    ];
    expect(writeSupport(existing, 1, { restrainRz: true })[0]).toEqual({
      node: 1,
      restrainX: true,
      restrainY: true,
      restrainRz: true,
    });
  });

  it('keeps a support that restrains only the rotation', () => {
    // A guided support: unusual, but legal, and the engine handles it. The
    // entry must not be dropped just because no translation is held.
    const supports = writeSupport([], 1, { restrainRz: true });
    expect(supports).toHaveLength(1);
    expect(supports[0]!.restrainRz).toBe(true);
  });

  it('drops the support only when it restrains nothing at all', () => {
    const existing: Support[] = [
      { node: 1, restrainX: true, restrainY: false, restrainRz: false },
    ];
    expect(writeSupport(existing, 1, { restrainX: false })).toHaveLength(0);
  });

  it('preserves a settlement declared by a preset', () => {
    const existing: Support[] = [
      {
        node: 1,
        restrainX: true,
        restrainY: true,
        restrainRz: false,
        settlement: { dy: -0.01, rz: 0.002 },
      },
    ];
    const updated = writeSupport(existing, 1, { restrainRz: true })[0]!;
    expect(updated.settlement).toEqual({ dy: -0.01, rz: 0.002 });
  });
});
