/**
 * The curved arrow that stands for an applied moment.
 *
 * Worth a test of its own because the mistake it can make is silent and
 * convincing: SVG measures arc sweeps in a Y-DOWN space, so the flag that
 * feels like "clockwise" draws counter-clockwise. An arrow turning the wrong
 * way is not a rendering glitch — it states the opposite sign convention from
 * the one the input table promises, and a reader would believe it.
 */

import { describe, expect, it } from 'vitest';

import { diagramLabelPlacement, momentArcPath } from '../../src/components/frame/FrameCanvas';

const CENTRE = { x: 100, y: 50 };
const RADIUS = 17;

/** Pulls the numbers out of "M x y A rx ry rot largeArc sweep x y". */
function parse(path: string) {
  const numbers = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  expect(numbers).toHaveLength(9);

  const [startX, startY, rx, ry, rotation, largeArc, sweep, endX, endY] = numbers as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { startX, startY, rx, ry, rotation, largeArc, sweep, endX, endY };
}

describe('momentArcPath', () => {
  it('draws a 270-degree arc of the expected radius', () => {
    const arc = parse(momentArcPath(CENTRE, true));

    expect(arc.rx).toBe(RADIUS);
    expect(arc.ry).toBe(RADIUS);
    // Both endpoints sit on the circle around the node.
    expect(Math.hypot(arc.startX - CENTRE.x, arc.startY - CENTRE.y)).toBeCloseTo(RADIUS, 1);
    expect(Math.hypot(arc.endX - CENTRE.x, arc.endY - CENTRE.y)).toBeCloseTo(RADIUS, 1);
    // A 270-degree span is the long way round.
    expect(arc.largeArc).toBe(1);
  });

  it('uses sweep 0 for a counter-clockwise moment, because SVG Y points down', () => {
    expect(parse(momentArcPath(CENTRE, true)).sweep).toBe(0);
    expect(parse(momentArcPath(CENTRE, false)).sweep).toBe(1);
  });

  it('mirrors the two directions about the horizontal axis', () => {
    // A positive and a negative moment of the same size are the same drawing,
    // reflected: same start abscissa, opposite ordinate offset.
    const counterClockwise = parse(momentArcPath(CENTRE, true));
    const clockwise = parse(momentArcPath(CENTRE, false));

    expect(counterClockwise.startX).toBeCloseTo(clockwise.startX, 6);
    expect(counterClockwise.startY - CENTRE.y).toBeCloseTo(
      -(clockwise.startY - CENTRE.y),
      6,
    );
  });
});

/**
 * Where a diagram's value label sits relative to its ordinate.
 *
 * The bug this guards against was found on the preloaded frame: at the pinned
 * base the moment is zero, so the "0.00" landed one gap-width from the joint —
 * and, anchored in the middle, grew straight back over the node marker. The
 * number was drawn, correctly placed by its own coordinate, and unreadable.
 *
 * A centred label is only safe when it is pushed far enough that half its own
 * width still clears whatever it was pushed away from, which is not something
 * the gap can guarantee for a six-character number. Anchoring by direction
 * removes the dependency on the text's width entirely.
 */
describe('diagramLabelPlacement', () => {
  it('anchors a leftward label at its right edge, so it grows away from the member', () => {
    const placement = diagramLabelPlacement({ x: -1, y: 0 });
    expect(placement.anchor).toBe('end');
    expect(placement.baseline).toBe('middle');
  });

  it('anchors a rightward label at its left edge', () => {
    expect(diagramLabelPlacement({ x: 1, y: 0 }).anchor).toBe('start');
  });

  it('hangs a downward label from its top edge rather than centring it', () => {
    const placement = diagramLabelPlacement({ x: 0, y: 1 });
    expect(placement.anchor).toBe('middle');
    expect(placement.baseline).toBe('hanging');
  });

  it('sits an upward label on its baseline, and gives it room for the node number', () => {
    // `NodeLayer` already prints the joint's id above the joint. A label going
    // the same way needs to clear it, or the two overlap and the halo of the
    // one drawn last erases the other.
    const up = diagramLabelPlacement({ x: 0, y: -1 });
    const down = diagramLabelPlacement({ x: 0, y: 1 });

    expect(up.baseline).toBe('auto');
    expect(up.gap).toBeGreaterThan(down.gap);
  });

  it('follows the dominant axis on a diagonal member', () => {
    // A member at 30 degrees pushes its labels mostly sideways, so they should
    // be anchored sideways too.
    expect(diagramLabelPlacement({ x: -0.87, y: -0.5 }).anchor).toBe('end');
    expect(diagramLabelPlacement({ x: -0.5, y: -0.87 }).anchor).toBe('middle');
  });
});
