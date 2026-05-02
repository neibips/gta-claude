import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
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
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Bone } from '@babylonjs/core/Bones/bone';

import { GameConfig } from '../config/GameConfig';
import {
  AnimController,
  buildRetargetMap,
  retargetAnimationGroup,
  type AnimSet,
} from '../systems/AnimationSystem';
import { AssetLoader, ASSET_INDEX } from '../core/AssetLoader';
import type { InputManager } from '../core/InputManager';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';

export type PlayerState = 'alive' | 'dead' | 'in_vehicle';

export class Player {
  /** Root mesh — owns position. Capsule visual is invisible. */
  readonly root: Mesh;
  visualRoot: TransformNode | null = null;
  rightHandBone: Bone | null = null;
  rightArmBone: Bone | null = null;
  private leftUpLegNode: TransformNode | null = null;
  private rightUpLegNode: TransformNode | null = null;
  private leftLowerLegNode: TransformNode | null = null;
  private rightLowerLegNode: TransformNode | null = null;
  private punching = false;
  private jumping = false;
  private lastJumpAt = 0;
  camera!: ArcRotateCamera;
  hp: number = GameConfig.player.hp;
  state: PlayerState = 'alive';
  anim: AnimController | null = null;
  body: PhysicsBody | null = null;

  private moving = false;
  private running = false;
  private targetYaw = 0;
  private spawn: Vector3 = new Vector3(0, 0, 0);
  private respawnAt = 0;

  onDeath?: () => void;
  onRespawn?: () => void;

  constructor(
    private readonly scene: Scene,
    private readonly input: InputManager,
    private readonly canvas: HTMLCanvasElement
  ) {
    this.root = MeshBuilder.CreateCapsule(
      'player',
      {
        height: GameConfig.player.capsule.height,
        radius: GameConfig.player.capsule.radius,
        capSubdivisions: 4,
        tessellation: 8,
      },
      scene
    );
    const cm = new StandardMaterial('mat_player_capsule', scene);
    cm.alpha = 0.0;
    this.root.material = cm;
    this.root.isPickable = false;
    this.root.checkCollisions = true;
    this.root.ellipsoid = new Vector3(
      GameConfig.player.capsule.radius * 1.6,
      GameConfig.player.capsule.height / 2,
      GameConfig.player.capsule.radius * 1.6
    );
    this.root.ellipsoidOffset = new Vector3(0, GameConfig.player.capsule.height / 2, 0);
    this.root.position.set(0, GameConfig.player.capsule.height / 2, 0);
    this.root.rotationQuaternion = Quaternion.Identity();
    this.root.metadata = { kind: 'player' };
    void Color3;
  }

  enablePhysics(): void {
    if (this.body) return;
    if (!this.scene.getPhysicsEngine()) return;
    try {
      const agg = new PhysicsAggregate(
        this.root,
        PhysicsShapeType.CAPSULE,
        { mass: 80, friction: 0.4, restitution: 0 },
        this.scene
      );
      const body = agg.body;
      body.disablePreStep = false;
      // Lock rotation — input controls yaw via mesh quaternion only.
      body.setMassProperties({ mass: 80, inertia: new Vector3(0, 0, 0) });
      this.body = body;
    } catch (e) {
      console.warn('[Player] physics enable failed', e);
    }
  }

  private disablePhysics(): void {
    if (!this.body) return;
    this.body.dispose();
    this.body = null;
  }

