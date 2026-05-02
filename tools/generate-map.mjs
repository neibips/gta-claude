#!/usr/bin/env node
// Deterministic authored map layer over assets/maps/city_map.glb.
// Output: assets/maps/city-map.json.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outFile = resolve(root, 'assets/maps/city-map.json');

const SIZE = 600;
const HALF = SIZE / 2;
const PI2 = Math.PI / 2;
const ROAD_HALF = 9;
const WALK_WIDTH = 5;
const WALK_OFFSET = ROAD_HALF + WALK_WIDTH / 2 + 0.5;

const v3 = (x, y, z) => ({ x, y, z });
let idCounter = 0;
const nextId = (prefix) => `${prefix}_${(idCounter++).toString(36)}`;

const map = {
  version: 2,
  name: 'Procedural City GLB World',
  seed: 'city-glb-v3',
  size: { width: SIZE, height: SIZE },
  world: {
    description:
      'A 600x600 GTA-like world built around assets/maps/city_map.glb with exact mesh colliders for the imported city, authored road and sidewalk navigation, and a police station precinct on the southern map edge.',
    units: 'meters',
    playerPromise:
      'Drive on the marked city streets, walk NPC sidewalks, use the south-edge police precinct as a landmark, and fall to death when leaving the playable world.',
    pillars: [
      'Imported GLB city as the primary world geometry',
      'Mesh-accurate static building and street collision',
      'Separate traffic roads and pedestrian sidewalks',
      'Clear edge precinct landmark with police spawns',
      'Deterministic authored navigation and cover',
    ],
  },
  visualModel: {
    modelPath: 'assets/maps/city_map.glb',
    position: v3(0, 0, 0),
    scale: 2,
    collision: 'mesh',
    tags: ['primary-world', 'exact-colliders'],
  },
  districts: [
    {
      id: 'city',
      label: 'Imported City Core',
      kind: 'urban',
      center: v3(0, 0, 10),
      bounds: { minX: -260, maxX: 265, minZ: -210, maxZ: 225 },
      elevationRange: { min: 0, max: 225 },
      landmarkIds: ['poi_city_core', 'poi_rooftop_skyline'],
      tags: ['glb-city', 'dense', 'traffic'],
    },
    {
      id: 'village',
      label: 'North Residential Blocks',
      kind: 'urban',
      center: v3(150, 0, 155),
      bounds: { minX: 45, maxX: 265, minZ: 45, maxZ: 225 },
      elevationRange: { min: 0, max: 130 },
      landmarkIds: ['poi_north_blocks'],
      tags: ['residential', 'sidewalks'],
    },
    {
      id: 'factory',
      label: 'West Service Blocks',
      kind: 'industrial',
      center: v3(-160, 0, -35),
      bounds: { minX: -260, maxX: -45, minZ: -205, maxZ: 90 },
      elevationRange: { min: 0, max: 160 },
      landmarkIds: ['poi_west_service'],
      tags: ['service', 'alleys'],
    },
    {
      id: 'field',
      label: 'South Edge Precinct',
      kind: 'service',
      center: v3(0, 0, -255),
      bounds: { minX: -160, maxX: 160, minZ: -295, maxZ: -210 },
      elevationRange: { min: 0, max: 18 },
      landmarkIds: ['poi_edge_police', 'poi_field_shop'],
      tags: ['police', 'edge', 'spawn-hub'],
    },
  ],
  terrain: {
    baseMaterialId: 'asphalt',
    heightRange: { min: -24, max: 225 },
    patches: [
      {
        id: 'terrain_city_underlay',
        type: 'plateau',
        districtId: 'city',
        position: v3(0, -0.08, 5),
        size: { width: 540, length: 455, height: 0.08 },
        rotationY: 0,
        materialId: '#23282b',
        tags: ['under-glb'],
      },
      {
        id: 'terrain_precinct_pad',
        type: 'plateau',
        districtId: 'field',
        position: v3(0, 0, -268),
        size: { width: 170, length: 56, height: 0.2 },
        rotationY: 0,
        materialId: 'concrete',
        tags: ['police-forecourt'],
      },
      {
        id: 'terrain_precinct_ramp',
        type: 'ramp',
        districtId: 'field',
        position: v3(0, 0, -214),
        size: { width: 34, length: 48, height: 0.6 },
        rotationY: 0,
        materialId: 'asphalt',
        tags: ['edge-road-transition'],
      },
      {
        id: 'terrain_north_plaza',
        type: 'plateau',
        districtId: 'village',
        position: v3(178, 0, 238),
        size: { width: 98, length: 48, height: 0.12 },
        rotationY: 0,
        materialId: 'concrete',
        tags: ['shop-pad'],
      },
      {
        id: 'terrain_west_service',
        type: 'plateau',
        districtId: 'factory',
        position: v3(-218, 0, -118),
        size: { width: 82, length: 64, height: 0.12 },
        rotationY: 0,
        materialId: '#333638',
        tags: ['service-pad'],
      },
    ],
  },
  roads: [],
  sidewalks: [],
  buildings: [],
  trees: [],
  decorations: [],
  assetInstances: [],
  pois: [],
  npcWaypoints: [],
  trafficWaypoints: [],
  coverPoints: [],
  spawnPoints: { player: v3(0, 0, -252), npc: [], police: [], cars: [] },
};

