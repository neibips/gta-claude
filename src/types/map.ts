export type Vector3Like = { x: number; y: number; z: number };

export type WorldDistrictId = 'city' | 'village' | 'factory' | 'field' | string;

export type WorldDistrict = {
  id: WorldDistrictId;
  label: string;
  kind: 'urban' | 'rural' | 'industrial' | 'field' | 'wilderness' | 'service';
  center: Vector3Like;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  elevationRange: { min: number; max: number };
  landmarkIds: string[];
  tags: string[];
};

export type TerrainPatchType =
  | 'plateau'
  | 'hill'
  | 'ramp'
  | 'ridge'
  | 'depression'
  | 'water'
  | 'retaining_wall';

export type TerrainPatch = {
  id: string;
  type: TerrainPatchType;
  districtId?: WorldDistrictId;
  position: Vector3Like;
  size: { width: number; length: number; height: number };
  rotationY: number;
  materialId: string;
  tags?: string[];
};

export type TerrainProfile = {
  baseMaterialId: string;
  heightRange: { min: number; max: number };
  patches: TerrainPatch[];
};

export type SavedRoad = {
  id: string;
  type:
    | 'perimeter'
    | 'arterial'
    | 'collector'
    | 'local'
    | 'service'
    | 'rural'
    | 'inner'
    | 'intersection';
  districtId?: WorldDistrictId;
  position: Vector3Like;
  size: { width: number; length: number };
  rotationY: number;
  materialId: string;
  lanes?: number;
  speedLimit?: number;
  tags?: string[];
};

export type SavedSidewalk = {
  id: string;
  districtId?: WorldDistrictId;
  position: Vector3Like;
  size: { width: number; length: number };
  rotationY: number;
  materialId?: string;
  tags?: string[];
};

export type BuildingType =
  | 'residential'
  | 'office'
  | 'shop'
  | 'parking'
  | 'police_station'
  | 'warehouse'
  | 'factory'
  | 'house'
  | 'hangar'
  | 'landmark'
  | 'farm'
  | 'utility';

export type SavedBuilding = {
  id: string;
  districtId?: WorldDistrictId;
  type: BuildingType;
  position: Vector3Like;
  size: { width: number; depth: number; height: number };
  floors: number;
  rotationY: number;
  materialId: string;
  windowPattern: 'none' | 'sparse' | 'grid' | 'shopfront';
  modelPath?: string;
  assetScale?: number;
  elevationLayer?: 'ground' | 'lower' | 'upper' | 'rooftop';
  accessibleLevels?: number[];
  tags?: string[];
};

export type SavedTree = {
  id: string;
  districtId?: WorldDistrictId;
  position: Vector3Like;
  scale: number;
  type: 'billboard' | 'low_poly' | 'pine_cluster' | 'park_tree';
};

export type DecorationKind =
  | 'lamp'
  | 'bench'
  | 'trash_bin'
  | 'sign'
  | 'fence'
  | 'hydrant'
  | 'flower_bed'
  | 'curb'
  | 'barrier'
  | 'crate'
  | 'pipe'
  | 'monument';

export type SavedDecoration = {
  id: string;
  districtId?: WorldDistrictId;
  kind: DecorationKind;
  position: Vector3Like;
  rotationY: number;
  scale: number;
  modelPath?: string;
  materialId?: string;
  tags?: string[];
};

export type AssetInstanceCategory =
  | 'building'
  | 'environment'
  | 'custom'
  | 'landmark'
  | 'terrain'
  | 'prop'
  | 'vegetation'
  | 'navigation';

export type AssetPrimitive =
  | 'box'
  | 'cylinder'
  | 'sphere'
  | 'ramp'
  | 'arch'
  | 'tower'
  | 'billboard'
  | 'bridge';

export type SavedAssetInstance = {
  id: string;
  districtId?: WorldDistrictId;
  category: AssetInstanceCategory;
  role: string;
  modelPath?: string;
  primitive?: AssetPrimitive;
  position: Vector3Like;
  rotationY: number;
  scale: Vector3Like;
  size?: { width: number; depth: number; height: number };
  materialId?: string;
  collision: 'none' | 'box' | 'cylinder';
  tags?: string[];
};

export type WorldPOI = {
  id: string;
  districtId: WorldDistrictId;
  name: string;
  role: 'landmark' | 'service' | 'shop' | 'police' | 'park' | 'yard' | 'factory' | 'field' | 'secret' | 'vista';
  position: Vector3Like;
  radius: number;
  entranceIds: string[];
  reward?: string;
  tags?: string[];
};

export type SavedWaypoint = {
  id: string;
  districtId?: WorldDistrictId;
  position: Vector3Like;
  links: string[];
  type: 'npc' | 'traffic';
  tags?: string[];
};

export type CoverType =
  | 'building_corner'
  | 'car'
  | 'fence'
  | 'decoration'
  | 'police_station'
  | 'terrain'
  | 'prop';

export type SavedCoverPoint = {
  id: string;
  districtId?: WorldDistrictId;
  position: Vector3Like;
  direction: Vector3Like;
  type: CoverType;
};

export type WorldVisualModel = {
  modelPath: string;
  position: Vector3Like;
  scale: number;
  collision: 'none' | 'mesh';
  tags?: string[];
};

export type WorldMapFile = {
  version: 2;
  name: string;
  seed: string;
  size: { width: number; height: number };
  world: {
    description: string;
    units: 'meters';
    playerPromise: string;
    pillars: string[];
  };
  visualModel?: WorldVisualModel;
  districts: WorldDistrict[];
  terrain: TerrainProfile;
  roads: SavedRoad[];
  sidewalks: SavedSidewalk[];
  buildings: SavedBuilding[];
  trees: SavedTree[];
  decorations: SavedDecoration[];
  assetInstances: SavedAssetInstance[];
  pois: WorldPOI[];
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

export type CityMapFile = WorldMapFile;
