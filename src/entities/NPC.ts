import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { GameConfig } from '../config/GameConfig';
import { AssetLoader, ASSET_INDEX } from '../core/AssetLoader';
import {
  AnimController,
  buildRetargetMap,
  retargetAnimationGroup,
  type AnimSet,
} from '../systems/AnimationSystem';
import type { WaypointGraph, Waypoint } from '../world/WaypointGraph';
import type { DamageTarget } from '../systems/WeaponSystem';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';

export type NPCState = 'WALKING' | 'FLEEING' | 'DEAD';

type CrowdAgent = { id?: string; position(): Vector3; isDead(): boolean };

let nextNPCId = 0;

export class NPC implements DamageTarget {
  /** Set externally each tick to all alive NPCs + police for separation steering. */
  static neighbors: CrowdAgent[] = [];
  readonly id: string;
  readonly root: Mesh;
  hp = 50;
  state: NPCState = 'WALKING';
  private speed = GameConfig.npc.walkSpeed;
  private slowFactor = 1.0;
  private slowUntil = 0;
  private currentWP: Waypoint | null = null;
  private prevWPId: string | null = null;
  private fleeFrom: Vector3 | null = null;
  private anim: AnimController | null = null;
  private deadAt = 0;
  /** when ragdoll-ish body should be cleaned up (set externally) */
  diedAtMs = 0;
  body: PhysicsBody | null = null;
  private pendingDeathImpulse: Vector3 | null = null;
  onDeath?: (npc: NPC, weaponSourceIsPlayer: boolean) => void;

  constructor(private readonly scene: Scene, private readonly graph: WaypointGraph) {
    this.id = `npc_${nextNPCId++}`;
    this.root = MeshBuilder.CreateBox(this.id, { width: 0.6, depth: 0.4, height: 1.7 }, scene);
    const mat = new StandardMaterial(`mat_${this.id}`, scene);
    mat.diffuseColor = new Color3(Math.random(), Math.random(), Math.random());
    this.root.material = mat;
    this.root.checkCollisions = true;
    this.root.metadata = { kind: 'npc', id: this.id };
    this.root.rotationQuaternion = Quaternion.Identity();
    this.tryEnablePhysics();
  }

  private tryEnablePhysics(): void {
    if (!this.scene.getPhysicsEngine()) return;
    try {
      const agg = new PhysicsAggregate(
        this.root,
        PhysicsShapeType.BOX,
        { mass: 60, friction: 0.6, restitution: 0 },
        this.scene
      );
      const body = agg.body;
      body.disablePreStep = false;
      // Lock rotation while alive — AI controls facing via mesh quaternion.
      body.setMassProperties({ mass: 60, inertia: new Vector3(0, 0, 0) });
      this.body = body;
    } catch (e) {
      console.warn('[NPC] physics enable failed', e);
    }
  }

  async loadVisual(loader: AssetLoader): Promise<void> {
    const variant = ASSET_INDEX.npc[Math.floor(Math.random() * ASSET_INDEX.npc.length)];
    try {
      const rig = await loader.loadModel(variant.rig);
      const r = rig.rootMesh;
      r.parent = this.root;
      r.position.set(0, -0.85, 0);
      (this.root.material as StandardMaterial).alpha = 0;

      const skeleton: Skeleton | null =
        (r as AbstractMesh).skeleton ??
        rig.meshes.find((m) => (m as AbstractMesh).skeleton)?.skeleton ??
        null;
      const targetMap = buildRetargetMap(r as unknown as TransformNode, skeleton);

      const loadAnim = async (url: string, name: string) => {
        try {
          const container = await loader.loadContainer(url);
          const src = container.animationGroups[0] ?? null;
          const retargeted = src
            ? retargetAnimationGroup(src, targetMap, this.scene, `${this.id}_${name}`)
            : null;
          container.dispose();
          return retargeted;
        } catch (e) {
          console.warn(`[NPC] anim load failed ${url}`, e);
          return null;
        }
      };

      const animSet: AnimSet = {};
      const [walkA, runA] = await Promise.all([
        variant.walk ? loadAnim(variant.walk, 'walk') : Promise.resolve(null),
        variant.run ? loadAnim(variant.run, 'run') : Promise.resolve(null),
      ]);
      if (walkA) animSet.walk = walkA;
      if (runA) animSet.run = runA;
      this.anim = new AnimController(animSet);
      this.anim.play('walk');
    } catch (e) {
      console.warn('[NPC] visual load failed', e);
    }
  }

  spawn(at: Vector3): void {
    this.root.position.set(at.x, 0.85, at.z);
    if (this.body) this.body.setLinearVelocity(Vector3.Zero());
    this.currentWP = this.graph.nearest(this.root.position);
  }

