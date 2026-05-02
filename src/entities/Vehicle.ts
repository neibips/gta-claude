import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Ray } from '@babylonjs/core/Culling/ray';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';

import { AssetLoader, ASSET_INDEX } from '../core/AssetLoader';
import { GameConfig } from '../config/GameConfig';

let nextId = 0;

export type VehicleMode = 'traffic' | 'player' | 'idle';
export type VehicleRaycastHit = {
  distance: number;
  kind: string;
  id: string | null;
  point: Vector3;
};

const VEHICLE_HALF_HEIGHT = 0.7;
const FORWARD_BLOCKER_KINDS = new Set([
  'building',
  'decoration',
  'npc',
  'player',
  'police',
  'sidewalk',
  'tree',
  'vehicle',
]);
const GROUND_PROBE_KINDS = new Set(['road', 'sidewalk', 'building', 'decoration', 'ground', 'terrain']);

export class Vehicle {
  readonly id: string;
  readonly root: Mesh;
  speed = 0;
  mode: VehicleMode = 'traffic';
  yaw = 0;
  /** Traffic waypoint id chain — managed by TrafficSystem. */
  trafficCurrent: string | null = null;
  trafficPrev: string | null = null;
  body: PhysicsBody | null = null;

  constructor(private readonly scene: Scene) {
    this.id = `car_${nextId++}`;
    // Hidden "logical" body box, visual is loaded separately
    this.root = MeshBuilder.CreateBox(this.id, { width: 1.8, depth: 4.2, height: 1.4 }, scene);
    const m = new StandardMaterial(`mat_${this.id}`, scene);
    m.diffuseColor = new Color3(0.7, 0.2, 0.2);
    this.root.material = m;
    this.root.checkCollisions = true;
    this.root.metadata = { kind: 'vehicle', id: this.id };
    this.root.rotationQuaternion = Quaternion.Identity();
    this.root.position.y = VEHICLE_HALF_HEIGHT;
    this.tryEnablePhysics();
  }

  private tryEnablePhysics(): void {
    if (!this.scene.getPhysicsEngine()) return;
    try {
      const agg = new PhysicsAggregate(
        this.root,
        PhysicsShapeType.BOX,
        { mass: 1200, friction: 0.6, restitution: 0.1 },
        this.scene
      );
      const body = agg.body;
      // Allow manual transform writes (yaw + spawn teleport) to be picked up
      body.disablePreStep = false;
      // Lock rotation entirely — yaw is set authoritatively from input/AI.
      // Collision shape still rotates with the visual since prestep is on.
      body.setMassProperties({ mass: 1200, inertia: new Vector3(0, 0, 0) });
      this.body = body;
    } catch (e) {
      console.warn('[Vehicle] physics enable failed', e);
    }
  }

  async loadVisual(loader: AssetLoader): Promise<void> {
    try {
      const path = ASSET_INDEX.car[Math.floor(Math.random() * ASSET_INDEX.car.length)];
      const m = await loader.loadModel(path);
      m.rootMesh.parent = this.root;
      m.rootMesh.position.set(0, -VEHICLE_HALF_HEIGHT, 0);
      m.rootMesh.scaling.set(1, 1, 1);
      (this.root.material as StandardMaterial).alpha = 0;
    } catch (e) {
      console.warn('[Vehicle] visual load failed', e);
    }
  }

  spawn(at: Vector3, yaw = 0): void {
    // Snap onto the actual road surface — the GLB ground may sit higher than
    // the authored waypoint y, otherwise cars spawn buried or floating.
    const snappedY = this.snapToGroundY(at.x, at.z, at.y) + VEHICLE_HALF_HEIGHT;
    this.root.position.set(at.x, snappedY, at.z);
    this.yaw = yaw;
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    if (this.body) {
      this.body.setLinearVelocity(Vector3.Zero());
      this.body.setAngularVelocity(Vector3.Zero());
    }
  }

