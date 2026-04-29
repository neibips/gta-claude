#!/usr/bin/env node
// Deterministic city-map generator. Run via `npm run generate:map`.
// Output: assets/maps/city-map.json (200x200 district).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outFile = resolve(root, 'assets/maps/city-map.json');

const SIZE = 200;
const HALF = SIZE / 2;

// Mulberry32 PRNG seeded for reproducibility
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xC1742026);
const rrange = (a, b) => a + rand() * (b - a);
const rint = (a, b) => Math.floor(rrange(a, b + 1));

const v3 = (x, y, z) => ({ x, y, z });

let idCounter = 0;
const nextId = (prefix) => `${prefix}_${(idCounter++).toString(36)}`;

const map = {
  version: 1,
  name: 'Distrito 6',
  seed: '0xC1742026',
  size: { width: SIZE, height: SIZE },
  roads: [],
  sidewalks: [],
  buildings: [],
  trees: [],
  decorations: [],
  npcWaypoints: [],
  trafficWaypoints: [],
  coverPoints: [],
  spawnPoints: { player: v3(0, 0.05, 0), npc: [], police: [], cars: [] },
};

// ─── ROADS ────────────────────────────────────────────────────────────────────
// Perimeter ring (4 segments + 4 corner intersections), inner cross.
const PERIMETER_W = 18;
const INNER_W = 14;
const PERI_OFFSET = HALF - PERIMETER_W / 2;

// Perimeter segments
function pushRoad(type, x, z, w, l, ry, materialId = 'asphalt') {
  map.roads.push({
    id: nextId('road'),
    type,
    position: v3(x, 0, z),
    size: { width: w, length: l },
    rotationY: ry,
    materialId,
  });
}
// 4 perimeter strips (north / south / east / west). Use length = SIZE so corners overlap as intersections.
pushRoad('perimeter', 0, PERI_OFFSET, SIZE, PERIMETER_W, 0); // north
pushRoad('perimeter', 0, -PERI_OFFSET, SIZE, PERIMETER_W, 0); // south
pushRoad('perimeter', PERI_OFFSET, 0, SIZE, PERIMETER_W, Math.PI / 2); // east (rotated)
pushRoad('perimeter', -PERI_OFFSET, 0, SIZE, PERIMETER_W, Math.PI / 2); // west

// Inner cross (one east-west, one north-south). Lengths shortened so they don't poke past perimeter.
const INNER_LEN = SIZE - PERIMETER_W * 2;
pushRoad('inner', 0, 0, INNER_LEN, INNER_W, 0); // east-west
pushRoad('inner', 0, 0, INNER_LEN, INNER_W, Math.PI / 2); // north-south

// Center intersection
map.roads.push({
  id: nextId('road'),
  type: 'intersection',
  position: v3(0, 0, 0),
  size: { width: INNER_W + 2, length: INNER_W + 2 },
  rotationY: 0,
  materialId: 'asphalt',
});
// Corner intersections (perimeter corners)
for (const [cx, cz] of [
  [PERI_OFFSET, PERI_OFFSET],
  [-PERI_OFFSET, PERI_OFFSET],
  [PERI_OFFSET, -PERI_OFFSET],
  [-PERI_OFFSET, -PERI_OFFSET],
]) {
  map.roads.push({
    id: nextId('road'),
    type: 'intersection',
    position: v3(cx, 0.001, cz),
    size: { width: PERIMETER_W, length: PERIMETER_W },
    rotationY: 0,
    materialId: 'asphalt',
  });
}

// ─── SIDEWALKS ───────────────────────────────────────────────────────────────
const SIDEWALK_W = 5;
const SW_INSIDE = HALF - PERIMETER_W - SIDEWALK_W / 2; // along the inside edge of the perimeter road

function pushSidewalk(x, z, w, l, ry) {
  map.sidewalks.push({
    id: nextId('sw'),
    position: v3(x, 0.05, z),
    size: { width: w, length: l },
    rotationY: ry,
  });
}
// Outer-perimeter inside sidewalks (4)
pushSidewalk(0, SW_INSIDE, SIZE - PERIMETER_W * 2, SIDEWALK_W, 0);
pushSidewalk(0, -SW_INSIDE, SIZE - PERIMETER_W * 2, SIDEWALK_W, 0);
pushSidewalk(SW_INSIDE, 0, SIZE - PERIMETER_W * 2, SIDEWALK_W, Math.PI / 2);
pushSidewalk(-SW_INSIDE, 0, SIZE - PERIMETER_W * 2, SIDEWALK_W, Math.PI / 2);
// Inner-cross sidewalks (along both sides of each inner road)
const innerSwOff = INNER_W / 2 + SIDEWALK_W / 2;
pushSidewalk(0, innerSwOff, INNER_LEN - 2, SIDEWALK_W, 0);
pushSidewalk(0, -innerSwOff, INNER_LEN - 2, SIDEWALK_W, 0);
pushSidewalk(innerSwOff, 0, INNER_LEN - 2, SIDEWALK_W, Math.PI / 2);
pushSidewalk(-innerSwOff, 0, INNER_LEN - 2, SIDEWALK_W, Math.PI / 2);