  // ─── DamageTarget ────────────────────────────────────────────────────────
  position(): Vector3 {
    return this.root.position;
  }
  isDead(): boolean {
    return this.state === 'DEAD';
  }
  takeDamage(amount: number, source: 'player' | 'police' | 'world'): void {
    if (this.state === 'DEAD') return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'DEAD';
      this.deadAt = performance.now();
      this.diedAtMs = this.deadAt;
      this.onDeath?.(this, source === 'player');
      this.toppleOver();
    }
  }
  /** Queue an impulse to apply when this NPC dies, instead of the random one. */
  queueDeathImpulse(impulse: Vector3): void {
    this.pendingDeathImpulse = impulse.clone();
  }
  applySlow(factor: number, ms: number): void {
    this.slowFactor = factor;
    this.slowUntil = performance.now() + ms;
  }

  reactToGunshot(origin: Vector3): void {
    if (this.state !== 'WALKING') return;
    if (Vector3.Distance(origin, this.root.position) > GameConfig.npc.fleeTriggerRadius) return;
    this.state = 'FLEEING';
    this.fleeFrom = origin.clone();
    this.anim?.play('run');
  }

  private toppleOver(): void {
    this.anim?.stopAll();
    if (this.body) {
      // Lighter than police so NPCs fly farther per-impulse.
      this.body.setMassProperties({ mass: 30, inertia: new Vector3(2, 2, 2) });
      // Caller-supplied impulses are treated as ~m/s; scale by mass.
      const NPC_MASS = 30;
      const impulse =
        this.pendingDeathImpulse?.scale(NPC_MASS) ??
        (() => {
          const angle = Math.random() * Math.PI * 2;
          return new Vector3(Math.cos(angle) * 6 * NPC_MASS, 4 * NPC_MASS, Math.sin(angle) * 6 * NPC_MASS);
        })();
      const at = this.root.getAbsolutePosition().add(new Vector3(0, 0.6, 0));
      this.body.applyImpulse(impulse, at);
      this.body.setAngularVelocity(new Vector3(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 12,
      ));
      this.pendingDeathImpulse = null;
    } else {
      // Pure visual topple
      const start = this.root.rotationQuaternion ?? Quaternion.Identity();
      const end = Quaternion.RotationAxis(new Vector3(1, 0, 0), Math.PI / 2).multiply(start);
      const t0 = performance.now();
      const obs = this.scene.onBeforeRenderObservable.add(() => {
        const t = Math.min(1, (performance.now() - t0) / 500);
        this.root.rotationQuaternion = Quaternion.Slerp(start, end, t);
        this.root.position.y = Math.max(0.2, 0.85 - t * 0.65);
        if (t >= 1) this.scene.onBeforeRenderObservable.remove(obs);
      });
    }
  }

  update(dt: number): void {
    if (this.state === 'DEAD') return;

    const now = performance.now();
    if (now > this.slowUntil) this.slowFactor = 1.0;

    let target: Vector3;
    let speed = this.speed * this.slowFactor;

    if (this.state === 'FLEEING') {
      speed = GameConfig.npc.walkSpeed * GameConfig.npc.fleeSpeedMul * this.slowFactor;
      // Flee away from the gunshot origin
      const away = this.root.position.subtract(this.fleeFrom ?? this.root.position);
      away.y = 0;
      const len = away.length();
      if (len < 1) {
        away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      } else {
        away.scaleInPlace(1 / len);
      }
      target = this.root.position.add(away.scale(8));
    } else {
      if (!this.currentWP) this.currentWP = this.graph.nearest(this.root.position);
      const wp = this.currentWP;
      const d2 = Vector3.DistanceSquared(this.root.position, wp.position);
      if (d2 < 1.0) {
        const next = this.graph.next(wp, this.prevWPId);
        this.prevWPId = wp.id;
        this.currentWP = next;
      }
      target = this.currentWP.position;
    }

    const dir = target.subtract(this.root.position);
    dir.y = 0;
    const dlen = dir.length();
    if (dlen > 1e-3) dir.scaleInPlace(1 / dlen);

    // Separation steering: push away from nearby agents so NPCs flow around
    // each other instead of jamming up where waypoints meet.
    const SEP_RADIUS = 1.8;
    let sepX = 0, sepZ = 0, sepN = 0;
    const px = this.root.position.x, pz = this.root.position.z;
    for (const o of NPC.neighbors) {
      if (o.isDead()) continue;
      if (o.id === this.id) continue;
      const op = o.position();
      const dx = px - op.x, dz = pz - op.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1e-4 || d2 > SEP_RADIUS * SEP_RADIUS) continue;
      const d = Math.sqrt(d2);
      const w = (SEP_RADIUS - d) / SEP_RADIUS;
      sepX += (dx / d) * w;
      sepZ += (dz / d) * w;
      sepN++;
    }
    if (sepN > 0) {
      dir.x += sepX * 1.6;
      dir.z += sepZ * 1.6;
      const nl = Math.hypot(dir.x, dir.z);
      if (nl > 1e-3) {
        dir.x /= nl;
        dir.z /= nl;
      }
    }

    if (dlen > 1e-3 || sepN > 0) {
      if (this.body) {
        const v = this.body.getLinearVelocity();
        this.body.setLinearVelocity(new Vector3(dir.x * speed, v.y, dir.z * speed));
      } else {
        const step = Math.min(dlen, speed * dt);
        this.root.position.x += dir.x * step;
        this.root.position.z += dir.z * step;
      }
      // Face direction
      const yaw = Math.atan2(dir.x, dir.z);
      const cur = this.root.rotationQuaternion ?? Quaternion.Identity();
      const tgt = Quaternion.RotationAxis(Vector3.Up(), yaw);
      this.root.rotationQuaternion = Quaternion.Slerp(cur, tgt, Math.min(1, dt * 8));
    } else if (this.body) {
      const v = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vector3(0, v.y, 0));
    }

    if (this.anim) {
      if (this.state === 'FLEEING') this.anim.play('run');
      else this.anim.play('walk');
    }

    // Auto-end FLEEING after 6s if outside trigger range
    if (this.state === 'FLEEING' && this.fleeFrom) {
      if (Vector3.Distance(this.root.position, this.fleeFrom) > GameConfig.npc.fleeTriggerRadius * 1.5) {
        this.state = 'WALKING';
        this.fleeFrom = null;
      }
    }
  }

  dispose(): void {
    this.body?.dispose();
    this.body = null;
    this.root.dispose();
  }
}