  async load(loader: AssetLoader): Promise<void> {
    let rig: Awaited<ReturnType<typeof loader.loadModel>> | null = null;
    try {
      rig = await loader.loadModel(ASSET_INDEX.player.rig);
    } catch (e) {
      console.warn(`[Player] failed to load ${ASSET_INDEX.player.rig}`, e);
    }

    let rigSkeleton: Skeleton | null = null;
    if (rig?.rootMesh) {
      const rigRoot = rig.rootMesh;
      rigRoot.parent = this.root;
      rigRoot.position.set(0, -GameConfig.player.capsule.height / 2, 0);
      this.visualRoot = rigRoot as unknown as TransformNode;
      rigSkeleton =
        (rigRoot as AbstractMesh).skeleton ??
        rig.meshes.find((m) => (m as AbstractMesh).skeleton)?.skeleton ??
        null;
      if (rigSkeleton) {
        const bones = rigSkeleton.bones;
        // Prefer an exact "RightHand" before fuzzy matches; avoid matching
        // "RightHandThumb1" / "RightHandIndex1" etc. by excluding finger names.
        const isFinger = (n: string) =>
          /thumb|index|middle|ring|pinky|finger/i.test(n);
        this.rightHandBone =
          bones.find((b) => /^(mixamorig:?)?RightHand$/i.test(b.name)) ??
          bones.find((b) => /right.?hand|hand.?r|r_hand/i.test(b.name) && !isFinger(b.name)) ??
          bones.find((b) => /hand.*r$|r$.*hand/i.test(b.name) && !isFinger(b.name)) ??
          bones.find((b) => /right.?arm|arm.?r/i.test(b.name)) ??
          null;
        this.rightArmBone =
          bones.find((b) => /right.?(upper)?.?arm|upperarm.?r/i.test(b.name)) ??
          bones.find((b) => /right.?shoulder|shoulder.?r/i.test(b.name)) ??
          this.rightHandBone;

        const findLegNode = (re: RegExp): TransformNode | null =>
          bones.find((b) => re.test(b.name))?.getTransformNode?.() ?? null;
        this.leftUpLegNode =
          findLegNode(/^(mixamorig:?)?LeftUpLeg$/i) ??
          findLegNode(/left.?up.?leg|upleg.?l|l.?upleg|thigh.?l|left.?thigh/i);
        this.rightUpLegNode =
          findLegNode(/^(mixamorig:?)?RightUpLeg$/i) ??
          findLegNode(/right.?up.?leg|upleg.?r|r.?upleg|thigh.?r|right.?thigh/i);
        this.leftLowerLegNode =
          findLegNode(/^(mixamorig:?)?LeftLeg$/i) ??
          findLegNode(/left.?(lower)?leg|leg.?l|shin.?l|left.?shin|calf.?l/i);
        this.rightLowerLegNode =
          findLegNode(/^(mixamorig:?)?RightLeg$/i) ??
          findLegNode(/right.?(lower)?leg|leg.?r|shin.?r|right.?shin|calf.?r/i);
      }
    } else {
      const fb = MeshBuilder.CreateBox('player_fallback', { width: 0.6, depth: 0.4, height: 1.7 }, this.scene);
      fb.parent = this.root;
      fb.position.set(0, 0, 0);
      const mat = new StandardMaterial('mat_pfb', this.scene);
      mat.diffuseColor = new Color3(0.85, 0.55, 0.2);
      fb.material = mat;
      this.visualRoot = fb as unknown as TransformNode;
    }

    const targetMap = buildRetargetMap(this.visualRoot, rigSkeleton);

    const loadAnim = async (url: string, name: string): Promise<AnimationGroup | null> => {
      try {
        const container = await loader.loadContainer(url);
        const src = container.animationGroups[0] ?? null;
        const retargeted = src
          ? retargetAnimationGroup(src, targetMap, this.scene, `player_${name}`)
          : null;
        // Container is not added to the scene (LoadAssetContainerAsync); dispose
        // its meshes/skeletons/source-anim-groups so they don't leak.
        container.dispose();
        if (!retargeted) console.warn(`[Player] no targets matched for ${url}`);
        return retargeted;
      } catch (e) {
        console.warn(`[Player] failed to load ${url}`, e);
        return null;
      }
    };

    const [idleA, walkA, runA, punchA, jumpA] = await Promise.all([
      loadAnim(ASSET_INDEX.player.idle, 'idle'),
      loadAnim(ASSET_INDEX.player.walk, 'walk'),
      loadAnim(ASSET_INDEX.player.run, 'run'),
      loadAnim(ASSET_INDEX.player.punch, 'punch'),
      loadAnim(ASSET_INDEX.player.jump, 'jump'),
    ]);

    const animSet: AnimSet = {};
    if (idleA) animSet.idle = idleA;
    if (walkA) animSet.walk = walkA;
    if (runA) animSet.run = runA;
    if (punchA) animSet.punch = punchA;
    if (jumpA) animSet.jump = jumpA;
    this.anim = new AnimController(animSet);
    this.anim.play('idle');
  }

