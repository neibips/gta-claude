import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { AssetLoader, LoadedModel } from '../core/AssetLoader';
import type { CityMapFile, Vector3Like } from '../types/map';

type MapMeshKind = 'road' | 'sidewalk' | 'building' | 'tree' | 'decoration' | 'detail';

const v = (p: Vector3Like) => new Vector3(p.x, p.y, p.z);

function meshText(mesh: AbstractMesh): string {
  const materialName = 'material' in mesh && mesh.material ? mesh.material.name : '';
  return `${mesh.name} ${materialName}`.toLowerCase();
}

function classifyMesh(mesh: AbstractMesh): MapMeshKind {
  const text = meshText(mesh);
  if (
    text.includes('lanes') ||
    text.includes('decal') ||
    text.includes('wetfloorsign') ||
    text.includes('grass')
  ) {
    return 'detail';
  }
  if (text.includes('street') && !text.includes('street_assets')) return 'road';
  if (text.includes('side_walk') || text.includes('sidewalk') || text.includes('curb')) return 'sidewalk';
  if (text.includes('foliage') || text.includes('bark')) return 'tree';
  if (text.includes('street_assets') || text.includes('trash') || text.includes('sign')) return 'decoration';
  if (
    text.includes('facade') ||
    text.includes('building') ||
    text.includes('roof') ||
    text.includes('glass') ||
    text.includes('concrete') ||
    text.includes('metal') ||
    text.includes('stone') ||
    text.includes('marble') ||
    text.includes('fire') ||
    text.includes('vent') ||
    text.includes('ac') ||
    text.includes('solar') ||
    text.includes('tank') ||
    text.includes('material')
  ) {
    return 'building';
  }
  return 'detail';
}

function collisionFor(kind: MapMeshKind): boolean {
  return kind === 'road' || kind === 'sidewalk' || kind === 'building' || kind === 'tree' || kind === 'decoration';
}

function canUseMeshCollider(mesh: AbstractMesh): mesh is Mesh {
  const maybeMesh = mesh as Mesh;
  return typeof maybeMesh.getTotalVertices === 'function' && maybeMesh.getTotalVertices() > 0;
}

function fitModelToMap(model: LoadedModel, position: Vector3, scale: number): void {
  const root = model.rootMesh;
  root.computeWorldMatrix(true);
  for (const mesh of model.meshes) mesh.computeWorldMatrix(true);

  const bounds = root.getHierarchyBoundingVectors(true, (mesh) => model.meshes.includes(mesh));
  const size = bounds.max.subtract(bounds.min);
  const center = bounds.min.add(size.scale(0.5));

  root.scaling.scaleInPlace(scale);
  root.position.copyFrom(
    new Vector3(
      position.x - center.x * scale,
      position.y - bounds.min.y * scale,
      position.z - center.z * scale
    )
  );
}

export class MapModelBuilder {
  static async build(
    scene: Scene,
    root: TransformNode,
    map: CityMapFile,
    loader: AssetLoader | undefined,
    hasPhysics: boolean
  ): Promise<Mesh[]> {
    if (!map.visualModel || !loader) return [];

    const model = await loader.loadModel(map.visualModel.modelPath);
    fitModelToMap(model, v(map.visualModel.position), map.visualModel.scale);
    model.rootMesh.parent = root;

    const colliders: Mesh[] = [];
    const wantsPhysics = hasPhysics && map.visualModel.collision === 'mesh';

    for (const mesh of model.meshes) {
      const kind = classifyMesh(mesh);
      const hasCollision = map.visualModel.collision === 'mesh' && collisionFor(kind);

      mesh.receiveShadows = true;
      mesh.checkCollisions = hasCollision;
      mesh.isPickable = hasCollision;
      mesh.metadata = {
        ...(mesh.metadata ?? {}),
        kind: kind === 'detail' ? 'map_detail' : kind,
        source: 'city_map_glb',
        modelPath: map.visualModel.modelPath,
        collision: hasCollision ? 'mesh' : 'none',
      };

      if (hasCollision && canUseMeshCollider(mesh)) {
        colliders.push(mesh);
        if (wantsPhysics) {
          try {
            new PhysicsAggregate(
              mesh,
              PhysicsShapeType.MESH,
              { mass: 0, friction: kind === 'road' || kind === 'sidewalk' ? 0.85 : 0.55, restitution: 0 },
              scene
            );
          } catch (e) {
            console.warn(`[MapModelBuilder] failed to create mesh collider for ${mesh.name}`, e);
          }
        }
      }
    }

    return colliders;
  }
}
