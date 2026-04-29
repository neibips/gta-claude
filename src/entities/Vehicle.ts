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

const VEHICLE_HALF_HEIGHT = 0.7;

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
    this.root.position.set(at.x, VEHICLE_HALF_HEIGHT, at.z);
    this.yaw = yaw;
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
    if (this.body) {
      this.body.setLinearVelocity(Vector3.Zero());
      this.body.setAngularVelocity(Vector3.Zero());
    }
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), yaw);
  }

  forward(): Vector3 {
    return new Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Raycast forward; returns distance to nearest blocker (or Infinity). */
  raycastForward(distance: number, ignoreId?: string): number {
    const f = this.forward();
    const origin = this.root.position.add(f.scale(2.2));
    origin.y = VEHICLE_HALF_HEIGHT;
    const ray = new Ray(origin, f, distance);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const k = (m.metadata as { kind?: string; id?: string } | null)?.kind;
      const id = (m.metadata as { id?: string } | null)?.id;
      if (id && id === ignoreId) return false;
      return k === 'building' || k === 'vehicle' || k === 'npc' || k === 'police' || k === 'tree' || k === 'player';
    });
    if (hit?.pickedPoint) return Vector3.Distance(origin, hit.pickedPoint);
    return Infinity;
  }

  /** Move forward with current speed. Uses physics velocity if available. */
  step(dt: number): void {
    const f = this.forward();
    if (this.body) {
      const v = this.body.getLinearVelocity();
      this.body.setLinearVelocity(new Vector3(f.x * this.speed, v.y, f.z * this.speed));
      // Damp out angular velocity from collisions; rotation is set via mesh.
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
