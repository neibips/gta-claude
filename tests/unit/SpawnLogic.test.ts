import { describe, it, expect } from 'vitest';
import { SpawnLogic } from '../../src/systems/SpawnLogic';

describe('SpawnLogic', () => {
  it('refuses to spawn beyond the cap', () => {
    const sl = new SpawnLogic({ max: 20, intervalMs: 1000, corpseLimit: 10 });
    expect(sl.canSpawn(20, 100_000)).toBe(false);
    expect(sl.canSpawn(19, 100_000)).toBe(true);
  });

  it('respects spawn interval cooldown', () => {
    const sl = new SpawnLogic({ max: 20, intervalMs: 8000, corpseLimit: 10 });
    expect(sl.canSpawn(0, 0)).toBe(true);
    sl.registerSpawn(0);
    expect(sl.canSpawn(0, 1000)).toBe(false);
    expect(sl.canSpawn(0, 7999)).toBe(false);
    expect(sl.canSpawn(0, 8001)).toBe(true);
  });

  it('prunes oldest corpses when over the limit', () => {
    const sl = new SpawnLogic({ max: 20, intervalMs: 1000, corpseLimit: 10 });
    const corpses = Array.from({ length: 13 }, (_, i) => ({ diedAtMs: i * 100 }));
    const idx = sl.pruneCorpses(corpses);
    expect(idx).toEqual([0, 1, 2]);
  });

  it('returns empty array when within the limit', () => {
    const sl = new SpawnLogic({ max: 20, intervalMs: 1000, corpseLimit: 10 });
    const corpses = Array.from({ length: 5 }, () => ({ diedAtMs: 0 }));
    expect(sl.pruneCorpses(corpses)).toEqual([]);
  });
});
