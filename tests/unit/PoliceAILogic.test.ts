import { describe, it, expect } from 'vitest';
import { pickBestCover, allyCrossesLine, staggerOffset } from '../../src/systems/PoliceAILogic';

describe('PoliceAILogic.pickBestCover', () => {
  const player = { x: 0, z: 0 };

  it('picks the closest cover that is not on top of the player', () => {
    const candidates = [
      { id: 'c1', position: { x: 1, z: 0 }, occupiedBy: null }, // too close to player (< 6 units)
      { id: 'c2', position: { x: 8, z: 0 }, occupiedBy: null }, // good
      { id: 'c3', position: { x: 30, z: 0 }, occupiedBy: null }, // far
    ];
    const me = { x: 5, z: 0 };
    const choice = pickBestCover(candidates, 'self', me, player);
    expect(choice?.id).toBe('c2');
  });

  it('skips covers occupied by other police', () => {
    const candidates = [
      { id: 'c1', position: { x: 8, z: 0 }, occupiedBy: 'other' },
      { id: 'c2', position: { x: 12, z: 0 }, occupiedBy: null },
    ];
    expect(pickBestCover(candidates, 'self', { x: 5, z: 0 }, player)?.id).toBe('c2');
  });

  it('honors covers occupied by self', () => {
    const candidates = [
      { id: 'c1', position: { x: 8, z: 0 }, occupiedBy: 'self' },
      { id: 'c2', position: { x: 30, z: 0 }, occupiedBy: null },
    ];
    expect(pickBestCover(candidates, 'self', { x: 5, z: 0 }, player)?.id).toBe('c1');
  });

  it('returns null when nothing fits', () => {
    const candidates = [{ id: 'c1', position: { x: 1, z: 0 }, occupiedBy: null }];
    expect(pickBestCover(candidates, 'self', { x: 0, z: 0 }, player)).toBeNull();
  });
});

describe('PoliceAILogic.allyCrossesLine', () => {
  it('detects an ally on the firing line', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 10, z: 0 };
    const others = [{ x: 5, z: 0.1 }];
    expect(allyCrossesLine(from, to, others)).toBe(true);
  });
  it('ignores allies behind the shooter', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 10, z: 0 };
    const others = [{ x: -3, z: 0 }];
    expect(allyCrossesLine(from, to, others)).toBe(false);
  });
  it('ignores allies far off-axis', () => {
    const from = { x: 0, z: 0 };
    const to = { x: 10, z: 0 };
    const others = [{ x: 5, z: 4 }];
    expect(allyCrossesLine(from, to, others)).toBe(false);
  });
});

describe('PoliceAILogic.staggerOffset', () => {
  it('produces evenly distributed offsets', () => {
    const r = 5;
    const offsets = [0, 1, 2, 3].map((i) => staggerOffset(i, 4, r));
    for (const o of offsets) {
      const len = Math.hypot(o.x, o.z);
      expect(len).toBeCloseTo(r, 5);
    }
    // first two are at perpendicular angles
    expect(Math.abs(offsets[0].x - r)).toBeLessThan(1e-6);
    expect(Math.abs(offsets[1].z - r)).toBeLessThan(1e-6);
  });
});