  /** Find the road/ground Y at (x, z) by casting a ray downward from above. */
  private snapToGroundY(x: number, z: number, fallback: number): number {
    const origin = new Vector3(x, fallback + 50, z);
    const ray = new Ray(origin, new Vector3(0, -1, 0), 200);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string } | null)?.kind;
      return k === 'road' || k === 'sidewalk' || k === 'building' || k === 'ground' || k === 'terrain';
    });
    if (hit?.pickedPoint) return hit.pickedPoint.y;
    return fallback;
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
  }

  forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Raycast forward; returns nearest blocker details or null. */
  raycastForwardHit(distance: number, ignoreId?: string): VehicleRaycastHit | null {
    const f = this.forward();
    const origin = this.root.position.add(f.scale(2.2));
    // Cast at the car's actual height; GLB roads can sit above y=0.
    origin.y = this.root.position.y;
    const ray = new Ray(origin, f, distance);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string; id?: string } | null)?.kind;
      const id = (m.metadata as { id?: string } | null)?.id;
      if (id && id === ignoreId) return false;
      return Boolean(k && FORWARD_BLOCKER_KINDS.has(k));
    });
    if (hit?.pickedPoint && hit.pickedMesh) {
      const meta = hit.pickedMesh.metadata as { kind?: string; id?: string } | null;
      return {
        distance: Vector3.Distance(origin, hit.pickedPoint),
        kind: meta?.kind ?? 'unknown',
        id: meta?.id ?? null,
        point: hit.pickedPoint.clone(),
      };
    }
    return null;
  }

  /** Raycast forward; returns distance to nearest blocker (or Infinity). */
  raycastForward(distance: number, ignoreId?: string): number {
    const hit = this.raycastForwardHit(distance, ignoreId);
    if (hit) return hit.distance;
    return Infinity;
  }

  /** Probe the surface kind below a point relative to the car. */
  groundKindAt(offsetForward = 0, offsetRight = 0): string | null {
    const f = this.forward();
    const right = new Vector3(f.z, 0, -f.x);
    const origin = this.root.position.add(f.scale(offsetForward)).add(right.scale(offsetRight));
    origin.y = this.root.position.y + 20;
    const ray = new Ray(origin, new Vector3(0, -1, 0), 80);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string } | null)?.kind;
      return Boolean(k && GROUND_PROBE_KINDS.has(k));
    });
    if (!hit?.pickedMesh) return null;
    return (hit.pickedMesh.metadata as { kind?: string } | null)?.kind ?? null;
  }

  /** Move forward with current speed. Uses physics velocity if available. */
  step(dt: number): void {
    const f = this.forward();
    if (this.body) {
      const v = this.body.getLinearVelocity();
      // Clamp any vertical velocity from collisions to a tiny range so curb
      // hits never throw the car into the air; gravity still pulls it down.
      const vy = Math.min(0.6, Math.max(-30, v.y));
      // Apply throttle horizontally only when grounded — when airborne the
      // driver/AI input must not steer or push the car around mid-flight.
      const grounded = vy <= 0.6 && vy >= -0.6;
      const speed = grounded ? this.speed : 0;
      this.body.setLinearVelocity(
        new Vector3(grounded ? f.x * speed : v.x, vy, grounded ? f.z * speed : v.z)
      );
      this.body.setAngularVelocity(Vector3.Zero());
    } else {
      this.root.position.x += f.x * this.speed * dt;
      this.root.position.z += f.z * this.speed * dt;
    }
  }

  applyDriverInput(throttle: number, brake: number, steer: number, dt: number): void {
    // Simple arcade physics
    const accel = 14;
    const dec = 18;
    const maxRev = -10;
    if (throttle > 0) this.speed = Math.min(GameConfig.traffic.maxSpeed * 2.6, this.speed + accel * dt * throttle);
    else if (brake > 0) {
      // Apply brake; if going forward decelerate, otherwise reverse
      if (this.speed > 0) this.speed = Math.max(0, this.speed - dec * dt * brake);
      else this.speed = Math.max(maxRev, this.speed - accel * 0.6 * dt * brake);
    } else {
      this.speed *= 1 - 1.0 * dt; // engine drag
    }
    // Steering — only when moving
    const steerAuth = 1.6 * Math.min(1, Math.abs(this.speed) / 4);
    this.yaw += steer * steerAuth * dt * Math.sign(this.speed || 1);
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), this.yaw);
    this.step(dt);
  }

  dispose(): void {
    this.body?.dispose();
    this.body = null;
    this.root.dispose();
  }
}
