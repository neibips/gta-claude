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
    // Adjust police count to match desired (baseline patrol + wanted bonus).
    const baseline = GameConfig.police.patrolCount;
    const target = Math.max(this.desiredPolice, baseline);
    let aliveP = this.alivePolice().length;
    while (aliveP + this.spawnedPoliceQueue() < target && this.policeAvailable()) {
      // Anything beyond the patrol baseline is wanted-level escalation —
      // spawn behind the player so cops don't pop into view.
      const offscreen = aliveP >= baseline;
      this.spawnPoliceman({ offscreen });
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

  spawnPoliceman(opts: { offscreen?: boolean } = {}): Policeman {
    const at = this.pickPoliceSpawn(opts.offscreen ?? false);
    const p = new Policeman(this.scene, this.coverPoints, this.player);
    p.spawn(at);
    p.loadVisual(this.loader);
    this.police.push(p);
    return p;
  }

  /**
   * Pick a police spawn point. When `offscreen` is true (wanted-level escalation),
   * we prefer points behind the player (negative dot with camera forward) and
   * outside a min radius, falling back to the precinct points if no candidate
   * fits — so the scene stays populated even if camera is panned weirdly.
   */
  private pickPoliceSpawn(offscreen: boolean): Vector3 {
    const presets = this.spawnPoints.police;
    if (!offscreen) {
      return presets[Math.floor(Math.random() * presets.length)];
    }
    // Build a candidate pool: precinct presets + waypoints from sidewalk graph
    // (so escalation spawns can come from any street, not just the precinct).
    const pool: Vector3[] = [...presets];
    for (const w of this.graph.nodeArr) pool.push(w.position);

    const camFwd = this.player.camera ? this.player.camera.getForwardRay().direction.clone() : new Vector3(0, 0, 1);
    camFwd.y = 0;
    if (camFwd.lengthSquared() > 1e-3) camFwd.normalize();
    const playerPos = this.player.position();
    const minD = GameConfig.police.offscreenSpawnMinDist;
    const maxD = GameConfig.police.offscreenSpawnMaxDist;

    // Sample candidates — pick first that is behind the player and within range.
    const tries = Math.min(40, pool.length);
    for (let i = 0; i < tries; i++) {
      const c = pool[Math.floor(Math.random() * pool.length)];
      const d = Vector3.Distance(c, playerPos);
      if (d < minD || d > maxD) continue;
      const dx = c.x - playerPos.x;
      const dz = c.z - playerPos.z;
      const dot = dx * camFwd.x + dz * camFwd.z;
      if (dot >= 0) continue; // in front of camera — visible
      return c;
    }
    return presets[Math.floor(Math.random() * presets.length)];
  }

  notifyGunshot(at: Vector3): void {
    for (const n of this.aliveNPCs()) n.reactToGunshot(at);
  }

  setDesiredPolice(n: number): void {
    this.desiredPolice = n;
  }
}
