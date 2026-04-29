import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WantedSystem } from '../../src/systems/WantedSystem';

describe('WantedSystem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at level 0', () => {
    const w = new WantedSystem();
    expect(w.getLevel()).toBe(0);
    expect(w.policeForLevel(0)).toBe(0);
  });

  it('NPC kill bumps level by 1, capped at 5', () => {
    const w = new WantedSystem();
    for (let i = 0; i < 7; i++) w.onNPCKilled();
    expect(w.getLevel()).toBe(5);
  });

  it('police kill bumps level by 2', () => {
    const w = new WantedSystem();
    w.onPoliceKilled();
    expect(w.getLevel()).toBe(2);
  });

  it('player death resets level to 0', () => {
    const w = new WantedSystem();
    w.onNPCKilled();
    w.onNPCKilled();
    expect(w.getLevel()).toBe(2);
    w.onPlayerDied();
    expect(w.getLevel()).toBe(0);
  });

  it('police count maps correctly to stars', () => {
    const w = new WantedSystem();
    expect(w.policeForLevel(0)).toBe(0);
    expect(w.policeForLevel(1)).toBe(1);
    expect(w.policeForLevel(2)).toBe(2);
    expect(w.policeForLevel(3)).toBe(4);
    expect(w.policeForLevel(4)).toBe(6);
    expect(w.policeForLevel(5)).toBe(8);
  });

  it('decays one star after 30 seconds without violations', () => {
    const w = new WantedSystem();
    w.onNPCKilled();
    w.onNPCKilled();
    expect(w.getLevel()).toBe(2);
    vi.advanceTimersByTime(31_000);
    w.update();
    expect(w.getLevel()).toBe(1);
    vi.advanceTimersByTime(31_000);
    w.update();
    expect(w.getLevel()).toBe(0);
  });

  it('change listeners fire on level change', () => {
    const w = new WantedSystem();
    const events: number[] = [];
    w.onChange((lvl) => events.push(lvl));
    w.onNPCKilled();
    w.onNPCKilled();
    expect(events).toEqual([1, 2]);
    w.onPlayerDied();
    expect(events).toEqual([1, 2, 0]);
  });
});
