// Pure logic for spawn caps & corpse cleanup. SpawnManager delegates here.

export type SpawnLimits = {
  max: number;
  intervalMs: number;
  corpseLimit: number;
};

export class SpawnLogic {
  private lastSpawnAt = -Infinity;
  constructor(private readonly limits: SpawnLimits) {}

  /** Should we spawn one more right now? */
  canSpawn(activeCount: number, now: number): boolean {
    if (activeCount >= this.limits.max) return false;
    if (now - this.lastSpawnAt < this.limits.intervalMs) return false;
    return true;
  }

  registerSpawn(now: number): void {
    this.lastSpawnAt = now;
  }

  /** Returns the indices of corpses to dispose, oldest first. */
  pruneCorpses<T extends { diedAtMs: number }>(corpses: readonly T[]): number[] {
    const overflow = corpses.length - this.limits.corpseLimit;
    if (overflow <= 0) return [];
    return Array.from({ length: overflow }, (_, i) => i);
  }
}
