import { describe, it, expect } from 'vitest';
import {
  arcadeSpeedUpdate,
  headingTo,
  nextWaypoint,
  type WaypointGraphLite,
} from '../../src/systems/TrafficLogic';

const buildGraph = (links: Record<string, string[]>): WaypointGraphLite => {
  const nodes = new Map<string, { id: string; position: { x: number; z: number }; links: string[] }>();
  for (const id of Object.keys(links)) {
    nodes.set(id, { id, position: { x: 0, z: 0 }, links: links[id] });
  }
  return { nodes };
};

describe('TrafficLogic.nextWaypoint', () => {
  it('avoids backtracking when other neighbors exist', () => {
    const g = buildGraph({ a: ['b'], b: ['a', 'c'], c: ['b'] });
    const b = g.nodes.get('b')!;
    const next = nextWaypoint(g, b, 'a', () => 0);
    expect(next.id).toBe('c');
  });

  it('falls back to the only link when forced', () => {
    const g = buildGraph({ a: ['b'], b: ['a'] });
    const b = g.nodes.get('b')!;
    expect(nextWaypoint(g, b, 'a', () => 0).id).toBe('a');
  });

  it('returns self when isolated', () => {
    const g = buildGraph({ a: [] });
    const a = g.nodes.get('a')!;
    expect(nextWaypoint(g, a, null, () => 0)).toBe(a);
  });
});

describe('TrafficLogic.headingTo', () => {
  it('zero when target equals origin', () => {
    expect(headingTo({ x: 1, z: 1 }, { x: 1, z: 1 })).toBe(0);
  });
  it('points north (+z) → 0', () => {
    expect(headingTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0, 5);
  });
  it('points east (+x) → π/2', () => {
    expect(headingTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe('TrafficLogic.arcadeSpeedUpdate', () => {
  it('caps to cruise speed when accelerating', () => {
    let s = 0;
    for (let i = 0; i < 1000; i++) s = arcadeSpeedUpdate(s, 1, 0, 0.05, 14, 6, 30);
    expect(s).toBeCloseTo(14, 5);
  });
  it('decelerates fast when braking', () => {
    expect(arcadeSpeedUpdate(14, 0, 1, 0.5, 14, 6, 30)).toBe(0);
  });
  it('drags down to zero when no input', () => {
    let s = 14;
    for (let i = 0; i < 200; i++) s = arcadeSpeedUpdate(s, 0, 0, 0.5, 14, 6, 30);
    expect(s).toBeCloseTo(0, 5);
  });
});
