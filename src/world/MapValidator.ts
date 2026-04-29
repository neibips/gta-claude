import type { CityMapFile } from '../types/map';

const SUPPORTED_VERSION = 1;
const EXPECTED_SIZE = 200;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

function isV3(v: unknown): boolean {
  return (
    isObj(v) &&
    typeof v.x === 'number' &&
    typeof v.y === 'number' &&
    typeof v.z === 'number'
  );
}

export class MapValidator {
  /** Returns a list of validation errors. Empty array = valid. */
  static validate(raw: unknown): string[] {
    const errs: string[] = [];
    if (!isObj(raw)) return ['root is not an object'];
    if (raw.version !== SUPPORTED_VERSION)
      errs.push(`unsupported version ${String(raw.version)} (expected ${SUPPORTED_VERSION})`);

    const size = raw.size as { width?: number; height?: number } | undefined;
    if (!isObj(size) || size.width !== EXPECTED_SIZE || size.height !== EXPECTED_SIZE) {
      errs.push(`size must be ${EXPECTED_SIZE}x${EXPECTED_SIZE}`);
    }

    for (const key of [
      'roads',
      'sidewalks',
      'buildings',
      'trees',
      'decorations',
      'npcWaypoints',
      'trafficWaypoints',
      'coverPoints',
    ] as const) {
      if (!Array.isArray((raw as Record<string, unknown>)[key])) {
        errs.push(`missing or invalid array: ${key}`);
      }
    }

    const roads = (raw.roads as unknown[]) ?? [];
    if (roads.length === 0) errs.push('no roads');
    const sidewalks = (raw.sidewalks as unknown[]) ?? [];
    if (sidewalks.length === 0) errs.push('no sidewalks');
    const buildings = (raw.buildings as Array<{ type?: string }>) ?? [];
    if (buildings.length === 0) errs.push('no buildings');
    if (!buildings.some((b) => b?.type === 'police_station'))
      errs.push('police_station building required');

    const trees = (raw.trees as unknown[]) ?? [];
    if (trees.length < 8 || trees.length > 12)
      errs.push(`trees count must be 8..12 (got ${trees.length})`);

    const npcWPs = (raw.npcWaypoints as Array<{ id?: string; links?: string[] }>) ?? [];
    if (npcWPs.length === 0) errs.push('no NPC waypoints');
    const trafficWPs = (raw.trafficWaypoints as Array<{ id?: string; links?: string[] }>) ?? [];
    if (trafficWPs.length === 0) errs.push('no traffic waypoints');
    const cover = (raw.coverPoints as unknown[]) ?? [];
    if (cover.length === 0) errs.push('no cover points');

    // Spawn points
    const sp = (raw.spawnPoints as Record<string, unknown>) ?? {};
    if (!isV3(sp.player)) errs.push('spawnPoints.player invalid');
    if (!Array.isArray(sp.npc) || (sp.npc as unknown[]).length === 0)
      errs.push('spawnPoints.npc empty');
    if (!Array.isArray(sp.police) || (sp.police as unknown[]).length === 0)
      errs.push('spawnPoints.police empty');
    if (!Array.isArray(sp.cars) || (sp.cars as unknown[]).length === 0)
      errs.push('spawnPoints.cars empty');

    // Waypoint links must reference existing nodes.
    const npcIds = new Set(npcWPs.map((w) => w.id));
    for (const w of npcWPs) {
      for (const l of w.links ?? []) {
        if (!npcIds.has(l)) errs.push(`npcWaypoint ${w.id} links to missing ${l}`);
      }
    }
    const tIds = new Set(trafficWPs.map((w) => w.id));
    for (const w of trafficWPs) {
      for (const l of w.links ?? []) {
        if (!tIds.has(l)) errs.push(`trafficWaypoint ${w.id} links to missing ${l}`);
      }
    }

    // Building / road overlap heuristic: building bbox must not overlap any road bbox by more than a tiny margin.
    const roadsArr = (raw.roads as Array<{
      position?: { x: number; z: number };
      size?: { width: number; length: number };
      rotationY?: number;
    }>) ?? [];
    for (const b of buildings as Array<{
      id?: string;
      position?: { x: number; z: number };
      size?: { width: number; depth: number };
    }>) {
      if (!b.position || !b.size) continue;
      const bx0 = b.position.x - b.size.width / 2;
      const bx1 = b.position.x + b.size.width / 2;
      const bz0 = b.position.z - b.size.depth / 2;
      const bz1 = b.position.z + b.size.depth / 2;
      for (const r of roadsArr) {
        if (!r.position || !r.size) continue;
        const rotated = ((r.rotationY ?? 0) % Math.PI) > 0.01;
        const rw = rotated ? r.size.length : r.size.width;
        const rl = rotated ? r.size.width : r.size.length;
        const rx0 = r.position.x - rw / 2;
        const rx1 = r.position.x + rw / 2;
        const rz0 = r.position.z - rl / 2;
        const rz1 = r.position.z + rl / 2;
        const overlapX = Math.max(0, Math.min(bx1, rx1) - Math.max(bx0, rx0));
        const overlapZ = Math.max(0, Math.min(bz1, rz1) - Math.max(bz0, rz0));
        if (overlapX > 0.5 && overlapZ > 0.5) {
          errs.push(`building ${b.id} overlaps a road`);
          break;
        }
      }
    }

    return errs;
  }
}
