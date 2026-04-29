import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MapValidator } from '../../src/world/MapValidator';

const realMap = JSON.parse(
  readFileSync(resolve(__dirname, '../../assets/maps/city-map.json'), 'utf8')
);

describe('MapValidator', () => {
  it('passes the real generated map', () => {
    const errs = MapValidator.validate(realMap);
    expect(errs).toEqual([]);
  });

  it('rejects unsupported version', () => {
    const m = { ...realMap, version: 99 };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects wrong size', () => {
    const m = { ...realMap, size: { width: 100, height: 100 } };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('200x200'))).toBe(true);
  });

  it('rejects missing roads', () => {
    const m = { ...realMap, roads: [] };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e === 'no roads')).toBe(true);
  });

  it('requires police_station building', () => {
    const m = {
      ...realMap,
      buildings: realMap.buildings.map((b: { type: string }) =>
        b.type === 'police_station' ? { ...b, type: 'office' } : b
      ),
    };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('police_station'))).toBe(true);
  });

  it('requires 8..12 trees', () => {
    const m = { ...realMap, trees: realMap.trees.slice(0, 3) };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('trees count'))).toBe(true);
  });

  it('rejects waypoints with broken links', () => {
    const m = {
      ...realMap,
      npcWaypoints: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, links: ['ghost'], type: 'npc' },
      ],
    };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('missing'))).toBe(true);
  });

  it('rejects empty spawn arrays', () => {
    const m = { ...realMap, spawnPoints: { ...realMap.spawnPoints, npc: [] } };
    const errs = MapValidator.validate(m);
    expect(errs.some((e) => e.includes('npc'))).toBe(true);
  });

  it('rejects missing root object', () => {
    expect(MapValidator.validate(null).length).toBeGreaterThan(0);
    expect(MapValidator.validate(42).length).toBeGreaterThan(0);
  });
});
