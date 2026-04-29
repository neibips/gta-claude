import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { Vehicle } from '../entities/Vehicle';
import type { WaypointGraph, Waypoint } from '../world/WaypointGraph';
import type { AssetLoader } from '../core/AssetLoader';
import { GameConfig } from '../config/GameConfig';

export class TrafficSystem {
  readonly vehicles: Vehicle[] = [];
  /** Vehicle commandeered by player (excluded from traffic AI). */
  playerVehicle: Vehicle | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly loader: AssetLoader,
    private readonly graph: WaypointGraph,
    private readonly spawnPoints: Vector3[]
  ) {}

  ensureMin(): void {
    while (this.vehicles.length < GameConfig.traffic.min) this.spawnOne();
    while (this.vehicles.length > GameConfig.traffic.max) {
      const v = this.vehicles.pop();
      if (v && v !== this.playerVehicle) v.dispose();
    }
  }

  spawnOne(): Vehicle {
    const v = new Vehicle(this.scene);
    const at = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    // Set yaw toward nearest traffic waypoint heading
    const start = this.graph.nearest(new Vector3(at.x, 0, at.z));
    const next = this.graph.next(start, null);
    const dir = next.position.subtract(start.position);
    const yaw = Math.atan2(dir.x, dir.z);
    v.spawn(at, yaw);
    v.trafficCurrent = next.id;
    v.trafficPrev = start.id;
    v.loadVisual(this.loader);
    this.vehicles.push(v);
    return v;
  }

  /** Move a traffic vehicle to player control. Returns true on success. */
  takeOver(v: Vehicle): void {
    this.playerVehicle = v;
    v.mode = 'player';
  }
  release(v: Vehicle): void {
    if (this.playerVehicle === v) this.playerVehicle = null;
    v.mode = 'traffic';
    // Re-snap to nearest traffic waypoint
    const wp = this.graph.nearest(v.root.position);
    v.trafficCurrent = wp.id;
    v.trafficPrev = null;
  }

  /** Find nearest non-player vehicle within radius of pos. */
  nearest(pos: Vector3, radius = 3): Vehicle | null {
    let best: Vehicle | null = null;
    let bestD = radius * radius;
    for (const v of this.vehicles) {
      if (v === this.playerVehicle) continue;
      const d = Vector3.DistanceSquared(v.root.position, pos);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  update(dt: number): void {
    const cruise = GameConfig.traffic.maxSpeed;
    for (const v of this.vehicles) {
      if (v === this.playerVehicle) continue;
      const cur = v.trafficCurrent ? this.graph.nodes.get(v.trafficCurrent) : null;
      if (!cur) {
        v.trafficCurrent = this.graph.nearest(v.root.position).id;
        continue;
      }
      // Aim at current waypoint
      const target = cur.position;
      const dx = target.x - v.root.position.x;
      const dz = target.z - v.root.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.5) {
        const next = this.graph.next(cur, v.trafficPrev);
        v.trafficPrev = cur.id;
        v.trafficCurrent = next.id;
        continue;
      }
      const targetYaw = Math.atan2(dx, dz);
      // Smoothly steer
      let dy = targetYaw - v.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      v.yaw += Math.max(-1.5 * dt, Math.min(1.5 * dt, dy));
      v.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), v.yaw);

      // Obstacle stop
      const ahead = v.raycastForward(GameConfig.traffic.raycastDistance, v.id);
      if (ahead < 4) v.speed = Math.max(0, v.speed - 30 * dt);
      else if (ahead < 8) v.speed = Math.max(0, v.speed - 8 * dt);
      else v.speed = Math.min(cruise, v.speed + 6 * dt);

      v.step(dt);
    }
  }

  /** Returns vehicles that hit the given world point with `>= killSpeed` impulse. */
  detectRunOver(targetPos: Vector3, radius = 1.0): { v: Vehicle; speed: number } | null {
    for (const v of this.vehicles) {
      if (Vector3.Distance(v.root.position, targetPos) <= radius + 1.6 && Math.abs(v.speed) > 5) {
        return { v, speed: Math.abs(v.speed) };
      }
    }
    return null;
  }
}
