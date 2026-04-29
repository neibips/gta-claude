import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Weapon, type WeaponConfigEntry } from '../entities/Weapon';
import { AssetLoader } from '../core/AssetLoader';
import type { Player } from '../entities/Player';
import { GameConfig } from '../config/GameConfig';
import weaponConfigJson from '../config/WeaponConfig.json';

export type DamageTarget = {
  takeDamage(amount: number, source: 'player' | 'police' | 'world'): void;
  position(): Vector3;
  isDead(): boolean;
  /** Optional ID for source identification. */
  id?: string;
  /** Optional: queue an impulse to apply at death (used for ragdoll launch). */
  queueDeathImpulse?: (impulse: Vector3) => void;
};

export type WeaponHitListener = (
  target: DamageTarget | null,
  amount: number,
  weaponId: string
) => void;

export class WeaponSystem {
  readonly weapons: Weapon[] = [];
  active: Weapon | null = null;
  private hitListeners: WeaponHitListener[] = [];
  private targets: DamageTarget[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly loader: AssetLoader,
    private readonly player: Player
  ) {
    const cfg = weaponConfigJson as { weapons: WeaponConfigEntry[] };
    for (const w of cfg.weapons) this.weapons.push(new Weapon(w));
  }

  async load(): Promise<void> {
    for (const w of this.weapons) await w.load(this.scene, this.loader);
    this.equipSlot(1);
  }

  setTargets(t: DamageTarget[]): void {
    this.targets = t;
  }

  onHit(fn: WeaponHitListener): void {
    this.hitListeners.push(fn);
  }

  equipSlot(slot: number): void {
    const next = this.weapons.find((w) => w.cfg.slot === slot);
    if (!next || next === this.active) return;
    if (this.active) this.active.detach();
    this.active = next;
    if (next.cfg.assetPath && this.player.visualRoot) {
      next.attach(
        this.player.rightHandBone,
        this.player.visualRoot as unknown as AbstractMesh
      );
    }
  }

  tryFire(): boolean {
    if (!this.active || this.player.state !== 'alive') return false;
    const now = performance.now();
    if (!this.active.canFire(now)) return false;

    const cam = this.player.camera;
    const fwd = cam.getForwardRay().direction.clone();
    fwd.normalize();
    const origin = this.player.position().add(new Vector3(0, 1.4, 0));

    if (this.active.cfg.id === 'fists') {
      this.player.playPunch();
      this.meleeHit();
    } else if (this.active.cfg.id === 'rpg') {
      this.fireExplosive(origin, fwd);
    } else if (this.active.cfg.id === 'water_gun') {
      this.fireRaycast(origin, fwd, true);
      this.spawnWaterStream(origin, fwd);
    } else {
      this.fireRaycast(origin, fwd, false);
      this.spawnMuzzleFlash(origin, fwd);
      this.spawnTracer(origin, fwd, this.active.cfg.range);
    }
    this.active.registerFire(now);
    return true;
  }

  /** Per-weapon impulse magnitude applied on lethal hits. */
  private impulseFor(weaponId: string): number {
    switch (weaponId) {
      case 'fists': return 12;
      case 'water_gun': return 6;
      case 'ak47': return 18;
      case 'rpg': return 35;
      default: return 12;
    }
  }

  private meleeHit(): void {
    const w = this.active!;
    const origin = this.player.position();
    const fwd = this.player.camera.getForwardRay().direction.clone();
    fwd.y = 0;
    fwd.normalize();
    let best: DamageTarget | null = null;
    let bestD = w.cfg.range * w.cfg.range;
    for (const t of this.targets) {
      if (t.isDead()) continue;
      const d = Vector3.DistanceSquared(t.position(), origin);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      const dir = best.position().subtract(origin);
      dir.y = 0;
      if (dir.lengthSquared() > 1e-4) dir.normalize(); else dir.copyFrom(fwd);
      // Queue impulse BEFORE takeDamage — toppleOver consumes it inside takeDamage.
      best.queueDeathImpulse?.(new Vector3(dir.x * this.impulseFor(w.cfg.id), this.impulseFor(w.cfg.id) * 0.45, dir.z * this.impulseFor(w.cfg.id)));
      best.takeDamage(w.cfg.damage, 'player');
      this.notifyHit(best, w.cfg.damage, w.cfg.id);
    }
  }

