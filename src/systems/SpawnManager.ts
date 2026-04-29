import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { NPC } from '../entities/NPC';
import { Policeman } from '../entities/Policeman';
import { GameConfig } from '../config/GameConfig';
import type { AssetLoader } from '../core/AssetLoader';
import type { WaypointGraph } from '../world/WaypointGraph';
import type { CoverPoint } from '../world/CoverPointGenerator';
import type { Player } from '../entities/Player';

export type SpawnedNPC = NPC;
export type SpawnedPolice = Policeman;

export class SpawnManager {
  readonly npcs: NPC[] = [];
  readonly police: Policeman[] = [];
  private corpses: NPC[] = [];
  private policeCorpses: Policeman[] = [];
  private lastNPCSpawn = 0;
  desiredPolice = 0;

  constructor(
    private readonly scene: Scene,
    private readonly loader: AssetLoader,
    private readonly graph: WaypointGraph,
    private readonly spawnPoints: { npc: Vector3[]; police: Vector3[] },
    private readonly coverPoints: CoverPoint[],
    private readonly player: Player
  ) {}

  /** Returns active (non-dead) NPCs. */
  aliveNPCs(): NPC[] {
    return this.npcs.filter((n) => !n.isDead());
  }
  alivePolice(): Policeman[] {
    return this.police.filter((p) => !p.isDead());
  }

  step(dtMs: number): void {
    const now = performance.now();
    if (now - this.lastNPCSpawn >= GameConfig.npc.spawnIntervalMs && this.npcs.length - this.corpses.length < GameConfig.npc.max) {
      this.spawnNPC();
      this.lastNPCSpawn = now;
    }
    // Move dead NPCs to corpse list
    for (const n of this.npcs) {
      if (n.isDead() && !this.corpses.includes(n)) this.corpses.push(n);
    }
    while (this.corpses.length > GameConfig.npc.corpseLimit) {
      const oldest = this.corpses.shift();
      if (!oldest) break;
      const i = this.npcs.indexOf(oldest);
      if (i >= 0) this.npcs.splice(i, 1);
      oldest.dispose();
    }
    // Adjust police count to match desired
    let aliveP = this.alivePolice().length;
    while (aliveP + this.spawnedPoliceQueue() < this.desiredPolice && this.policeAvailable()) {
      this.spawnPoliceman();
      aliveP++;
    }
    // Police corpse cleanup
    for (const p of this.police) {
      if (p.isDead() && !this.policeCorpses.includes(p)) this.policeCorpses.push(p);
    }
    while (this.policeCorpses.length > GameConfig.npc.corpseLimit) {
      const oldest = this.policeCorpses.shift();
      if (!oldest) break;
      const i = this.police.indexOf(oldest);
      if (i >= 0) this.police.splice(i, 1);
      oldest.dispose();
    }
    void dtMs;
  }

  private spawnedPoliceQueue(): number {
    return 0;
  }
  private policeAvailable(): boolean {
    return this.spawnPoints.police.length > 0;
  }

  private spawnNPC(at?: Vector3): void {
    const point = at ?? this.pickDistributedSpawn();
    const npc = new NPC(this.scene, this.graph);
    npc.spawn(point);
    npc.loadVisual(this.loader);
    this.npcs.push(npc);
  }

  /** Pick a spawn position far from existing alive NPCs to spread them out. */
  private pickDistributedSpawn(): Vector3 {
    const candidates: Vector3[] = [];
    if (this.spawnPoints.npc.length > 0) candidates.push(...this.spawnPoints.npc);
    // Augment with waypoint positions so distribution covers the whole graph
    for (const w of this.graph.nodeArr) candidates.push(w.position);

    const alive = this.aliveNPCs();
    let best = candidates[Math.floor(Math.random() * candidates.length)];
    let bestScore = -Infinity;
    // Sample a handful and pick the one furthest from any existing NPC
    const samples = Math.min(12, candidates.length);
    for (let i = 0; i < samples; i++) {
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      let minD = Infinity;
      for (const n of alive) {
        const d = Vector3.DistanceSquared(c, n.root.position);
        if (d < minD) minD = d;
      }
      const score = alive.length === 0 ? Math.random() : minD;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  /** Pre-populate the world up to `max` NPCs spread across the map. */
  prespawnAll(): void {
    const target = GameConfig.npc.max;
    while (this.npcs.length < target) this.spawnNPC();
    this.lastNPCSpawn = performance.now();
  }

  spawnPoliceman(): Policeman {
    const at = this.spawnPoints.police[Math.floor(Math.random() * this.spawnPoints.police.length)];
    const p = new Policeman(this.scene, this.coverPoints, this.player);
    p.spawn(at);
    p.loadVisual(this.loader);
    this.police.push(p);
    return p;
  }

  notifyGunshot(at: Vector3): void {
    for (const n of this.aliveNPCs()) n.reactToGunshot(at);
  }

  setDesiredPolice(n: number): void {
    this.desiredPolice = n;
  }
}