function addRoad(type, districtId, x, y, z, width, length, rotationY, materialId = 'asphalt', tags = []) {
  const id = nextId('road');
  map.roads.push({
    id,
    type,
    districtId,
    position: v3(x, y, z),
    size: { width, length },
    rotationY,
    materialId,
    lanes: length >= 18 ? 2 : 1,
    speedLimit: type === 'arterial' ? 60 : 35,
    tags,
  });
  return id;
}

function addSidewalk(districtId, x, y, z, width, length, rotationY, tags = []) {
  const id = nextId('sw');
  map.sidewalks.push({
    id,
    districtId,
    position: v3(x, y, z),
    size: { width, length },
    rotationY,
    materialId: 'concrete',
    tags,
  });
  return id;
}

function addBuilding(districtId, type, x, y, z, width, depth, floors, materialId, modelPath, assetScale = 1, tags = []) {
  const id = nextId('bld');
  map.buildings.push({
    id,
    districtId,
    type,
    position: v3(x, y, z),
    size: { width, depth, height: Math.max(4, floors * 4) },
    floors,
    rotationY: 0,
    materialId,
    windowPattern: type === 'shop' ? 'shopfront' : type === 'police_station' ? 'grid' : 'sparse',
    modelPath,
    assetScale,
    elevationLayer: 'ground',
    accessibleLevels: [0],
    tags,
  });
  return id;
}

function addDeco(districtId, kind, x, y, z, rotationY = 0, scale = 1, tags = [], materialId) {
  const id = nextId('deco');
  map.decorations.push({
    id,
    districtId,
    kind,
    position: v3(x, y, z),
    rotationY,
    scale,
    materialId,
    tags,
  });
  return id;
}

function addTree(districtId, x, y, z, scale = 1, type = 'low_poly') {
  map.trees.push({ id: nextId('tree'), districtId, position: v3(x, y, z), scale, type });
}

function addAsset(id, districtId, category, role, x, y, z, size, opts = {}) {
  map.assetInstances.push({
    id,
    districtId,
    category,
    role,
    modelPath: opts.modelPath,
    primitive: opts.primitive,
    position: v3(x, y, z),
    rotationY: opts.rotationY ?? 0,
    scale: opts.scale ?? v3(1, 1, 1),
    size,
    materialId: opts.materialId,
    collision: opts.collision ?? 'box',
    tags: opts.tags ?? [],
  });
}

function addPoi(id, districtId, name, role, x, y, z, radius, entranceIds, reward, tags = []) {
  map.pois.push({
    id,
    districtId,
    name,
    role,
    position: v3(x, y, z),
    radius,
    entranceIds,
    reward,
    tags,
  });
}

function splitSegments(min, max, cuts, gap) {
  const segments = [];
  let start = min;
  for (const cut of [...cuts].sort((a, b) => a - b)) {
    const end = cut - gap;
    if (end - start >= 10) segments.push([start, end]);
    start = cut + gap;
  }
  if (max - start >= 10) segments.push([start, max]);
  return segments;
}

const xRoads = [-225, -72, 55, 248];
const zRoads = [-166, -76, 74, 196];
const xRouteCuts = [-248, ...xRoads, 0, 248].sort((a, b) => a - b);
const zRouteCuts = [-196, ...zRoads, 196].sort((a, b) => a - b);