// ─── BUILDINGS ───────────────────────────────────────────────────────────────
// 8 buildings, one per quadrant-half, with one police station.
const buildingsSpec = [
  // [type, x, z, w, d, floors, color]
  ['police_station', -55, 55, 26, 22, 2, '#2a4a78'],
  ['residential', 35, 55, 22, 22, 8, '#a8896b'],
  ['office', 55, 30, 18, 26, 12, '#4f6075'],
  ['shop', 55, -25, 22, 18, 2, '#c84e3a'],
  ['warehouse', 35, -55, 28, 24, 3, '#7a7368'],
  ['residential', -35, -55, 22, 22, 6, '#9c7a59'],
  ['office', -55, -25, 18, 26, 10, '#3e4a5a'],
  ['parking', -25, 55, 18, 18, 1, '#3a3a3a'],
];
const FLOOR_H = 4;
for (const [type, x, z, w, d, floors, color] of buildingsSpec) {
  map.buildings.push({
    id: nextId('bld'),
    type,
    position: v3(x, 0, z),
    size: { width: w, depth: d, height: floors * FLOOR_H },
    floors,
    rotationY: 0,
    materialId: color,
    windowPattern: type === 'parking' || type === 'warehouse' ? 'sparse' : 'grid',
  });
}

// ─── TREES ───────────────────────────────────────────────────────────────────
// 10 trees: park (5) + scattered (5).
const treeSpots = [
  // Central park (in the southwest quadrant interior area)
  [-15, -8, 1.0, 'low_poly'],
  [-22, -12, 1.1, 'low_poly'],
  [-12, -16, 0.95, 'low_poly'],
  [-8, -10, 1.05, 'low_poly'],
  [-18, -20, 1.0, 'billboard'],
  // Perimeter strip greenery
  [HALF - 4, 20, 0.9, 'billboard'],
  [-HALF + 4, 18, 0.95, 'billboard'],
  [22, HALF - 4, 0.9, 'low_poly'],
  [-20, -HALF + 4, 1.0, 'low_poly'],
  [HALF - 4, -22, 0.95, 'billboard'],
];
for (const [x, z, scale, type] of treeSpots) {
  map.trees.push({ id: nextId('tree'), position: v3(x, 0, z), scale, type });
}

// ─── DECORATIONS ─────────────────────────────────────────────────────────────
function pushDeco(kind, x, z, ry = 0, scale = 1) {
  map.decorations.push({ id: nextId('deco'), kind, position: v3(x, 0, z), rotationY: ry, scale });
}
// Lamp posts along inner cross, every ~14 units
for (let t = -INNER_LEN / 2 + 6; t <= INNER_LEN / 2 - 6; t += 14) {
  pushDeco('lamp', t, innerSwOff + 0.5);
  pushDeco('lamp', t, -innerSwOff - 0.5);
  pushDeco('lamp', innerSwOff + 0.5, t);
  pushDeco('lamp', -innerSwOff - 0.5, t);
}
// Park: benches, trash bins, lamps, flower beds
pushDeco('bench', -16, -10, 0);
pushDeco('bench', -10, -14, Math.PI / 2);
pushDeco('lamp', -14, -12);
pushDeco('lamp', -20, -14);
pushDeco('trash_bin', -12, -8);
pushDeco('flower_bed', -16, -16);
pushDeco('flower_bed', -8, -18);
// Police station decor
pushDeco('sign', -55, 42, 0);
pushDeco('hydrant', -45, 50);
pushDeco('lamp', -65, 50);
pushDeco('lamp', -45, 60);
// Fences along police station perimeter
pushDeco('fence', -55, 67, 0, 1);
pushDeco('fence', -65, 60, Math.PI / 2, 1);
// Random shop/residential decor
pushDeco('hydrant', 30, 46);
pushDeco('trash_bin', 50, 44);
pushDeco('bench', 48, -14, 0);
pushDeco('sign', 55, -38, 0);
pushDeco('curb', 0, 8, 0, 1);
pushDeco('curb', 0, -8, 0, 1);

