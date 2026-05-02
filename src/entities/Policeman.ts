import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Bone } from '@babylonjs/core/Bones/bone';
import type { Observer } from '@babylonjs/core/Misc/observable';

import { AssetLoader, ASSET_INDEX } from '../core/AssetLoader';
import {
  attachWeaponModelToRightHand,
  type WeaponAttachmentOffsets,
  type WeaponConfigEntry,
} from './Weapon';
import {
  AnimController,
  buildRetargetMap,
  retargetAnimationGroup,
  type AnimSet,
} from '../systems/AnimationSystem';
import { GameConfig } from '../config/GameConfig';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { CoverPoint } from '../world/CoverPointGenerator';
import type { Player } from './Player';
import type { DamageTarget } from '../systems/WeaponSystem';
import weaponConfigJson from '../config/WeaponConfig.json';

export type PoliceState =
  | 'PATROL'
  | 'SEARCH'
  | 'CHASE'
  | 'TAKE_COVER'
  | 'FLANK'
  | 'ATTACK'
  | 'RETREAT'
  | 'DEAD';

let nextId = 0;
const STEP_PROBE_INTERVAL = 0.12;

const akConfig = (weaponConfigJson as { weapons: WeaponConfigEntry[] }).weapons.find(
  (w) => w.id === 'ak47'
);
const policeAkAttachment: WeaponAttachmentOffsets & { scale: number } = {
  positionOffset: akConfig?.positionOffset ?? { x: 0.05, y: -0.02, z: 0.18 },
  rotationOffset: akConfig?.rotationOffset ?? { x: 0, y: 1.5708, z: 0 },
  scale: akConfig?.scale ?? 1,
};

export class Policeman implements DamageTarget {
  readonly id: string;
  readonly root: Mesh;
  hp = GameConfig.police.hp;
  state: PoliceState = 'PATROL';
  private anim: AnimController | null = null;
  private currentCover: CoverPoint | null = null;
  private nextStateChangeAt = 0;
  private nextShotAt = 0;
  private moving = false;
  private deadAt = 0;
  diedAtMs = 0;
  body: PhysicsBody | null = null;
  private pendingDeathImpulse: Vector3 | null = null;
  private rightHandBone: Bone | null = null;
  private rightArmBone: Bone | null = null;
  private weaponRoot: TransformNode | null = null;
  private aiming = false;
  private aimObs: Observer<Scene> | null = null;
  private recoilUntil = 0;
  private stepProbeCooldown = Math.random() * STEP_PROBE_INTERVAL;

  /** Set externally to allow Policeman to attack the player. */
  onShootPlayer?: (dmg: number) => void;
  onDeath?: (p: Policeman) => void;

  constructor(
    private readonly scene: Scene,
    private readonly coverPoints: CoverPoint[],
    private readonly player: Player
  ) {
    this.id = `police_${nextId++}`;
    this.root = MeshBuilder.CreateBox(this.id, { width: 0.6, depth: 0.4, height: 1.7 }, scene);
    const m = new StandardMaterial(`mat_${this.id}`, scene);
    m.diffuseColor = new Color3(0.1, 0.18, 0.55);
    this.root.material = m;
    this.root.checkCollisions = true;
    this.root.metadata = { kind: 'police', id: this.id };
    this.root.rotationQuaternion = Quaternion.Identity();
    this.tryEnablePhysics();
  }

  private tryEnablePhysics(): void {
    if (!this.scene.getPhysicsEngine()) return;
    try {
      const agg = new PhysicsAggregate(
        this.root,
        PhysicsShapeType.BOX,
        { mass: 70, friction: 0.6, restitution: 0 },
        this.scene
      );
      const body = agg.body;
      body.disablePreStep = false;
      body.setMassProperties({ mass: 70, inertia: new Vector3(0, 0, 0) });
      this.body = body;
    } catch (e) {
      console.warn('[Policeman] physics enable failed', e);
    }
  }