// Navigation roads aligned to the GLB street grid. These are data-only; the
// imported GLB supplies the visible street surface and exact collision.
for (const z of zRoads) addRoad('arterial', 'city', 0, 0.02, z, 496, ROAD_HALF * 2, 0, 'asphalt', ['glb-road', 'nav-only']);
for (const x of xRoads) addRoad('arterial', 'city', x, 0.02, 0, 392, ROAD_HALF * 2, PI2, 'asphalt', ['glb-road', 'nav-only']);

// Visible extension to the police station placed on the southern world edge.
addRoad('service', 'field', 0, 0.04, -213, 94, 16, PI2, 'asphalt', ['edge-police-access']);
addRoad('service', 'field', 0, 0.04, -242, 240, 16, 0, 'asphalt', ['edge-police-frontage']);

// Sidewalks are split around perpendicular road boxes, so they never overlap
// road colliders while still tracing both sides of every drivable street.
for (const z of zRoads) {
  for (const side of [-1, 1]) {
    const sz = z + side * WALK_OFFSET;
    for (const [x0, x1] of splitSegments(-248, 248, [...xRoads, 0], 11)) {
      addSidewalk('city', (x0 + x1) / 2, 0.08, sz, x1 - x0, WALK_WIDTH, 0, ['glb-sidewalk', 'nav-only']);
    }
  }
}
for (const x of xRoads) {
  for (const side of [-1, 1]) {
    const sx = x + side * WALK_OFFSET;
    for (const [z0, z1] of splitSegments(-196, 196, zRoads, 11)) {
      addSidewalk('city', sx, 0.08, (z0 + z1) / 2, z1 - z0, WALK_WIDTH, PI2, ['glb-sidewalk', 'nav-only']);
    }
  }
}
for (const side of [-1, 1]) {
  const sx = side * 11;
  for (const [z0, z1] of splitSegments(-260, -166, [-242, -166], 10)) {
    addSidewalk('field', sx, 0.09, (z0 + z1) / 2, z1 - z0, WALK_WIDTH, PI2, ['edge-sidewalk']);
  }
  const sz = -242 + side * 11;
  for (const [x0, x1] of splitSegments(-120, 120, [0], 10)) {
    addSidewalk('field', (x0 + x1) / 2, 0.09, sz, x1 - x0, WALK_WIDTH, 0, ['edge-sidewalk']);
  }
}

// Authored edge buildings. GLB city buildings are imported via visualModel;
// these are the extra playable landmarks added at the map boundary.
const edgePolice = addBuilding(
  'field',
  'police_station',
  0,
  0.2,
  -276,
  60,
  24,
  4,
  '#243f74',
  'assets/building/police_station.glb',
  1,
  ['police', 'edge-station', 'main-precinct']
);
const cityShop = addBuilding(
  'city',
  'shop',
  190,
  0.15,
  232,
  32,
  22,
  2,
  '#b84b39',
  'assets/building/shop.glb',
  1,
  ['shop', 'north-edge']
);
const fieldShop = addBuilding(
  'field',
  'shop',
  -104,
  0.15,
  -270,
  30,
  20,
  1,
  '#c69a48',
  'assets/building/roadside_shop.glb',
  1,
  ['shop', 'roadside']
);

// Edge precinct dressing and cover props.
for (const x of [-62, -38, 38, 62]) addDeco('field', 'barrier', x, 0.2, -253, 0, 1, ['police']);
for (const x of [-82, 82]) addDeco('field', 'sign', x, 0.2, -248, 0, 1, ['police']);
for (const x of [-74, 74]) addDeco('field', 'lamp', x, 0.2, -262, 0, 1, ['police']);
addDeco('field', 'trash_bin', -24, 0.2, -258, 0, 1, ['police']);
addDeco('field', 'bench', 26, 0.2, -258, 0, 1, ['police']);
addDeco('city', 'sign', 190, 0.15, 212, 0, 1, ['shop']);
addDeco('field', 'sign', -104, 0.15, -248, 0, 1, ['shop', 'field']);

for (const [x, z, s] of [
  [-136, -286, 1.1],
  [-132, -234, 1],
  [132, -286, 1.1],
  [136, -234, 1],
  [216, 238, 0.9],
  [-230, -218, 0.85],
]) {
  addTree(x > 120 || z > 210 ? 'city' : 'field', x, 0.1, z, s, x > 120 ? 'park_tree' : 'pine_cluster');
}

