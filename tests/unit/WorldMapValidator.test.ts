import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WorldMapValidator } from '../../src/world/WorldMapValidator';

const realMap = JSON.parse(
  readFileSync(resolve(__dirname, '../../assets/maps/city-map.json'), 'utf8')
);

describe('WorldMapValidator', () => {
  it('passes the real generated large world', () => {
    const errs = WorldMapValidator.validate(realMap);
    expect(errs).toEqual([]);
  });

  it('rejects unsupported version', () => {
    const m = { ...realMap, version: 1 };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('version'))).toBe(true);
  });

  it('rejects small maps', () => {
    const m = { ...realMap, size: { width: 200, height: 200 } };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('600x600'))).toBe(true);
  });

  it('requires the four major districts', () => {
    const m = { ...realMap, districts: realMap.districts.filter((d: { id: string }) => d.id !== 'field') };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('required district missing: field'))).toBe(true);
  });

  it('requires the visual GLB map metadata to be valid', () => {
    const m = {
      ...realMap,
      visualModel: { ...realMap.visualModel, modelPath: 'bad/path.glb' },
    };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('visualModel.modelPath'))).toBe(true);
  });

  it('rejects waypoints with broken links', () => {
    const m = {
      ...realMap,
      npcWaypoints: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, links: ['ghost'], type: 'npc' },
      ],
    };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('missing'))).toBe(true);
  });

  it('requires traffic waypoints to stay on authored roads', () => {
    const m = {
      ...realMap,
      trafficWaypoints: realMap.trafficWaypoints.map((w: Record<string, unknown>, i: number) =>
        i === 0 ? { ...w, position: { x: 290, y: 0, z: 290 } } : w
      ),
    };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('not on a road'))).toBe(true);
  });

  it('requires NPC waypoints to stay on authored sidewalks', () => {
    const m = {
      ...realMap,
      npcWaypoints: realMap.npcWaypoints.map((w: Record<string, unknown>, i: number) =>
        i === 0 ? { ...w, position: { x: 0, y: 0, z: 0 } } : w
      ),
    };
    const errs = WorldMapValidator.validate(m);
    expect(errs.some((e) => e.includes('not on a sidewalk'))).toBe(true);
  });

  it('rejects missing root object', () => {
    expect(WorldMapValidator.validate(null).length).toBeGreaterThan(0);
    expect(WorldMapValidator.validate(42).length).toBeGreaterThan(0);
  });
});