// ─── WAYPOINT GRAPH (NPC sidewalks) ──────────────────────────────────────────
// Build pedestrian waypoints along sidewalks, spaced ~8 units, linked to neighbors.
const npcWPs = [];
const STEP = 8;

function addWP(x, z, type) {
  const wp = { id: nextId('wp'), position: v3(x, 0.1, z), links: [], type };
  if (type === 'npc') npcWPs.push(wp);
  return wp;
}

// Perimeter inside sidewalk loop (rectangle path)
const periPath = [];
for (let x = -SW_INSIDE; x <= SW_INSIDE; x += STEP) periPath.push(addWP(x, SW_INSIDE, 'npc'));
for (let z = SW_INSIDE - STEP; z >= -SW_INSIDE; z -= STEP) periPath.push(addWP(SW_INSIDE, z, 'npc'));
for (let x = SW_INSIDE - STEP; x >= -SW_INSIDE; x -= STEP) periPath.push(addWP(x, -SW_INSIDE, 'npc'));
for (let z = -SW_INSIDE + STEP; z < SW_INSIDE; z += STEP) periPath.push(addWP(-SW_INSIDE, z, 'npc'));
// Link as cycle
for (let i = 0; i < periPath.length; i++) {
  const a = periPath[i];
  const b = periPath[(i + 1) % periPath.length];
  a.links.push(b.id);
  b.links.push(a.id);
}

// Inner cross sidewalk waypoints (4 strips, two sides per inner road)
const innerNorthSW = [];
for (let x = -INNER_LEN / 2 + STEP; x < INNER_LEN / 2; x += STEP)
  innerNorthSW.push(addWP(x, innerSwOff, 'npc'));
const innerSouthSW = [];
for (let x = -INNER_LEN / 2 + STEP; x < INNER_LEN / 2; x += STEP)
  innerSouthSW.push(addWP(x, -innerSwOff, 'npc'));
const innerEastSW = [];
for (let z = -INNER_LEN / 2 + STEP; z < INNER_LEN / 2; z += STEP)
  innerEastSW.push(addWP(innerSwOff, z, 'npc'));
const innerWestSW = [];
for (let z = -INNER_LEN / 2 + STEP; z < INNER_LEN / 2; z += STEP)
  innerWestSW.push(addWP(-innerSwOff, z, 'npc'));
function chain(arr) {
  for (let i = 0; i < arr.length - 1; i++) {
    arr[i].links.push(arr[i + 1].id);
    arr[i + 1].links.push(arr[i].id);
  }
}
chain(innerNorthSW);
chain(innerSouthSW);
chain(innerEastSW);
chain(innerWestSW);
// Connect inner endpoints to perimeter loop via nearest waypoint
function findNearest(target, group) {
  let best = group[0];
  let bestD = Infinity;
  for (const w of group) {
    const d = (w.position.x - target.position.x) ** 2 + (w.position.z - target.position.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w;
    }
  }
  return best;
}
for (const arr of [innerNorthSW, innerSouthSW, innerEastSW, innerWestSW]) {
  if (!arr.length) continue;
  const head = arr[0];
  const tail = arr[arr.length - 1];
  const hNear = findNearest(head, periPath);
  const tNear = findNearest(tail, periPath);
  head.links.push(hNear.id);
  hNear.links.push(head.id);
  tail.links.push(tNear.id);
  tNear.links.push(tail.id);
}

map.npcWaypoints = npcWPs.map((w) => ({
  id: w.id,
  position: w.position,
  links: w.links,
  type: 'npc',
}));