addAsset('asset_precinct_fence_left', 'field', 'environment', 'police edge fence left', -92, 0.2, -276, { width: 5, depth: 1, height: 2 }, {
  modelPath: 'assets/environment/fence.glb',
  scale: v3(1.2, 1.2, 1.2),
  collision: 'box',
  tags: ['police', 'edge'],
});
addAsset('asset_precinct_fence_right', 'field', 'environment', 'police edge fence right', 92, 0.2, -276, { width: 5, depth: 1, height: 2 }, {
  modelPath: 'assets/environment/fence.glb',
  scale: v3(1.2, 1.2, 1.2),
  collision: 'box',
  tags: ['police', 'edge'],
});
addAsset('asset_precinct_bench_glb', 'field', 'environment', 'police forecourt bench', 26, 0.2, -258, { width: 3, depth: 1, height: 1 }, {
  modelPath: 'assets/environment/bench.glb',
  scale: v3(1, 1, 1),
  collision: 'box',
  tags: ['police'],
});
addAsset('asset_precinct_tree_glb', 'field', 'vegetation', 'edge precinct tree', 126, 0.2, -252, { width: 5, depth: 5, height: 7 }, {
  modelPath: 'assets/environment/tree.glb',
  scale: v3(1.1, 1.1, 1.1),
  collision: 'cylinder',
  tags: ['edge', 'tree'],
});

addPoi('poi_edge_police', 'field', 'South Edge Police Station', 'police', 0, 0.2, -276, 42, [edgePolice], 'police response spawn', ['required', 'edge']);
addPoi('poi_city_shop', 'city', 'North City Shop', 'shop', 190, 0.15, 232, 24, [cityShop], 'urban supplies', ['required']);
addPoi('poi_field_shop', 'field', 'South Roadside Shop', 'shop', -104, 0.15, -270, 24, [fieldShop], 'road trip stop', ['required']);
addPoi('poi_city_core', 'city', 'Imported City Road Grid', 'landmark', -20, 0, 8, 120, ['assets/maps/city_map.glb'], 'main road loop', ['glb']);
addPoi('poi_rooftop_skyline', 'city', 'High-Rise Skyline', 'vista', -135, 112, 105, 75, ['assets/maps/city_map.glb'], 'orientation landmark', ['skyline']);
addPoi('poi_north_blocks', 'village', 'North Residential Blocks', 'yard', 160, 0, 160, 55, ['assets/maps/city_map.glb'], 'pedestrian loop', ['sidewalk']);
addPoi('poi_west_service', 'factory', 'West Service Blocks', 'factory', -185, 0, -95, 60, ['assets/maps/city_map.glb'], 'service approach', ['alley']);

const wpByType = { npc: new Map(), traffic: new Map() };

function wpKey(type, x, z) {
  return `${type}:${Math.round(x * 10) / 10}:${Math.round(z * 10) / 10}`;
}

function getWP(type, districtId, x, y, z, tags = []) {
  const key = wpKey(type, x, z);
  const mapForType = wpByType[type];
  if (mapForType.has(key)) return mapForType.get(key);
  const wp = {
    id: nextId(type === 'npc' ? 'wp' : 'twp'),
    districtId,
    position: v3(x, y + 0.1, z),
    links: [],
    type,
    tags,
  };
  mapForType.set(key, wp);
  if (type === 'npc') map.npcWaypoints.push(wp);
  else map.trafficWaypoints.push(wp);
  return wp;
}

function link(a, b) {
  if (!a.links.includes(b.id)) a.links.push(b.id);
  if (!b.links.includes(a.id)) b.links.push(a.id);
}

function addLine(type, districtId, x1, y1, z1, x2, y2, z2, step = 32, tags = []) {
  const dist = Math.hypot(x2 - x1, z2 - z1);
  const count = Math.max(1, Math.ceil(dist / step));
  let prev = null;
  const nodes = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const wp = getWP(type, districtId, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, z1 + (z2 - z1) * t, tags);
    nodes.push(wp);
    if (prev) link(prev, wp);
    prev = wp;
  }
  return nodes;
}

function addBrokenLine(type, districtId, points, step, tags = []) {
  for (let i = 0; i < points.length - 1; i++) {
    addLine(type, districtId, points[i].x, points[i].y, points[i].z, points[i + 1].x, points[i + 1].y, points[i + 1].z, step, tags);
  }
}

