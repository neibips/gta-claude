import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile, Vector3Like } from '../types/map';
import type { AssetLoader } from '../core/AssetLoader';
import { RoadBuilder } from './RoadBuilder';
import { BuildingBuilder } from './BuildingBuilder';
import { DecorationBuilder } from './DecorationBuilder';
import { MapModelBuilder } from './MapModelBuilder';
import { WaypointGraph } from './WaypointGraph';
import { CoverPointGenerator, type CoverPoint } from './CoverPointGenerator';

export type BuiltMap = {
  root: TransformNode;
  buildings: Mesh[];
  trees: Mesh[];
  decorations: Mesh[];
  groundMeshes: Mesh[];
  npcGraph: WaypointGraph;
  trafficGraph: WaypointGraph;
  coverPoints: CoverPoint[];
  spawn: {
    player: Vector3;
    npc: Vector3[];
    police: Vector3[];
    cars: Vector3[];
  };
  size: { width: number; height: number };
};

const v = (p: Vector3Like) => new Vector3(p.x, p.y, p.z);

export class MapBuilder {
  /**
   * Builds the 3D scene for the world map. Strictly a builder over saved data
   * — never generates new map content.
   */
  static async build(
    scene: Scene,
    map: CityMapFile,
    hasPhysics: boolean,
    loader?: AssetLoader
  ): Promise<BuiltMap> {
    const root = new TransformNode('world', scene);

    const mapModelMeshes = await MapModelBuilder.build(scene, root, map, loader, hasPhysics);
    const groundMeshes = RoadBuilder.build(scene, root, map);
    const buildings = await BuildingBuilder.build(scene, root, map, loader, hasPhysics);
    const { trees, deco } = await DecorationBuilder.build(scene, root, map, loader);

    if (hasPhysics) {
      // Static world surfaces for player/vehicle physics.
      for (const mesh of groundMeshes) {
        const kind = (mesh.metadata as { kind?: string } | null)?.kind;
        const shape = (mesh.metadata as { physicsShape?: string } | null)?.physicsShape;
        if (kind === 'ground' || kind === 'terrain' || kind === 'sidewalk') {
          const type = shape === 'mesh' ? PhysicsShapeType.MESH : PhysicsShapeType.BOX;
          new PhysicsAggregate(mesh, type, { mass: 0, friction: 0.7, restitution: 0 }, scene);
        }
      }
      for (const b of buildings) {
        if ((b.metadata as { exactModelCollider?: boolean } | null)?.exactModelCollider) continue;
        new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 0, friction: 0.4, restitution: 0.05 }, scene);
      }
      for (const t of trees) {
        new PhysicsAggregate(t, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.4, restitution: 0.05 }, scene);
      }
      for (const d of deco) {
        if (!d.checkCollisions) continue;
        const meta = d.metadata as { collisionShape?: string } | null;
        const shape = meta?.collisionShape === 'cylinder' ? PhysicsShapeType.CYLINDER : PhysicsShapeType.BOX;
        new PhysicsAggregate(d, shape, { mass: 0, friction: 0.5, restitution: 0.03 }, scene);
      }
    }

    const npcGraph = new WaypointGraph(map.npcWaypoints);
    const trafficGraph = new WaypointGraph(map.trafficWaypoints);
    const coverPoints = CoverPointGenerator.load(map.coverPoints);

    return {
      root,
      buildings,
      trees,
      decorations: deco,
      groundMeshes: [...mapModelMeshes, ...groundMeshes],
      npcGraph,
      trafficGraph,
      coverPoints,
      spawn: {
        player: v(map.spawnPoints.player),
        npc: map.spawnPoints.npc.map(v),
        police: map.spawnPoints.police.map(v),
        cars: map.spawnPoints.cars.map(v),
      },
      size: { width: map.size.width, height: map.size.height },
    };
  }
}