  private fireRaycast(origin: Vector3, fwd: Vector3, isWater: boolean): void {
    const w = this.active!;
    const ray = new Ray(origin, fwd, w.cfg.range);
    const hits = this.scene.multiPickWithRay(ray, (m) => this.isShootable(m as Mesh));
    let nearestTarget: DamageTarget | null = null;
    let nearestDist = Infinity;
    if (hits) {
      for (const hit of hits) {
        if (!hit.pickedMesh || !hit.pickedPoint) continue;
        // Hit a target?
        const pickedKind = (hit.pickedMesh.metadata as { kind?: string } | null)?.kind;
        const dist = Vector3.Distance(origin, hit.pickedPoint);
        if (pickedKind === 'npc' || pickedKind === 'police') {
          const id = (hit.pickedMesh.metadata as { id?: string } | null)?.id ?? '';
          const target = this.targets.find((t) => t.id === id) ?? null;
          if (target && !target.isDead() && dist < nearestDist) {
            nearestDist = dist;
            nearestTarget = target;
          }
        } else if (pickedKind === 'building' || pickedKind === 'tree') {
          // wall blocks the bullet
          break;
        }
      }
    }
    if (nearestTarget) {
      // Queue directional impulse along the bullet direction before applying
      // damage so toppleOver inside takeDamage uses the directional kick.
      const force = this.impulseFor(w.cfg.id);
      nearestTarget.queueDeathImpulse?.(
        new Vector3(fwd.x * force, force * 0.45, fwd.z * force)
      );
      nearestTarget.takeDamage(w.cfg.damage, 'player');
      this.notifyHit(nearestTarget, w.cfg.damage, w.cfg.id);
      // Slow effect for water gun
      if (isWater) {
        const tt = nearestTarget as DamageTarget & { applySlow?: (factor: number, ms: number) => void };
        tt.applySlow?.(0.5, 1500);
      }
    } else {
      this.notifyHit(null, 0, w.cfg.id);
    }
  }

  private fireExplosive(origin: Vector3, fwd: Vector3): void {
    // Cast a ray to find impact, then apply AoE damage at hit point.
    const w = this.active!;
    const ray = new Ray(origin, fwd, w.cfg.range);
    const hit = this.scene.pickWithRay(ray, (m) => this.isShootable(m as Mesh));
    const impact = hit?.pickedPoint ?? origin.add(fwd.scale(w.cfg.range));
    this.spawnExplosion(impact);
    const r2 = GameConfig.weapons.rpgExplosionRadius * GameConfig.weapons.rpgExplosionRadius;
    for (const t of this.targets) {
      if (t.isDead()) continue;
      const d2 = Vector3.DistanceSquared(t.position(), impact);
      if (d2 <= r2) {
        // Falloff
        const d = Math.sqrt(d2);
        const falloff = 1 - d / GameConfig.weapons.rpgExplosionRadius;
        const dmg = Math.max(20, w.cfg.damage * falloff);
        // Radial outward impulse from the impact point.
        const radial = t.position().subtract(impact);
        radial.y = 0;
        if (radial.lengthSquared() > 1e-4) radial.normalize();
        else radial.set(fwd.x, 0, fwd.z);
        const force = this.impulseFor(w.cfg.id) * Math.max(0.5, falloff);
        t.queueDeathImpulse?.(
          new Vector3(radial.x * force, force * 0.6, radial.z * force)
        );
        t.takeDamage(dmg, 'player');
        this.notifyHit(t, dmg, w.cfg.id);
      }
    }
    // Knockback to player (recoil)
    const ply = this.player.root;
    ply.position.subtractInPlace(fwd.scale(0.3));
  }