  setupCamera(): ArcRotateCamera {
    const cam = new ArcRotateCamera(
      'playerCam',
      -Math.PI / 2,
      Math.PI / 3,
      GameConfig.camera.radius,
      this.root.position.add(new Vector3(0, GameConfig.camera.heightOffset, 0)),
      this.scene
    );
    cam.lowerRadiusLimit = GameConfig.camera.lowerRadiusLimit;
    cam.upperRadiusLimit = GameConfig.camera.upperRadiusLimit;
    cam.lowerBetaLimit = GameConfig.camera.lowerBetaLimit;
    cam.upperBetaLimit = GameConfig.camera.upperBetaLimit;
    cam.wheelPrecision = GameConfig.camera.wheelPrecision;
    cam.inertia = GameConfig.camera.inertia;
    cam.angularSensibilityX = 1500;
    cam.angularSensibilityY = 1500;
    cam.checkCollisions = false;
    this.camera = cam;
    this.scene.activeCamera = cam;
    this.attachPointerLockControls();
    return cam;
  }

  private attachPointerLockControls(): void {
    const sensX = 0.0025;
    const sensY = 0.0025;
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== this.canvas) return;
      if (!this.camera) return;
      this.camera.alpha -= e.movementX * sensX;
      this.camera.beta -= e.movementY * sensY;
      const lo = this.camera.lowerBetaLimit ?? GameConfig.camera.lowerBetaLimit;
      const hi = this.camera.upperBetaLimit ?? GameConfig.camera.upperBetaLimit;
      if (this.camera.beta < lo) this.camera.beta = lo;
      if (this.camera.beta > hi) this.camera.beta = hi;
    };
    const onWheel = (e: WheelEvent) => {
      if (document.pointerLockElement !== this.canvas) return;
      e.preventDefault();
      const delta = e.deltaY * 0.01;
      const lo = this.camera.lowerRadiusLimit ?? GameConfig.camera.lowerRadiusLimit;
      const hi = this.camera.upperRadiusLimit ?? GameConfig.camera.upperRadiusLimit;
      this.camera.radius = Math.max(lo, Math.min(hi, this.camera.radius + delta));
    };
    document.addEventListener('mousemove', onMove);
    this.canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  position(): Vector3 {
    return this.root.position;
  }

  setPosition(p: Vector3): void {
    this.root.position.set(p.x, p.y + GameConfig.player.capsule.height / 2, p.z);
  }

  takeDamage(amount: number): void {
    if (this.state !== 'alive') return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.kill();
  }

  kill(): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.respawnAt = performance.now() + GameConfig.player.respawnDelayMs;
    this.anim?.play('death_fall', false);
    this.onDeath?.();
  }

  /**
   * Plays the punch animation glb if available; falls back to a procedural
   * arm-rotation overlay. Sets `punching` so update() doesn't override the
   * one-shot animation by re-selecting idle/walk/run.
   */
  playPunch(): void {
    if (this.punching) return;
    if (this.anim?.has('punch')) {
      this.punching = true;
      this.anim.play('punch', false);
      const ms = Math.max(250, this.anim.durationMs('punch'));
      setTimeout(() => { this.punching = false; }, ms);
      return;
    }
    const bone = this.rightArmBone ?? this.rightHandBone;
    const node = bone?.getTransformNode?.();
    if (!node) return;
    this.punching = true;
    const start = performance.now();
    const dur = 350;
    const obs = this.scene.onAfterAnimationsObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1 || this.state !== 'alive') {
        this.scene.onAfterAnimationsObservable.remove(obs);
        this.punching = false;
        return;
      }
      const swing = Math.sin(t * Math.PI);
      const extra = Quaternion.RotationAxis(new Vector3(1, 0, 0), -swing * 1.4);
      const cur = node.rotationQuaternion ?? Quaternion.Identity();
      node.rotationQuaternion = cur.multiply(extra);
    });
  }

  /**
   * Jump: plays the jump animation glb and applies a vertical impulse sized
   * so the airborne flight time matches the animation. Falls back to a
   * procedural leg-tuck overlay if the glb is unavailable.
   *
   * Velocity is derived from the physics gravity g and the airborne portion
   * of the anim duration t_air via v = g * t_air / 2 (projectile motion),
   * so landing aligns with the foot-plant frame regardless of anim length.
   */
  playJump(): void {
    if (this.state !== 'alive') return;
    if (this.jumping) return;
    if (!this.body) return;
    const now = performance.now();
    if (now - this.lastJumpAt < GameConfig.jump.cooldownMs) return;
    const v = this.body.getLinearVelocity();
    if (Math.abs(v.y) > GameConfig.jump.groundedYVel) return;

    const hasAnim = !!this.anim?.has('jump');
    const animMs = hasAnim ? this.anim!.durationMs('jump') : 700;
    const windupMs = animMs * GameConfig.jump.windupFraction;
    const tAirSec = (animMs / 1000) * GameConfig.jump.airborneFraction;
    const g = Math.abs(this.scene.getPhysicsEngine()?.gravity.y ?? -9.81);
    const rawV = (g * tAirSec) / 2;
    const jumpV = Math.min(
      GameConfig.jump.maxVelocity,
      Math.max(GameConfig.jump.minVelocity, rawV)
    );
    this.lastJumpAt = now;
    this.jumping = true;

    if (hasAnim) {
      this.anim!.play('jump', false);
      // Defer the physics impulse until the wind-up (crouch) frames have
      // played. Without this, the body launches before the anim visibly
      // starts and the airborne curve falls out of sync with the animation.
      setTimeout(() => {
        if (!this.body || this.state !== 'alive') return;
        const cv = this.body.getLinearVelocity();
        this.body.setLinearVelocity(new Vector3(cv.x, jumpV, cv.z));
      }, windupMs);
      setTimeout(() => { this.jumping = false; }, animMs);
      return;
    }

    this.body.setLinearVelocity(new Vector3(v.x, jumpV, v.z));

    const start = now;
    const dur = animMs;
    const apply = (n: TransformNode | null, ang: number) => {
      if (!n) return;
      const cur = n.rotationQuaternion ?? Quaternion.Identity();
      n.rotationQuaternion = cur.multiply(
        Quaternion.RotationAxis(new Vector3(1, 0, 0), ang)
      );
    };
    const obs = this.scene.onAfterAnimationsObservable.add(() => {
      const t = (performance.now() - start) / dur;
      if (t >= 1 || this.state !== 'alive') {
        this.scene.onAfterAnimationsObservable.remove(obs);
        this.jumping = false;
        return;
      }
      const tuck = t < 0.35
        ? Math.sin((t / 0.35) * (Math.PI / 2))
        : Math.cos(((t - 0.35) / 0.65) * (Math.PI / 2));
      apply(this.leftUpLegNode, -tuck * 0.9);
      apply(this.rightUpLegNode, -tuck * 0.9);
      apply(this.leftLowerLegNode, tuck * 1.3);
      apply(this.rightLowerLegNode, tuck * 1.3);
    });
  }

  setSpawn(p: Vector3): void {
    // Snap to actual GLB ground at (x, z); the authored spawn y can be off.
    const ray = new Ray(new Vector3(p.x, p.y + 50, p.z), new Vector3(0, -1, 0), 200);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string } | null)?.kind;
      return k === 'road' || k === 'sidewalk' || k === 'building' || k === 'ground' || k === 'terrain';
    });
    const groundY = hit?.pickedPoint?.y ?? p.y;
    this.spawn = new Vector3(p.x, groundY + GameConfig.player.capsule.height / 2 + 0.05, p.z);
    this.root.position.copyFrom(this.spawn);
    if (this.body) this.body.setLinearVelocity(Vector3.Zero());
  }

  setVehicleMode(active: boolean, attachTo?: TransformNode): void {
    void attachTo;
    if (active) {
      this.state = 'in_vehicle';
      // Hide entire visual rig + capsule and remove physics body so the player
      // doesn't collide with the car they're riding.
      this.root.setEnabled(false);
      if (this.visualRoot) (this.visualRoot as TransformNode).setEnabled(false);
      this.anim?.stopAll();
      this.disablePhysics();
    } else {
      this.state = 'alive';
      this.root.setEnabled(true);
      if (this.visualRoot) (this.visualRoot as TransformNode).setEnabled(true);
      this.enablePhysics();
      this.anim?.play('idle');
    }
  }

  update(dt: number): void {
    const now = performance.now();
    if (this.state === 'dead') {
      if (now >= this.respawnAt) this.respawn();
      return;
    }
    if (this.state === 'in_vehicle') {
      const target = this.root.position.add(new Vector3(0, GameConfig.camera.heightOffset * 0.5, 0));
      if (this.camera) this.camera.target = Vector3.Lerp(this.camera.target, target, Math.min(1, dt * 8));
      return;
    }

    const cam = this.camera;
    const fwd = cam.getForwardRay().direction;
    fwd.y = 0;
    const fl = fwd.length();
    if (fl > 1e-4) fwd.scaleInPlace(1 / fl);
    const right = new Vector3(fwd.z, 0, -fwd.x);

    let mx = 0;
    let mz = 0;
    if (this.input.isDown('KeyW')) mz += 1;
    if (this.input.isDown('KeyS')) mz -= 1;
    if (this.input.isDown('KeyD')) mx += 1;
    if (this.input.isDown('KeyA')) mx -= 1;

    this.running = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const len = Math.hypot(mx, mz);
    this.moving = len > 0.001;

    if (this.moving) {
      const nx = mx / len;
      const nz = mz / len;
      const speed = this.running ? GameConfig.player.runSpeed : GameConfig.player.walkSpeed;
      const wx = right.x * nx + fwd.x * nz;
      const wz = right.z * nx + fwd.z * nz;

      if (this.body) {
        this.tryStepUp(wx, wz);
        const v = this.body.getLinearVelocity();
        this.body.setLinearVelocity(new Vector3(wx * speed, v.y, wz * speed));
      } else {
        const dx = wx * speed * dt;
        const dz = wz * speed * dt;
        this.root.moveWithCollisions(new Vector3(dx, 0, dz));
      }

      this.targetYaw = Math.atan2(wx, wz);
      const cur = this.root.rotationQuaternion ?? Quaternion.Identity();
      const target = Quaternion.RotationAxis(Vector3.Up(), this.targetYaw);
      this.root.rotationQuaternion = Quaternion.Slerp(cur, target, Math.min(1, dt * 12));
    } else if (this.body) {
      // Stop horizontal motion but preserve gravity-driven Y velocity.
      const v = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vector3(0, v.y, 0));
    }

    // Safety floor (if physics engine is unavailable / catastrophic teleport)
    if (!this.body && this.root.position.y < GameConfig.player.capsule.height / 2) {
      this.root.position.y = GameConfig.player.capsule.height / 2;
    }

    const target = this.root.position.add(new Vector3(0, GameConfig.camera.heightOffset * 0.5, 0));
    cam.target = Vector3.Lerp(cam.target, target, Math.min(1, dt * 8));

    if (this.anim && !this.punching && !this.jumping) {
      if (!this.moving) this.anim.play('idle');
      else if (this.running && this.anim.has('run')) this.anim.play('run');
      else this.anim.play('walk');
    }
  }

  /**
   * Step-up assist: probes the ground a short distance ahead and, if it sits
   * higher than the capsule's feet but below `STEP_HEIGHT`, lifts the body so
   * the capsule mounts the curb instead of running into its vertical face.
   */
  private tryStepUp(dirX: number, dirZ: number): void {
    if (!this.body) return;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-3) return;
    const STEP_HEIGHT = 0.45;
    const radius = GameConfig.player.capsule.radius;
    const probe = radius + 0.25;
    const nx = dirX / len;
    const nz = dirZ / len;
    const feetY = this.root.position.y - GameConfig.player.capsule.height / 2;
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
    const groundY = hit.pickedPoint.y;
    const diff = groundY - feetY;
    if (diff > 0.04 && diff < STEP_HEIGHT) {
      this.root.position.y = groundY + GameConfig.player.capsule.height / 2 + 0.02;
      const v = this.body.getLinearVelocity();
      if (v.y < 0) this.body.setLinearVelocity(new Vector3(v.x, 0, v.z));
    }
  }

  private respawn(): void {
    this.hp = GameConfig.player.hp;
    this.state = 'alive';
    this.root.position.copyFrom(this.spawn);
    this.root.rotationQuaternion = Quaternion.Identity();
    if (this.body) this.body.setLinearVelocity(Vector3.Zero());
    this.anim?.play('idle');
    this.onRespawn?.();
  }
}