  async loadVisual(loader: AssetLoader): Promise<void> {
    try {
      const rig = await loader.loadModel(ASSET_INDEX.policeman.rig);
      rig.rootMesh.parent = this.root;
      rig.rootMesh.position.set(0, -0.85, 0);
      (this.root.material as StandardMaterial).alpha = 0;

      const skeleton: Skeleton | null =
        (rig.rootMesh as AbstractMesh).skeleton ??
        rig.meshes.find((m) => (m as AbstractMesh).skeleton)?.skeleton ??
        null;

      if (skeleton) {
        const bones = skeleton.bones;
        const isFinger = (n: string) => /thumb|index|middle|ring|pinky|finger/i.test(n);
        this.rightHandBone =
          bones.find((b) => /^(mixamorig:?)?RightHand$/i.test(b.name)) ??
          bones.find((b) => /right.?hand|hand.?r|r_hand/i.test(b.name) && !isFinger(b.name)) ??
          null;
        this.rightArmBone =
          bones.find((b) => /right.?(upper)?.?arm|upperarm.?r/i.test(b.name)) ??
          bones.find((b) => /right.?shoulder|shoulder.?r/i.test(b.name)) ??
          this.rightHandBone;
      }

      // Attach AK-47 model to the right hand so the policeman visibly carries it.
      try {
        const gun = await loader.loadModel(ASSET_INDEX.guns.ak47);
        const gunRoot = gun.rootMesh as unknown as TransformNode;
        gunRoot.scaling.scaleInPlace(policeAkAttachment.scale);
        attachWeaponModelToRightHand(
          gunRoot,
          this.rightHandBone,
          rig.rootMesh as unknown as TransformNode,
          policeAkAttachment,
          gunRoot.scaling.clone()
        );
        this.weaponRoot = gunRoot as unknown as TransformNode;
      } catch (e) {
        console.warn('[Policeman] failed to load AK-47', e);
      }

      const targetMap = buildRetargetMap(rig.rootMesh as unknown as TransformNode, skeleton);

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
          console.warn(`[Policeman] anim load failed ${url}`, e);
          return null;
        }
      };