  private isShootable(m: Mesh): boolean {
    const kind = (m.metadata as { kind?: string } | null)?.kind;
    return (
      kind === 'building' ||
      kind === 'tree' ||
      kind === 'npc' ||
      kind === 'police' ||
      kind === 'vehicle' ||
      kind === 'ground'
    );
  }

  private notifyHit(t: DamageTarget | null, dmg: number, id: string): void {
    for (const fn of this.hitListeners) fn(t, dmg, id);
  }

  // ─── Effects ────────────────────────────────────────────────────────────────
  private spawnMuzzleFlash(origin: Vector3, fwd: Vector3): void {
    const m = MeshBuilder.CreateSphere('mflash', { diameter: 0.4 }, this.scene);
    m.position = origin.add(fwd.scale(0.3));
    const mat = new StandardMaterial('mflashm', this.scene);
    mat.emissiveColor = new Color3(1, 0.8, 0.2);
    mat.disableLighting = true;
    m.material = mat;
    setTimeout(() => m.dispose(), 60);
  }

  private spawnTracer(origin: Vector3, fwd: Vector3, range: number): void {
    const path = [origin.clone(), origin.add(fwd.scale(range))];
    const tube = MeshBuilder.CreateLines('tracer', { points: path }, this.scene);
    tube.color = new Color3(1, 0.95, 0.2) as unknown as Color3;
    setTimeout(() => tube.dispose(), 40);
  }

  private spawnWaterStream(origin: Vector3, fwd: Vector3): void {
    const ps = new ParticleSystem('water', 50, this.scene);
    ps.particleTexture = new Texture(
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="white"/></svg>',
      this.scene
    );
    ps.emitter = origin.clone();
    ps.color1 = new Color4(0.4, 0.7, 1.0, 1);
    ps.color2 = new Color4(0.2, 0.5, 1.0, 1);
    ps.minSize = 0.05;
    ps.maxSize = 0.12;
    ps.minLifeTime = 0.2;
    ps.maxLifeTime = 0.4;
    ps.emitRate = 200;
    ps.direction1 = fwd.scale(8);
    ps.direction2 = fwd.scale(10);
    ps.start();
    setTimeout(() => {
      ps.stop();
      setTimeout(() => ps.dispose(), 500);
    }, 100);
  }

  private spawnExplosion(at: Vector3): void {
    const ps = new ParticleSystem('expl', 200, this.scene);
    ps.particleTexture = new Texture(
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14" fill="white"/></svg>',
      this.scene
    );
    ps.emitter = at.clone();
    ps.color1 = new Color4(1, 0.6, 0.1, 1);
    ps.color2 = new Color4(0.8, 0.2, 0.05, 1);
    ps.colorDead = new Color4(0.2, 0.2, 0.2, 0);
    ps.minSize = 0.5;
    ps.maxSize = 2.0;
    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 0.8;
    ps.emitRate = 600;
    ps.direction1 = new Vector3(-3, 3, -3);
    ps.direction2 = new Vector3(3, 6, 3);
    ps.gravity = new Vector3(0, -3, 0);
    ps.start();
    setTimeout(() => ps.stop(), 250);
    setTimeout(() => ps.dispose(), 1500);

    // Sphere flash
    const sphere = MeshBuilder.CreateSphere('explsph', { diameter: 1 }, this.scene);
    sphere.position = at.clone();
    const sm = new StandardMaterial('explspm', this.scene);
    sm.emissiveColor = new Color3(1, 0.5, 0.1);
    sm.disableLighting = true;
    sphere.material = sm;
    let s = 1;
    const t0 = performance.now();
    const obs = this.scene.onBeforeRenderObservable.add(() => {
      const dt = (performance.now() - t0) / 300;
      s = 1 + dt * 6;
      sphere.scaling.set(s, s, s);
      (sm as StandardMaterial).alpha = Math.max(0, 1 - dt);
      if (dt > 1) {
        sphere.dispose();
        this.scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }
}
