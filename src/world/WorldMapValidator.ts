const SUPPORTED_VERSION = 2;
const MIN_WORLD_SIZE = 600;
const REQUIRED_DISTRICTS = ['city', 'village', 'factory', 'field'] as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object';

const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

const isStr = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0;

function isV3(v: unknown): v is { x: number; y: number; z: number } {
  return isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z);
}

function arrayOf(raw: Record<string, unknown>, key: string, errs: string[]): unknown[] {
  const value = raw[key];
  if (!Array.isArray(value)) {
    errs.push(`missing or invalid array: ${key}`);
    return [];
  }
  return value;
}

function halfExtents(raw: Record<string, unknown>): { halfX: number; halfZ: number } | null {
  const size = raw.size;
  if (!isObj(size) || !isNum(size.width) || !isNum(size.height)) return null;
  return { halfX: size.width / 2, halfZ: size.height / 2 };
}

function isInsideWorld(
  p: { x: number; z: number },
  bounds: { halfX: number; halfZ: number },
  margin = 1
): boolean {
  return (
    p.x >= -bounds.halfX - margin &&
    p.x <= bounds.halfX + margin &&
    p.z >= -bounds.halfZ - margin &&
    p.z <= bounds.halfZ + margin
  );
}

function footprint(item: {
  position?: { x: number; z: number };
  size?: { width?: number; depth?: number; length?: number };
  rotationY?: number;
}): { x0: number; x1: number; z0: number; z1: number } | null {
  if (!item.position || !item.size) return null;
  const rot = item.rotationY ?? 0;
  const swapsAxis = Math.abs(Math.sin(rot)) > Math.abs(Math.cos(rot));
  const rawW = item.size.width ?? 0;
  const rawD = item.size.depth ?? item.size.length ?? 0;
  const w = swapsAxis ? rawD : rawW;
  const d = swapsAxis ? rawW : rawD;
  return {
    x0: item.position.x - w / 2,
    x1: item.position.x + w / 2,
    z0: item.position.z - d / 2,
    z1: item.position.z + d / 2,
  };
}

function overlapArea(
  a: { x0: number; x1: number; z0: number; z1: number },
  b: { x0: number; x1: number; z0: number; z1: number }
): number {
  const overlapX = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const overlapZ = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  return overlapX * overlapZ;
}

function containsPoint(
  box: { x0: number; x1: number; z0: number; z1: number },
  p: { x: number; z: number },
  margin = 0
): boolean {
  return (
    p.x >= box.x0 - margin &&
    p.x <= box.x1 + margin &&
    p.z >= box.z0 - margin &&
    p.z <= box.z1 + margin
  );
}

function hasModelPath(v: unknown): v is { modelPath: string } {
  return isObj(v) && isStr(v.modelPath);
}

function validateWaypointLinks(
  label: string,
  waypoints: Array<{ id?: string; links?: string[] }>,
  errs: string[]
): void {
  if (waypoints.length === 0) {
    errs.push(`no ${label} waypoints`);
    return;
  }
  const ids = new Set<string>();
  for (const w of waypoints) {
    if (!isStr(w.id)) errs.push(`${label} waypoint missing id`);
    else if (ids.has(w.id)) errs.push(`duplicate ${label} waypoint id: ${w.id}`);
    else ids.add(w.id);
    if (!Array.isArray(w.links)) errs.push(`${label} waypoint ${String(w.id)} links invalid`);
  }
  for (const w of waypoints) {
    for (const l of w.links ?? []) {
      if (!ids.has(l)) errs.push(`${label} waypoint ${String(w.id)} links to missing ${l}`);
    }
  }
}