// ─── TRAFFIC WAYPOINTS ───────────────────────────────────────────────────────
// Single clockwise loop on the perimeter ring + a horizontal pass through the center on the inner east-west road.
const trafficWPs = [];
function tWP(x, z) {
  const wp = { id: nextId('twp'), position: v3(x, 0.1, z), links: [], type: 'traffic' };
  trafficWPs.push(wp);
  return wp;
}
const tStep = 12;
const tRing = [];
// north strip (left-to-right)
for (let x = -PERI_OFFSET + 4; x <= PERI_OFFSET - 4; x += tStep) tRing.push(tWP(x, PERI_OFFSET));
// east strip (top-to-bottom)
for (let z = PERI_OFFSET - tStep; z >= -PERI_OFFSET + 4; z -= tStep) tRing.push(tWP(PERI_OFFSET, z));
// south strip (right-to-left)
for (let x = PERI_OFFSET - tStep; x >= -PERI_OFFSET + 4; x -= tStep) tRing.push(tWP(x, -PERI_OFFSET));
// west strip (bottom-to-top)
for (let z = -PERI_OFFSET + tStep; z < PERI_OFFSET - 4; z += tStep) tRing.push(tWP(-PERI_OFFSET, z));
// link cyclically (one-way)
for (let i = 0; i < tRing.length; i++) {
  tRing[i].links.push(tRing[(i + 1) % tRing.length].id);
}
// Inner east-west transit (one-way west→east), then re-merge into ring
const innerTransit = [];
for (let x = -INNER_LEN / 2 + 4; x <= INNER_LEN / 2 - 4; x += tStep) innerTransit.push(tWP(x, 0));
for (let i = 0; i < innerTransit.length - 1; i++)
  innerTransit[i].links.push(innerTransit[i + 1].id);
// merge ends to nearest ring nodes
if (innerTransit.length) {
  const startRing = findNearest(innerTransit[0], tRing);
  startRing.links.push(innerTransit[0].id);
  const endRing = findNearest(innerTransit[innerTransit.length - 1], tRing);
  innerTransit[innerTransit.length - 1].links.push(endRing.id);
}
map.trafficWaypoints = trafficWPs.map((w) => ({
  id: w.id,
  position: w.position,
  links: w.links,
  type: 'traffic',
}));

// ─── COVER POINTS ────────────────────────────────────────────────────────────
function pushCover(x, z, dx, dz, type) {
  map.coverPoints.push({
    id: nextId('cov'),
    position: v3(x, 0, z),
    direction: v3(dx, 0, dz),
    type,
  });
}
// Building corners (4 per building, facing outward)
for (const b of map.buildings) {
  const { x, z } = b.position;
  const w = b.size.width / 2 + 0.6;
  const d = b.size.depth / 2 + 0.6;
  const corners = [
    [x + w, z + d, 1, 1],
    [x - w, z + d, -1, 1],
    [x + w, z - d, 1, -1],
    [x - w, z - d, -1, -1],
  ];
  for (const [cx, cz, dirX, dirZ] of corners) {
    const len = Math.hypot(dirX, dirZ);
    pushCover(cx, cz, dirX / len, dirZ / len, b.type === 'police_station' ? 'police_station' : 'building_corner');
  }
}
// Decoration covers (benches, fences)
for (const d of map.decorations) {
  if (d.kind === 'bench' || d.kind === 'fence' || d.kind === 'flower_bed') {
    const dirX = -Math.sin(d.rotationY);
    const dirZ = -Math.cos(d.rotationY);
    pushCover(d.position.x, d.position.z, dirX, dirZ, d.kind === 'fence' ? 'fence' : 'decoration');
  }
}

// ─── SPAWN POINTS ────────────────────────────────────────────────────────────
map.spawnPoints.player = v3(0, 0.05, 14); // on inner crossroad sidewalk near center
// NPC spawn points (8) — well-distributed sidewalk positions
map.spawnPoints.npc = [
  v3(40, 0.05, 40),
  v3(-40, 0.05, 40),
  v3(40, 0.05, -40),
  v3(-40, 0.05, -40),
  v3(0, 0.05, SW_INSIDE),
  v3(0, 0.05, -SW_INSIDE),
  v3(SW_INSIDE, 0.05, 0),
  v3(-SW_INSIDE, 0.05, 0),
];
// Police spawn points (next to police_station)
map.spawnPoints.police = [
  v3(-50, 0.05, 42),
  v3(-60, 0.05, 42),
  v3(-55, 0.05, 38),
];
// Car spawn points along the perimeter ring
map.spawnPoints.cars = [
  v3(-PERI_OFFSET + 4, 0.5, PERI_OFFSET),
  v3(PERI_OFFSET, 0.5, -20),
  v3(20, 0.5, -PERI_OFFSET),
  v3(-PERI_OFFSET, 0.5, 20),
  v3(40, 0.5, 0),
];

// ─── WRITE FILE ──────────────────────────────────────────────────────────────
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(map, null, 2), 'utf8');
console.log(
  `Wrote ${outFile}\n  roads=${map.roads.length} sidewalks=${map.sidewalks.length} buildings=${map.buildings.length} trees=${map.trees.length} deco=${map.decorations.length}\n  npcWPs=${map.npcWaypoints.length} trafficWPs=${map.trafficWaypoints.length} cover=${map.coverPoints.length}`
);
