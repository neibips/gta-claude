import { GameConfig } from '../config/GameConfig';

export type WantedListener = (level: number) => void;

const POLICE_PER_STAR = [0, 1, 2, 4, 6, 8] as const;

export class WantedSystem {
  private level = 0;
  private lastIncreaseAt = 0;
  private listeners: WantedListener[] = [];
  private now: () => number;

  constructor(clock: () => number = () => Date.now()) {
    this.now = clock;
  }

  /** Returns 0..5. */
  getLevel(): number {
    return this.level;
  }

  policeForLevel(level = this.level): number {
    return POLICE_PER_STAR[Math.min(level, GameConfig.wanted.max)];
  }

  onChange(fn: WantedListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private notify() {
    for (const fn of this.listeners) fn(this.level);
  }

  /** Player killed an NPC */
  onNPCKilled(): void {
    this.bump(GameConfig.wanted.npcKillDelta);
  }
  /** Player killed a policeman */
  onPoliceKilled(): void {
    this.bump(GameConfig.wanted.policeKillDelta);
  }
  /** Reset on player death */
  onPlayerDied(): void {
    if (this.level === 0) return;
    this.level = 0;
    this.lastIncreaseAt = 0;
    this.notify();
  }

  private bump(amount: number): void {
    const prev = this.level;
    this.level = Math.min(GameConfig.wanted.max, this.level + amount);
    this.lastIncreaseAt = this.now();
    if (prev !== this.level) this.notify();
  }

  /** Called every tick. dtMs unused; just compares clocks. */
  update(): void {
    if (this.level === 0) return;
    const now = this.now();
    if (now - this.lastIncreaseAt >= GameConfig.wanted.decayIntervalMs) {
      this.level = Math.max(0, this.level - 1);
      this.lastIncreaseAt = now;
      this.notify();
    }
  }
}