export class WorldMapValidator {
  /** Returns a list of validation errors. Empty array = valid. */
  static validate(raw: unknown): string[] {
    const errs: string[] = [];
    if (!isObj(raw)) return ['root is not an object'];

    if (raw.version !== SUPPORTED_VERSION) {
      errs.push(`unsupported version ${String(raw.version)} (expected ${SUPPORTED_VERSION})`);
    }

    const size = raw.size as { width?: unknown; height?: unknown } | undefined;
    if (!isObj(size) || !isNum(size.width) || !isNum(size.height)) {
      errs.push('size must be numeric');
    } else if (size.width < MIN_WORLD_SIZE || size.height < MIN_WORLD_SIZE) {
      errs.push(`size must be at least ${MIN_WORLD_SIZE}x${MIN_WORLD_SIZE}`);
    }

    const bounds = halfExtents(raw);

    const visualModel = raw.visualModel;
    const hasVisualModel = isObj(visualModel) && isStr(visualModel.modelPath);
    if (visualModel !== undefined) {
      if (!isObj(visualModel)) {
        errs.push('visualModel must be an object');
      } else {
        if (!isStr(visualModel.modelPath) || !visualModel.modelPath.startsWith('assets/maps/')) {
          errs.push('visualModel.modelPath must point to assets/maps');
        }
        if (!isV3(visualModel.position)) errs.push('visualModel.position invalid');
        if (!isNum(visualModel.scale) || visualModel.scale <= 0) errs.push('visualModel.scale must be positive');
        if (visualModel.collision !== 'mesh' && visualModel.collision !== 'none') {
          errs.push('visualModel.collision must be mesh or none');
        }
      }
    }

    const world = raw.world;
    if (!isObj(world)) {
      errs.push('world metadata required');
    } else {
      if (!isStr(world.description)) errs.push('world.description required');
      if (!Array.isArray(world.pillars) || world.pillars.length < 3) {
        errs.push('world.pillars must include at least 3 design pillars');
      }
    }

    const districts = arrayOf(raw, 'districts', errs) as Array<{
      id?: string;
      center?: unknown;
      bounds?: { minX?: number; maxX?: number; minZ?: number; maxZ?: number };
      elevationRange?: { min?: number; max?: number };
      landmarkIds?: unknown;
    }>;
    const districtIds = new Set(districts.map((d) => d.id).filter(isStr));
    for (const id of REQUIRED_DISTRICTS) {
      if (!districtIds.has(id)) errs.push(`required district missing: ${id}`);
    }
    for (const d of districts) {
      if (!isStr(d.id)) errs.push('district missing id');
      if (!isV3(d.center)) errs.push(`district ${String(d.id)} center invalid`);
      if (
        !isObj(d.bounds) ||
        !isNum(d.bounds.minX) ||
        !isNum(d.bounds.maxX) ||
        !isNum(d.bounds.minZ) ||
        !isNum(d.bounds.maxZ) ||
        d.bounds.minX >= d.bounds.maxX ||
        d.bounds.minZ >= d.bounds.maxZ
      ) {
        errs.push(`district ${String(d.id)} bounds invalid`);
      }
      if (
        !isObj(d.elevationRange) ||
        !isNum(d.elevationRange.min) ||
        !isNum(d.elevationRange.max) ||
        d.elevationRange.min > d.elevationRange.max
      ) {
        errs.push(`district ${String(d.id)} elevationRange invalid`);
      }
      if (!Array.isArray(d.landmarkIds)) errs.push(`district ${String(d.id)} landmarkIds invalid`);
      if (bounds && isV3(d.center) && !isInsideWorld(d.center, bounds)) {
        errs.push(`district ${String(d.id)} center outside world bounds`);
      }
    }

    const terrain = raw.terrain;
    if (!isObj(terrain)) {
      errs.push('terrain profile required');
    } else {
      const range = terrain.heightRange;
      if (!isObj(range) || !isNum(range.min) || !isNum(range.max) || range.max - range.min < 8) {
        errs.push('terrain.heightRange must span at least 8 meters');
      }
      // Patches are optional in GLB-only worlds; nothing else to enforce.
    }

    const roads = arrayOf(raw, 'roads', errs) as Array<{
      id?: string;
      districtId?: string;
      position?: { x: number; y: number; z: number };
      size?: { width: number; length: number };
      rotationY?: number;
      tags?: string[];
    }>;
    const sidewalks = arrayOf(raw, 'sidewalks', errs);
    const buildings = arrayOf(raw, 'buildings', errs) as Array<{
      id?: string;
      districtId?: string;
      type?: string;
      position?: { x: number; y: number; z: number };
      size?: { width: number; depth: number; height: number };
      rotationY?: number;
      tags?: string[];
      modelPath?: string;
    }>;
    const trees = arrayOf(raw, 'trees', errs);
    const decorations = arrayOf(raw, 'decorations', errs);
    const assetInstances = arrayOf(raw, 'assetInstances', errs);
    const pois = arrayOf(raw, 'pois', errs) as Array<{
      id?: string;
      districtId?: string;
      role?: string;
      position?: unknown;
    }>;
    const npcWPs = arrayOf(raw, 'npcWaypoints', errs) as Array<{ id?: string; links?: string[] }>;
    const trafficWPs = arrayOf(raw, 'trafficWaypoints', errs) as Array<{ id?: string; links?: string[] }>;
    const cover = arrayOf(raw, 'coverPoints', errs);

    if (roads.length < 8) errs.push('large world requires at least 8 road segments');
    if (sidewalks.length < 8) errs.push('large world requires at least 8 sidewalk segments');
    // Buildings, trees, decorations and asset instances are optional in
    // GLB-only worlds — the imported model provides all visible geometry.
    if (cover.length === 0) errs.push('no cover points');

    for (const item of [...buildings, ...decorations, ...assetInstances]) {
      if (hasModelPath(item) && !item.modelPath.startsWith('assets/')) {
        errs.push(`asset path must be relative assets path: ${item.modelPath}`);
      }
    }

    for (const collection of [
      ['road', roads],
      ['building', buildings],
      ['poi', pois],
    ] as const) {
      const [label, items] = collection;
      for (const item of items) {
        if (isObj(item.position) && isV3(item.position) && bounds && !isInsideWorld(item.position, bounds, 8)) {
          errs.push(`${label} ${String(item.id)} outside world bounds`);
        }
      }
    }

    validateWaypointLinks('npc', npcWPs, errs);
    validateWaypointLinks('traffic', trafficWPs, errs);

    const roadBoxes = roads.flatMap((r) => {
      if ((r.tags ?? []).includes('overpass')) return [];
      const box = footprint(r);
      return box ? [{ id: r.id, box }] : [];
    });
    const sidewalkBoxes = (sidewalks as Array<{
      id?: string;
      position?: { x: number; z: number };
      size?: { width: number; length: number };
      rotationY?: number;
    }>).flatMap((s) => {
      const box = footprint(s);
      return box ? [{ id: s.id, box }] : [];
    });
    for (const s of sidewalkBoxes) {
      for (const r of roadBoxes) {
        if (overlapArea(s.box, r.box) > 0.25) {
          errs.push(`sidewalk ${String(s.id)} overlaps road ${String(r.id)}`);
          break;
        }
      }
    }
    for (const b of buildings) {
      if ((b.tags ?? []).includes('over-road')) continue;
      const bb = footprint(b);
      if (!bb) continue;
      for (const r of roadBoxes) {
        if (overlapArea(bb, r.box) > 1) {
          errs.push(`building ${String(b.id)} overlaps road ${String(r.id)}`);
          break;
        }
      }
    }

    for (const w of trafficWPs as Array<{ id?: string; position?: unknown }>) {
      if (!isV3(w.position)) {
        errs.push(`traffic waypoint ${String(w.id)} position invalid`);
        continue;
      }
      if (!roadBoxes.some((r) => containsPoint(r.box, w.position as { x: number; z: number }, 1.5))) {
        errs.push(`traffic waypoint ${String(w.id)} is not on a road`);
      }
    }

    for (const w of npcWPs as Array<{ id?: string; position?: unknown }>) {
      if (!isV3(w.position)) {
        errs.push(`npc waypoint ${String(w.id)} position invalid`);
        continue;
      }
      if (!sidewalkBoxes.some((s) => containsPoint(s.box, w.position as { x: number; z: number }, 1.5))) {
        errs.push(`npc waypoint ${String(w.id)} is not on a sidewalk`);
      }
    }

    const sp = (raw.spawnPoints as Record<string, unknown>) ?? {};
    if (!isV3(sp.player)) errs.push('spawnPoints.player invalid');
    if (!Array.isArray(sp.npc) || sp.npc.length < 4) errs.push('spawnPoints.npc must include at least 4 points');
    if (!Array.isArray(sp.police) || sp.police.length < 2) errs.push('spawnPoints.police must include at least 2 points');
    if (!Array.isArray(sp.cars) || sp.cars.length < 4) errs.push('spawnPoints.cars must include at least 4 points');

    return errs;
  }
}
