import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { SavedWaypoint } from '../types/map';

export type Waypoint = {
  id: string;
  position: Vector3;
  links: string[];
};

export class WaypointGraph {
  readonly nodes: Map<string, Waypoint>;
  readonly nodeArr: Waypoint[];

  constructor(saved: SavedWaypoint[]) {
    this.nodes = new Map();
    this.nodeArr = saved.map((w) => {
      const wp: Waypoint = {
        id: w.id,
        position: new Vector3(w.position.x, w.position.y, w.position.z),
        links: w.links.slice(),
      };
      this.nodes.set(wp.id, wp);
      return wp;
    });
  }

  random(rng: () => number = Math.random): Waypoint {
    return this.nodeArr[Math.floor(rng() * this.nodeArr.length)];
  }

  /** Nearest node to a world position. */
  nearest(p: Vector3): Waypoint {
    let best = this.nodeArr[0];
    let bestD = Infinity;
    for (const w of this.nodeArr) {
      const d = Vector3.DistanceSquared(w.position, p);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  /** Random neighbor of a node, biased to advance away from `from`. */
  next(current: Waypoint, prevId: string | null, rng: () => number = Math.random): Waypoint {
    if (current.links.length === 0) return current;
    const candidates = current.links.filter((id) => id !== prevId);
    const choices = candidates.length ? candidates : current.links;
    const id = choices[Math.floor(rng() * choices.length)];
    return this.nodes.get(id) ?? current;
  }
}