      const [walkA, runA] = await Promise.all([
        loadAnim(ASSET_INDEX.policeman.walk, 'walk'),
        loadAnim(ASSET_INDEX.policeman.run, 'run'),
      ]);
      const set: AnimSet = {};
      if (walkA) set.walk = walkA;
      if (runA) set.run = runA;
      this.anim = new AnimController(set);
      this.anim.play('walk');
    } catch (e) {
      console.warn('[Policeman] load failed', e);
    }
  }

  spawn(at: Vector3): void {
    const ray = new Ray(new Vector3(at.x, at.y + 50, at.z), new Vector3(0, -1, 0), 200);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string } | null)?.kind;
      return k === 'road' || k === 'sidewalk' || k === 'building' || k === 'ground' || k === 'terrain';
    });
    const groundY = hit?.pickedPoint?.y ?? at.y;
    this.root.position.set(at.x, groundY + 0.85 + 0.05, at.z);
    if (this.body) this.body.setLinearVelocity(Vector3.Zero());
  }

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
      this.onDeath?.(this);
      this.toppleOver();
    } else if (this.hp <= GameConfig.police.hp * 0.3) {
      this.state = 'RETREAT';
    }
    void source;
  }

  queueDeathImpulse(impulse: Vector3): void {
    this.pendingDeathImpulse = impulse.clone();
  }

  hasLineOfSight(): boolean {
    const from = this.root.position.add(new Vector3(0, 1.5, 0));
    const to = this.player.position().add(new Vector3(0, 1.2, 0));
    const dir = to.subtract(from);
    const dist = dir.length();
    if (dist > GameConfig.police.losMaxRange) return false;
    dir.scaleInPlace(1 / dist);
    const ray = new Ray(from, dir, dist);
    const hit = this.scene.pickWithRay(
      ray,
      (m) => {
        const k = (m.metadata as { kind?: string } | null)?.kind;
        // Buildings, trees and decorations block. Other police don't.
        return k === 'building' || k === 'tree' || k === 'decoration';
      }
    );
    return !hit?.pickedMesh;
  }

  setState(s: PoliceState): void {
    this.state = s;
    this.nextStateChangeAt = performance.now() + GameConfig.police.repositionIntervalMs;
  }

  private toppleOver(): void {
    this.setAiming(false);
    this.anim?.stopAll();
    if (this.body) {
      // Heavier than NPCs → same desired velocity needs more impulse, and the
      // ragdoll travels less per equivalent kick. Different feel on death.
      this.body.setMassProperties({ mass: 90, inertia: new Vector3(3, 3, 3) });
      const POLICE_MASS = 90;
      // Police ragdoll responds with 0.7x velocity vs NPC for the same caller
      // impulse — they're tougher and flop heavier rather than launching.
      const impulse =
        this.pendingDeathImpulse?.scale(POLICE_MASS * 0.7) ??
        (() => {
          const angle = Math.random() * Math.PI * 2;
          return new Vector3(Math.cos(angle) * 4 * POLICE_MASS, 3 * POLICE_MASS, Math.sin(angle) * 4 * POLICE_MASS);
        })();
      const at = this.root.getAbsolutePosition().add(new Vector3(0, 0.6, 0));
      this.body.applyImpulse(impulse, at);
      this.body.setAngularVelocity(new Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 8,
      ));
      this.pendingDeathImpulse = null;
      return;
    }
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

  pickCover(): CoverPoint | null {
    let best: CoverPoint | null = null;
    let bestScore = Infinity;
    const playerPos = this.player.position();
    for (const c of this.coverPoints) {
      if (c.occupiedBy && c.occupiedBy !== this.id) continue;
      // Cover is "good" if it's close to us AND close to player but not on top of player
      const distToMe = Vector3.DistanceSquared(c.position, this.root.position);
      const distToPlayer = Vector3.DistanceSquared(c.position, playerPos);
      if (distToPlayer < 36) continue; // too close
      const score = distToMe + distToPlayer * 0.4;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) {
      if (this.currentCover) this.currentCover.occupiedBy = null;
      best.occupiedBy = this.id;
      this.currentCover = best;
    }
    return best;
  }

  releaseCover(): void {
    if (this.currentCover) {
      this.currentCover.occupiedBy = null;
      this.currentCover = null;
    }
  }

  /** Returns true if reached. */
  moveTo(target: Vector3, speed: number, dt: number): boolean {
    const dir = target.subtract(this.root.position);
    dir.y = 0;
    const dist = dir.length();
    if (dist < 0.6) {
      this.moving = false;
      if (this.body) {
        const v = this.body.getLinearVelocity();
        this.body.setLinearVelocity(new Vector3(0, v.y, 0));
      }
      return true;
    }
    dir.scaleInPlace(1 / dist);
    if (this.body) {
      this.tryStepUp(dir.x, dir.z, dt);
      const v = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vector3(dir.x * speed, v.y, dir.z * speed));
    } else {
      const step = Math.min(dist, speed * dt);
      this.root.position.x += dir.x * step;
      this.root.position.z += dir.z * step;
    }
    const yaw = Math.atan2(dir.x, dir.z);
    const cur = this.root.rotationQuaternion ?? Quaternion.Identity();
    const tgt = Quaternion.RotationAxis(Vector3.Up(), yaw);
    this.root.rotationQuaternion = Quaternion.Slerp(cur, tgt, Math.min(1, dt * 8));
    this.moving = true;
    return false;
  }

  faceTarget(target: Vector3, dt: number): void {
    const dir = target.subtract(this.root.position);
    dir.y = 0;
    if (dir.lengthSquared() < 1e-3) return;
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    const cur = this.root.rotationQuaternion ?? Quaternion.Identity();
    const tgt = Quaternion.RotationAxis(Vector3.Up(), yaw);
    this.root.rotationQuaternion = Quaternion.Slerp(cur, tgt, Math.min(1, dt * 10));
  }

  canShoot(now: number): boolean {
    return now >= this.nextShotAt && !this.moving;
  }
  scheduleNextShot(now: number): void {
    this.nextShotAt = now + GameConfig.police.fireIntervalMs;
  }

  isStateExpired(now: number): boolean {
    return now >= this.nextStateChangeAt;
  }

  refreshTimer(): void {
    this.nextStateChangeAt = performance.now() + GameConfig.police.repositionIntervalMs;
  }

  playRunning(): void {
    if (this.aiming) this.setAiming(false);
    this.anim?.play('run');
  }
  playWalking(): void {
    if (this.aiming) this.setAiming(false);
    this.anim?.play('walk');
  }
  stopAnim(): void {
    this.anim?.stopAll();
  }

  /**
   * Aiming pose: stops walk/run animation and procedurally rotates the right
   * arm forward so the cop visibly aims his rifle instead of running in place
   * while shooting. `playShootRecoil` overlays a brief kick on top of this.
   */
  setAiming(on: boolean): void {
    if (on === this.aiming) return;
    this.aiming = on;
    if (on) {
      this.anim?.stopAll();
      const armNode = (this.rightArmBone ?? this.rightHandBone)?.getTransformNode?.();
      if (!armNode) return;
      const baseRot = armNode.rotationQuaternion?.clone() ?? Quaternion.Identity();
      this.aimObs = this.scene.onBeforeRenderObservable.add(() => {
        if (!this.aiming) return;
        const now = performance.now();
        const recoilT = Math.max(0, (this.recoilUntil - now) / 120);
        const recoil = Math.sin(Math.min(1, recoilT) * Math.PI) * 0.6;
        const aim = Quaternion.RotationAxis(new Vector3(1, 0, 0), -1.1 - recoil);
        armNode.rotationQuaternion = baseRot.multiply(aim);
      });
    } else if (this.aimObs) {
      this.scene.onBeforeRenderObservable.remove(this.aimObs);
      this.aimObs = null;
    }
  }

  playShootRecoil(): void {
    this.recoilUntil = performance.now() + 120;
    this.spawnMuzzleFlash();
  }

  private spawnMuzzleFlash(): void {
    const anchor = this.weaponRoot ?? (this.rightHandBone?.getTransformNode?.() as TransformNode | null);
    if (!anchor) return;
    const m = MeshBuilder.CreateSphere(`pmflash_${this.id}`, { diameter: 0.35 }, this.scene);
    const fwd = this.root.forward.clone();
    const base = (anchor as unknown as { getAbsolutePosition?: () => Vector3 }).getAbsolutePosition?.()
      ?? this.root.position.add(new Vector3(0, 1.3, 0));
    m.position = base.add(fwd.scale(0.5));
    const mat = new StandardMaterial(`pmflashm_${this.id}`, this.scene);
    mat.emissiveColor = new Color3(1, 0.85, 0.25);
    mat.disableLighting = true;
    m.material = mat;
    setTimeout(() => m.dispose(), 50);
  }

  /** Step over short curbs while pathing. */
  private tryStepUp(dirX: number, dirZ: number, dt: number): void {
    if (!this.body) return;
    this.stepProbeCooldown -= dt;
    if (this.stepProbeCooldown > 0) return;
    this.stepProbeCooldown = STEP_PROBE_INTERVAL;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-3) return;
    const STEP_HEIGHT = 0.45;
    const probe = 0.55;
    const nx = dirX / len;
    const nz = dirZ / len;
    const feetY = this.root.position.y - 0.85;
    const above = new Vector3(
      this.root.position.x + nx * probe,
      feetY + STEP_HEIGHT + 0.4,
      this.root.position.z + nz * probe
    );
    const ray = new Ray(above, new Vector3(0, -1, 0), STEP_HEIGHT + 0.5);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string } | null)?.kind;
      return k === 'sidewalk' || k === 'road' || k === 'building' || k === 'ground' || k === 'terrain';
    });
    if (!hit?.pickedPoint) return;
    const diff = hit.pickedPoint.y - feetY;
    if (diff > 0.04 && diff < STEP_HEIGHT) {
      this.root.position.y = hit.pickedPoint.y + 0.85 + 0.02;
      const v = this.body.getLinearVelocity();
      if (v.y < 0) this.body.setLinearVelocity(new Vector3(v.x, 0, v.z));
    }
  }

  dispose(): void {
    this.setAiming(false);
    this.releaseCover();
    this.body?.dispose();
    this.body = null;
    this.root.dispose();
  }
}
