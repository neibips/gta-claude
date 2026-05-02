import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import type { Scene } from '@babylonjs/core/scene';
import { Vehicle } from '../entities/Vehicle';
import type { WaypointGraph, Waypoint } from '../world/WaypointGraph';
import type { AssetLoader } from '../core/AssetLoader';
import { GameConfig } from '../config/GameConfig';
import { headingTo, isRoadSurface, shouldReverseForBlocker } from './TrafficLogic';

type TrafficAIState = {
  lastPos: Vector3;
  stuckFor: number;
  reverseFor: number;
  reverseCooldown: number;
  nearestRoad: Waypoint | null;
  centerlineDist: number;
  routeProbeIn: number;
  blockDistance: number;
  blockerKind: string | null;
  obstacleProbeIn: number;
};

type RouteTarget = {
  waypoint: Waypoint;
  recoveringRoad: boolean;
};

type RoadSegment = {
  a: Vector3;
  b: Vector3;
};

const NORMAL_STEER_RATE = 1.5;
const RECOVERY_STEER_RATE = 2.4;
const REVERSE_STEER_RATE = 2.3;
const ROUTE_PROBE_INTERVAL = 0.35;
const OBSTACLE_PROBE_INTERVAL = 0.16;

export class TrafficSystem {
  readonly vehicles: Vehicle[] = [];
  /** Vehicle commandeered by player (excluded from traffic AI). */
  playerVehicle: Vehicle | null = null;
  private readonly aiState = new WeakMap<Vehicle, TrafficAIState>();
  private drivableWaypointIds: Set<string> | null = null;
  private drivableWaypointCache: Waypoint[] | null = null;
  private roadSegments: RoadSegment[] | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly loader: AssetLoader,
    private readonly graph: WaypointGraph,
    private readonly spawnPoints: Vector3[]
  ) {}

  ensureMin(): void {
    let safety = 60;
    while (this.vehicles.length < GameConfig.traffic.min && safety-- > 0) {
      const ok = this.spawnOne();
      if (!ok) break;
    }
    while (this.vehicles.length > GameConfig.traffic.max) {
      const v = this.vehicles.pop();
      if (v && v !== this.playerVehicle) v.dispose();
    }
  }

  /** Spawn one vehicle if traffic has dropped below configured min. */
  topUp(): void {
    if (this.vehicles.length < GameConfig.traffic.min) this.spawnOne();
  }

  /**
   * Pick a free spawn point on the road graph. Tries waypoints (richer than
   * the small spawn-points list), rejects any candidate within `minSpawnDist`
   * of an existing vehicle so cars never appear stacked.
   */
  private pickFreeSpawn(): { pos: Vector3; node: Waypoint } | null {
    const minD = GameConfig.traffic.minSpawnDist;
    const minD2 = minD * minD;
    const candidates = this.drivableWaypoints();
    // Shuffle a bounded number of tries
    for (let i = 0; i < 100 && candidates.length > 0; i++) {
      const node = candidates[Math.floor(Math.random() * candidates.length)];
      let collides = false;
      for (const v of this.vehicles) {
        const dx = v.root.position.x - node.position.x;
        const dz = v.root.position.z - node.position.z;
        if (dx * dx + dz * dz < minD2) {
          collides = true;
          break;
        }
      }
      if (!collides) return { pos: node.position, node };
    }
    return null;
  }

  spawnOne(): Vehicle | null {
    const pick = this.pickFreeSpawn();
    if (!pick) return null;
    const v = new Vehicle(this.scene);
    const start = pick.node;
    const next = this.nextDrivableWaypoint(start, null);
    const dir = next.position.subtract(start.position);
    const yaw = Math.atan2(dir.x, dir.z);
    v.spawn(pick.pos, yaw);
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
    const wp = this.nearestDrivableWaypoint(v.root.position) ?? this.graph.nearest(v.root.position);
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

  private topUpAccum = 0;

  update(dt: number): void {
    this.topUpAccum += dt;
    if (this.topUpAccum > 2) {
      this.topUpAccum = 0;
      this.topUp();
    }
    const cruise = GameConfig.traffic.maxSpeed;
    for (const v of this.vehicles) {
      if (v === this.playerVehicle) continue;
      if (v.root.position.y < -5) {
        this.respawnVehicle(v);
        continue;
      }
      const state = this.stateFor(v);
      state.reverseCooldown = Math.max(0, state.reverseCooldown - dt);

      if (state.reverseFor > 0) {
        this.reverseVehicleTowardRoad(v, state, dt);
        this.trackMovement(v, state, dt, false);
        continue;
      }

      const route = this.resolveRouteTarget(v, state, dt);
      if (!route) {
        this.trackMovement(v, state, dt, false);
        continue;
      }

      const cur = route.waypoint;
      // Aim at current waypoint
      const target = cur.position;
      const dx = target.x - v.root.position.x;
      const dz = target.z - v.root.position.z;
      const targetYaw = Math.atan2(dx, dz);
      this.steerToward(v, targetYaw, dt, route.recoveringRoad ? RECOVERY_STEER_RATE : NORMAL_STEER_RATE);

      // Obstacle handling — combine forward raycast with explicit nearest-vehicle
      // distance so cars don't pile up at intersections where the raycast
      // grazes past another car's bumper. Hard blockers trigger a reverse
      // recovery, while NPC-like blockers only make traffic brake.
      state.obstacleProbeIn -= dt;
      if (state.obstacleProbeIn <= 0) this.updateObstacleProbe(v, state);

      const carAhead = this.distanceToNearestCarAhead(v);
      let block = state.blockDistance;
      let blockerKind = state.blockerKind;
      if (carAhead < block) {
        block = carAhead;
        blockerKind = 'vehicle';
      }

      const canReverse = shouldReverseForBlocker(blockerKind);
      if (canReverse && state.reverseCooldown <= 0 && (block < 3.2 || state.stuckFor >= GameConfig.traffic.stuckSeconds)) {
        this.startReverse(state);
        this.reverseVehicleTowardRoad(v, state, dt);
        this.trackMovement(v, state, dt, false);
        continue;
      }

      const targetCruise = route.recoveringRoad ? cruise * 0.55 : cruise;
      if (block < 4.5) v.speed = Math.max(0, v.speed - 30 * dt);
      else if (block < 9) v.speed = Math.max(0, v.speed - 10 * dt);
      else v.speed = Math.min(targetCruise, v.speed + 6 * dt);

      v.step(dt);
      this.trackMovement(v, state, dt, block >= 4.5 && Math.abs(v.speed) > 1.5);
    }
  }

  private stateFor(v: Vehicle): TrafficAIState {
    let state = this.aiState.get(v);
    if (!state) {
      state = {
        lastPos: v.root.position.clone(),
        stuckFor: 0,
        reverseFor: 0,
        reverseCooldown: 0,
        nearestRoad: null,
        centerlineDist: 0,
        routeProbeIn: Math.random() * ROUTE_PROBE_INTERVAL,
        blockDistance: Infinity,
        blockerKind: null,
        obstacleProbeIn: Math.random() * OBSTACLE_PROBE_INTERVAL,
      };
      this.aiState.set(v, state);
    }
    return state;
  }

  private resolveRouteTarget(v: Vehicle, state: TrafficAIState, dt: number): RouteTarget | null {
    if (this.graph.nodeArr.length === 0) return null;

    let cur = v.trafficCurrent ? this.graph.nodes.get(v.trafficCurrent) : null;
    state.routeProbeIn -= dt;
    if (!state.nearestRoad || state.routeProbeIn <= 0) this.updateRouteProbe(v, state);

    const nearest = state.nearestRoad ?? this.graph.nearest(v.root.position);
    if (!cur) {
      cur = nearest;
      v.trafficCurrent = cur.id;
      v.trafficPrev = null;
    }

    const currentDist = this.xzDistance(v.root.position, cur.position);
    const nearestWaypointDist = this.xzDistance(v.root.position, nearest.position);
    const badlyOffRoute = currentDist > 55 || nearestWaypointDist + 16 < currentDist;

    let recoveringRoad =
      badlyOffRoute ||
      state.centerlineDist > GameConfig.traffic.roadRetargetDistance;

    if (recoveringRoad) {
      cur = nearest;
      v.trafficCurrent = cur.id;
      v.trafficPrev = null;
    }

    const arriveDist = recoveringRoad ? 3.5 : 2.5;
    if (this.xzDistance(v.root.position, cur.position) < arriveDist) {
      const next = this.nextDrivableWaypoint(cur, v.trafficPrev);
      v.trafficPrev = cur.id;
      v.trafficCurrent = next.id;
      cur = next;
      recoveringRoad = false;
    }

    return { waypoint: cur, recoveringRoad };
  }

  private startReverse(state: TrafficAIState): void {
    state.reverseFor = GameConfig.traffic.reverseSeconds;
    state.stuckFor = 0;
  }

  private reverseVehicleTowardRoad(v: Vehicle, state: TrafficAIState, dt: number): void {
    state.reverseFor = Math.max(0, state.reverseFor - dt);
    if (this.graph.nodeArr.length > 0) {
      state.routeProbeIn -= dt;
      if (!state.nearestRoad || state.routeProbeIn <= 0) this.updateRouteProbe(v, state);
      const nearest = state.nearestRoad ?? this.graph.nearest(v.root.position);
      const distanceToRoad = this.xzDistance(v.root.position, nearest.position);
      if (distanceToRoad > 4) {
        // In reverse, velocity is opposite the car's forward vector, so face away
        // from the waypoint to back up toward the road centerline.
        this.steerToward(v, headingTo(v.root.position, nearest.position) + Math.PI, dt, REVERSE_STEER_RATE);
      }
    }
    v.speed = Math.max(GameConfig.traffic.reverseSpeed, v.speed - 18 * dt);
    v.step(dt);

    if (state.reverseFor <= 0) {
      v.speed = 0;
      state.reverseCooldown = 0.35;
      state.stuckFor = 0;
      this.retargetAwayFromObstacle(v);
    }
  }

  private retargetAwayFromObstacle(v: Vehicle): void {
    if (this.graph.nodeArr.length === 0) return;
    const nearest = this.nearestDrivableWaypoint(v.root.position) ?? this.graph.nearest(v.root.position);
    const away = v.forward().scale(-1);
    const next = this.bestNeighborInDirection(nearest, away, null);
    v.trafficPrev = nearest.id;
    v.trafficCurrent = next.id;
  }

  private bestNeighborInDirection(current: Waypoint, direction: Vector3, avoidId: string | null): Waypoint {
    let best: Waypoint | null = null;
    let bestScore = -Infinity;
    for (const id of current.links) {
      const node = this.graph.nodes.get(id);
      if (!node) continue;
      if (!this.isWaypointDrivable(node)) continue;
      const dx = node.position.x - current.position.x;
      const dz = node.position.z - current.position.z;
      const len = Math.hypot(dx, dz);
      if (len <= 0.001) continue;
      const dot = (dx / len) * direction.x + (dz / len) * direction.z;
      const score = dot + (id === avoidId ? -0.35 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }
    return best ?? this.graph.next(current, avoidId);
  }

  private nextDrivableWaypoint(current: Waypoint, prevId: string | null): Waypoint {
    const choices = current.links
      .filter((id) => id !== prevId)
      .map((id) => this.graph.nodes.get(id) ?? null)
      .filter((node): node is Waypoint => Boolean(node && this.isWaypointDrivable(node)));
    if (choices.length > 0) return choices[Math.floor(Math.random() * choices.length)];

    const fallback = current.links
      .map((id) => this.graph.nodes.get(id) ?? null)
      .filter((node): node is Waypoint => Boolean(node && this.isWaypointDrivable(node)));
    if (fallback.length > 0) return fallback[Math.floor(Math.random() * fallback.length)];

    return this.nearestDrivableWaypoint(current.position) ?? this.graph.next(current, prevId);
  }

  private drivableWaypoints(): Waypoint[] {
    if (!this.drivableWaypointIds || !this.drivableWaypointCache) {
      const ids = new Set<string>();
      for (const node of this.graph.nodeArr) {
        if (this.hasStreetSurfaceAt(node.position)) ids.add(node.id);
      }
      if (ids.size === 0) {
        for (const node of this.graph.nodeArr) ids.add(node.id);
      }
      this.drivableWaypointIds = ids;
      this.drivableWaypointCache = this.graph.nodeArr.filter((node) => ids.has(node.id));
    }
    return this.drivableWaypointCache;
  }

  private isWaypointDrivable(node: Waypoint): boolean {
    if (!this.drivableWaypointIds) this.drivableWaypoints();
    return this.drivableWaypointIds?.has(node.id) ?? false;
  }

  private nearestDrivableWaypoint(pos: Vector3): Waypoint | null {
    let best: Waypoint | null = null;
    let bestD = Infinity;
    for (const node of this.drivableWaypoints()) {
      const d = this.xzDistance(pos, node.position);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  private hasStreetSurfaceAt(pos: Vector3): boolean {
    const origin = new Vector3(pos.x, pos.y + 30, pos.z);
    const ray = new Ray(origin, new Vector3(0, -1, 0), 100);
    const hit = this.scene.pickWithRay(ray, (m) => {
      const kind = (m.metadata as { kind?: string } | null)?.kind;
      return isRoadSurface(kind);
    });
    return Boolean(hit?.pickedPoint);
  }

  private respawnVehicle(v: Vehicle): void {
    const pick = this.pickFreeSpawn();
    if (!pick) return;
    const next = this.nextDrivableWaypoint(pick.node, null);
    const yaw = headingTo(pick.node.position, next.position);
    v.spawn(pick.pos, yaw);
    v.speed = 0;
    v.trafficPrev = pick.node.id;
    v.trafficCurrent = next.id;
    const state = this.stateFor(v);
    state.lastPos.copyFrom(v.root.position);
    state.stuckFor = 0;
    state.reverseFor = 0;
    state.reverseCooldown = 0.5;
    state.nearestRoad = pick.node;
    state.centerlineDist = 0;
    state.routeProbeIn = ROUTE_PROBE_INTERVAL;
    state.blockDistance = Infinity;
    state.blockerKind = null;
    state.obstacleProbeIn = 0;
  }

  private updateRouteProbe(v: Vehicle, state: TrafficAIState): void {
    state.nearestRoad = this.nearestDrivableWaypoint(v.root.position);
    state.centerlineDist = this.distanceToRoadCenterline(v.root.position);
    state.routeProbeIn = ROUTE_PROBE_INTERVAL;
  }

  private updateObstacleProbe(v: Vehicle, state: TrafficAIState): void {
    const hit = v.raycastForwardHit(GameConfig.traffic.raycastDistance, v.id);
    state.blockDistance = hit?.distance ?? Infinity;
    state.blockerKind = hit?.kind ?? null;
    state.obstacleProbeIn = OBSTACLE_PROBE_INTERVAL;
  }

  private distanceToRoadCenterline(pos: Vector3): number {
    let best = Infinity;
    for (const segment of this.roadSegmentCache()) {
      best = Math.min(best, this.distanceToSegmentXZ(pos, segment.a, segment.b));
    }
    if (best < Infinity) return best;

    const nearest = this.nearestDrivableWaypoint(pos);
    return nearest ? this.xzDistance(pos, nearest.position) : Infinity;
  }

  private roadSegmentCache(): RoadSegment[] {
    if (!this.roadSegments) {
      const segments: RoadSegment[] = [];
      const seen = new Set<string>();
      for (const node of this.drivableWaypoints()) {
        for (const id of node.links) {
          const linked = this.graph.nodes.get(id);
          if (!linked || !this.isWaypointDrivable(linked)) continue;
          const key = node.id < linked.id ? `${node.id}:${linked.id}` : `${linked.id}:${node.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          segments.push({ a: node.position, b: linked.position });
        }
      }
      this.roadSegments = segments;
    }
    return this.roadSegments;
  }

  private distanceToSegmentXZ(p: Vector3, a: Vector3, b: Vector3): number {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const apx = p.x - a.x;
    const apz = p.z - a.z;
    const ab2 = abx * abx + abz * abz;
    if (ab2 <= 0.0001) return Math.hypot(apx, apz);
    const t = Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
    return Math.hypot(p.x - (a.x + abx * t), p.z - (a.z + abz * t));
  }

  private steerToward(v: Vehicle, targetYaw: number, dt: number, rate: number): void {
    let dy = targetYaw - v.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    v.yaw += Math.max(-rate * dt, Math.min(rate * dt, dy));
    v.root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), v.yaw);
  }

  private trackMovement(v: Vehicle, state: TrafficAIState, dt: number, shouldMove: boolean): void {
    const moved = this.xzDistance(v.root.position, state.lastPos);
    if (shouldMove) {
      const expected = Math.abs(v.speed) * dt;
      if (moved < Math.max(0.04, expected * 0.15)) {
        state.stuckFor += dt;
      } else {
        state.stuckFor = Math.max(0, state.stuckFor - dt * 2);
      }
    } else {
      state.stuckFor = Math.max(0, state.stuckFor - dt * 2);
    }
    state.lastPos.copyFrom(v.root.position);
  }

  private xzDistance(a: Vector3, b: Vector3): number {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }

  /**
   * Distance from `v` to the nearest other vehicle that lies in front of it.
   * "In front" = positive dot product with v's forward, within a narrow corridor.
   */
  private distanceToNearestCarAhead(v: Vehicle): number {
    let best = Infinity;
    const fwd = v.forward();
    const px = v.root.position.x;
    const pz = v.root.position.z;
    for (const o of this.vehicles) {
      if (o === v) continue;
      const dx = o.root.position.x - px;
      const dz = o.root.position.z - pz;
      const proj = dx * fwd.x + dz * fwd.z;
      if (proj <= 0) continue;
      const lat = Math.abs(dx * fwd.z - dz * fwd.x);
      if (lat > 2.6) continue; // not in our lane
      if (proj < best) best = proj;
    }
    return best;
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
