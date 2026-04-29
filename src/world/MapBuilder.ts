import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile, Vector3Like } from '../types/map';
import { RoadBuilder } from './RoadBuilder';
import { BuildingBuilder } from './BuildingBuilder';
import { DecorationBuilder } from './DecorationBuilder';
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
   * Builds the 3D scene for the city map. Strictly a builder over saved data
   * — never generates new map content.
   */
  static build(scene: Scene, map: CityMapFile, hasPhysics: boolean): BuiltMap {
    const root = new TransformNode('city', scene);

    const groundMeshes = RoadBuilder.build(scene, root, map);
    const buildings = BuildingBuilder.build(scene, root, map);
    const { trees, deco } = DecorationBuilder.build(scene, root, map);

    if (hasPhysics) {
      // Static ground (the wide green floor) for player/vehicle physics.
      const ground = groundMeshes.find((m) => m.name === 'ground');
      if (ground) {
        new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.7, restitution: 0 }, scene);
      }
      for (const b of buildings) {
        new PhysicsAggregate(b, PhysicsShapeType.BOX, { mass: 0, friction: 0.4, restitution: 0.05 }, scene);
      }
      for (const t of trees) {
        new PhysicsAggregate(t, PhysicsShapeType.CYLINDER, { mass: 0, friction: 0.4, restitution: 0.05 }, scene);
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
      groundMeshes,
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