for (const z of zRoads) {
  addBrokenLine('traffic', 'city', xRouteCuts.map((x) => v3(x, 0, z)), 34, ['road-grid']);
}
for (const x of xRoads) {
  addBrokenLine('traffic', 'city', zRouteCuts.map((z) => v3(x, 0, z)), 34, ['road-grid']);
}
addBrokenLine('traffic', 'field', [v3(0, 0, -260), v3(0, 0, -242), v3(0, 0, -166)], 28, ['edge-police-access']);
addBrokenLine('traffic', 'field', [v3(-120, 0, -242), v3(0, 0, -242), v3(120, 0, -242)], 30, ['edge-police-frontage']);

// Pedestrian paths are authored from sidewalk rectangles so every waypoint is
// physically on a sidewalk and not on the drivable road surface.
for (const sw of map.sidewalks) {
  const horizontal = Math.abs(Math.sin(sw.rotationY)) < 0.5;
  const long = sw.size.width;
  if (long < 12) continue;
  if (horizontal) {
    addLine('npc', sw.districtId, sw.position.x - long / 2 + 1, sw.position.y, sw.position.z, sw.position.x + long / 2 - 1, sw.position.y, sw.position.z, 24, sw.tags ?? []);
  } else {
    addLine('npc', sw.districtId, sw.position.x, sw.position.y, sw.position.z - long / 2 + 1, sw.position.x, sw.position.y, sw.position.z + long / 2 - 1, 24, sw.tags ?? []);
  }
}

function addCover(districtId, x, y, z, dx, dz, type) {
  const len = Math.hypot(dx, dz) || 1;
  map.coverPoints.push({
    id: nextId('cov'),
    districtId,
    position: v3(x, y, z),
    direction: v3(dx / len, 0, dz / len),
    type,
  });
}

for (const b of map.buildings) {
  const w = b.size.width / 2 + 0.7;
  const d = b.size.depth / 2 + 0.7;
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    addCover(
      b.districtId,
      b.position.x + dx * w,
      b.position.y,
      b.position.z + dz * d,
      dx,
      dz,
      b.type === 'police_station' ? 'police_station' : 'building_corner'
    );
  }
}
for (const d of map.decorations) {
  if (['barrier', 'bench', 'fence'].includes(d.kind)) {
    addCover(d.districtId, d.position.x, d.position.y, d.position.z, -Math.sin(d.rotationY), -Math.cos(d.rotationY), d.kind === 'fence' ? 'fence' : 'decoration');
  }
}
for (const a of map.assetInstances) {
  if (a.collision !== 'none') addCover(a.districtId, a.position.x, a.position.y, a.position.z, 1, 0, a.category === 'terrain' ? 'terrain' : 'prop');
}

map.spawnPoints.player = v3(0, 0.2, -252);
map.spawnPoints.npc = [
  v3(-236.5, 0.08, -178.5),
  v3(-83.5, 0.08, -88.5),
  v3(43.5, 0.08, 86.5),
  v3(236.5, 0.08, 183.5),
  v3(-213.5, 0.08, 196),
  v3(66.5, 0.08, -166),
  v3(-11, 0.09, -252),
  v3(11, 0.09, -231),
];
map.spawnPoints.police = [
  v3(-22, 0.2, -256),
  v3(22, 0.2, -256),
  v3(-12, 0.2, -286),
  v3(12, 0.2, -286),
];
map.spawnPoints.cars = [
  v3(-225, 0, -166),
  v3(-72, 0, -76),
  v3(55, 0, 74),
  v3(248, 0, 196),
  v3(0, 0, -242),
  v3(0, 0, -196),
];

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(map, null, 2), 'utf8');
console.log(
  `Wrote ${outFile}\n  visual=${map.visualModel.modelPath} scale=${map.visualModel.scale} size=${map.size.width}x${map.size.height} districts=${map.districts.length} roads=${map.roads.length} sidewalks=${map.sidewalks.length} buildings=${map.buildings.length} trees=${map.trees.length} deco=${map.decorations.length} assets=${map.assetInstances.length}\n  npcWPs=${map.npcWaypoints.length} trafficWPs=${map.trafficWaypoints.length} cover=${map.coverPoints.length}`
);
}\n  npcWPs=${map.npcWaypoints.length} trafficWPs=${map.trafficWaypoints.length} cover=${map.coverPoints.length}`
);
