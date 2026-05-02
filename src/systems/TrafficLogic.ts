// Pure traffic helpers (waypoint routing / heading) — runtime TrafficSystem
// delegates to these for testability.

export type V2 = { x: number; z: number };

export type WaypointNode = {
  id: string;
  position: V2;
  links: string[];
};

export type WaypointGraphLite = {
  nodes: Map<string, WaypointNode>;
};

/** NPC-like blockers are soft targets: traffic may brake, but should not reverse away from them. */
export function isNpcLikeBlocker(kind: string | null | undefined): boolean {
  return kind === 'npc' || kind === 'police';
}

/** Static/world blockers and other cars should trigger unstuck reverse behavior. */
export function shouldReverseForBlocker(kind: string | null | undefined): boolean {
  return !isNpcLikeBlocker(kind);
}

/**
 * The imported city GLB labels some street slabs as sidewalk/curb meshes, so
 * traffic treats both road and sidewalk mesh kinds as valid physical street
 * surfaces. Lane-center recovery still comes from traffic waypoints.
 */
export function isRoadSurface(kind: string | null | undefined): boolean {
  return kind === 'road' || kind === 'sidewalk';
}

/** Pick a next waypoint biased away from `prevId` so the vehicle doesn't U-turn. */
export function nextWaypoint(
  graph: WaypointGraphLite,
  current: WaypointNode,
  prevId: string | null,
  rng: () => number = Math.random
): WaypointNode {
  if (current.links.length === 0) return current;
  const candidates = current.links.filter((id) => id !== prevId);
  const choices = candidates.length ? candidates : current.links;
  const id = choices[Math.floor(rng() * choices.length)];
  return graph.nodes.get(id) ?? current;
}

/** Yaw (rotation around Y axis) needed to face from `from` to `to`. */
export function headingTo(from: V2, to: V2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Apply throttle/braking with simple arcade physics, returning new speed. */
export function arcadeSpeedUpdate(
  current: number,
  throttle: number,
  brake: number,
  dt: number,
  cruise: number,
  accel = 6,
  decel = 30
): number {
  if (throttle > 0) return Math.min(cruise, current + accel * dt);
  if (brake > 0) return Math.max(0, current - decel * dt);
  return Math.max(0, current - accel * 0.4 * dt); // engine drag
}
