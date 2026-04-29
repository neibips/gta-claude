export type Vector3Like = { x: number; y: number; z: number };

export type SavedRoad = {
  id: string;
  type: 'perimeter' | 'inner' | 'intersection';
  position: Vector3Like;
  size: { width: number; length: number };
  rotationY: number;
  materialId: string;
};

export type SavedSidewalk = {
  id: string;
  position: Vector3Like;
  size: { width: number; length: number };
  rotationY: number;
};

export type BuildingType =
  | 'residential'
  | 'office'
  | 'shop'
  | 'parking'
  | 'police_station'
  | 'warehouse';

export type SavedBuilding = {
  id: string;
  type: BuildingType;
  position: Vector3Like;
  size: { width: number; depth: number; height: number };
  floors: number;
  rotationY: number;
  materialId: string;
  windowPattern: string;
};

export type SavedTree = {
  id: string;
  position: Vector3Like;
  scale: number;
  type: 'billboard' | 'low_poly';
};

export type DecorationKind =
  | 'lamp'
  | 'bench'
  | 'trash_bin'
  | 'sign'
  | 'fence'
  | 'hydrant'
  | 'flower_bed'
  | 'curb';

export type SavedDecoration = {
  id: string;
  kind: DecorationKind;
  position: Vector3Like;
  rotationY: number;
  scale: number;
};

export type SavedWaypoint = {
  id: string;
  position: Vector3Like;
  links: string[];
  type: 'npc' | 'traffic';
};

export type CoverType =
  | 'building_corner'
  | 'car'
  | 'fence'
  | 'decoration'
  | 'police_station';

export type SavedCoverPoint = {
  id: string;
  position: Vector3Like;
  direction: Vector3Like;
  type: CoverType;
};

export type CityMapFile = {
  version: number;
  name: string;
  seed: string;
  size: { width: number; height: number };
  roads: SavedRoad[];
  sidewalks: SavedSidewalk[];
  buildings: SavedBuilding[];
  trees: SavedTree[];
  decorations: SavedDecoration[];
  npcWaypoints: SavedWaypoint[];
  trafficWaypoints: SavedWaypoint[];
  coverPoints: SavedCoverPoint[];
  spawnPoints: {
    player: Vector3Like;
    npc: Vector3Like[];
    police: Vector3Like[];
    cars: Vector3Like[];
  };
};
