import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { CityMapFile, TerrainPatch } from '../types/map';

const materialColor = (id: string): Color3 => {
  if (id.startsWith('#')) {
    const n = parseInt(id.slice(1), 16);
    return new Color3(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
  }
  switch (id) {
    case 'asphalt':
      return new Color3(0.12, 0.12, 0.13);
    case 'concrete':
      return new Color3(0.62, 0.62, 0.6);
    case 'dirt':
      return new Color3(0.42, 0.31, 0.19);
    case 'field':
      return new Color3(0.55, 0.47, 0.24);
    case 'water':
      return new Color3(0.15, 0.38, 0.55);
    case 'rock':
      return new Color3(0.35, 0.36, 0.34);
    default:
      return new Color3(0.32, 0.45, 0.22);
  }
};

const makeMat = (scene: Scene, id: string, name: string): StandardMaterial => {
  const mat = new StandardMaterial(`${name}_${id}`, scene);
  mat.diffuseColor = materialColor(id);
  mat.specularColor = new Color3(0.04, 0.04, 0.04);
  return mat;
};

export class RoadBuilder {
  static build(scene: Scene, root: TransformNode, map: CityMapFile): Mesh[] {
    const mats = new Map<string, StandardMaterial>();
    const getMat = (id: string, name = 'mat') => {
      const key = `${name}:${id}`;
      let mat = mats.get(key);
      if (!mat) {
        mat = makeMat(scene, id, name);
        mats.set(key, mat);
      }
      return mat;
    };

    const meshes: Mesh[] = [];

    // No surrounding pad — only the GLB world is rendered. Players who walk
    // off the GLB simply fall (handled by GameConfig.world.fallKillY).

    for (const patch of map.terrain?.patches ?? []) {
      meshes.push(this.buildTerrainPatch(scene, root, patch, getMat(patch.materialId, 'mat_terrain')));
    }

    for (const r of map.roads) {
      if (r.tags?.includes('nav-only')) continue;
      const w = r.size.width;
      const l = r.size.length;
      const m = MeshBuilder.CreateGround(`road_${r.id}`, { width: w, height: l }, scene);
      m.position.set(r.position.x, r.position.y + 0.01, r.position.z);
      m.rotation.y = r.rotationY;
      m.material = getMat(r.materialId, 'mat_road');
      m.receiveShadows = true;
      m.parent = root;
      m.checkCollisions = false;
      m.metadata = { kind: 'road', roadId: r.id, type: r.type, districtId: r.districtId };
      meshes.push(m);
    }

    // Curb height: low enough that the player capsule and NPC bodies step
    // over without snagging, but tall enough that fast cars feel a bump.
    const CURB_HEIGHT = 0.08;
    for (const s of map.sidewalks) {
      if (s.tags?.includes('nav-only')) continue;
      const m = MeshBuilder.CreateBox(
        `sw_${s.id}`,
        { width: s.size.width, depth: s.size.length, height: CURB_HEIGHT },
        scene
      );
      m.position.set(s.position.x, s.position.y + CURB_HEIGHT / 2, s.position.z);
      m.rotation.y = s.rotationY;
      m.material = getMat(s.materialId ?? 'concrete', 'mat_sidewalk');
      m.receiveShadows = true;
      m.parent = root;
      m.metadata = { kind: 'sidewalk', sidewalkId: s.id, districtId: s.districtId };
      meshes.push(m);
    }

    // Center dashed white line on the inner east-west road for flavor
    const lineMat = new StandardMaterial('mat_line', scene);
    lineMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
    lineMat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    for (const r of map.roads) {
      if (r.tags?.includes('nav-only')) continue;
      if (r.type === 'intersection' || r.size.width < 28) continue;
      const segs = Math.max(4, Math.floor(r.size.width / 28));
      const totalLen = r.size.width;
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs - 0.5;
        const local = new Vector3(t * totalLen, 0.02, 0);
        const dash = MeshBuilder.CreateBox(
          `line_${r.id}_${i}`,
          { width: 3.5, depth: 0.25, height: 0.02 },
          scene
        );
        const cos = Math.cos(r.rotationY);
        const sin = Math.sin(r.rotationY);
        dash.position.set(
          r.position.x + local.x * cos + local.z * sin,
          0.03,
          r.position.z - local.x * sin + local.z * cos
        );
        dash.rotation.y = r.rotationY;
        dash.material = lineMat;
        dash.parent = root;
      }
    }

    return meshes;
  }

  private static buildTerrainPatch(
    scene: Scene,
    root: TransformNode,
    patch: TerrainPatch,
    mat: StandardMaterial
  ): Mesh {
    const height = Math.max(0.05, patch.size.height);
    let mesh: Mesh;
    if (patch.type === 'water') {
      mesh = MeshBuilder.CreateGround(`terrain_${patch.id}`, { width: patch.size.width, height: patch.size.length }, scene);
      mesh.position.set(patch.position.x, patch.position.y + 0.02, patch.position.z);
    } else if (patch.type === 'ramp') {
      mesh = this.buildRampMesh(scene, patch);
    } else {
      mesh = MeshBuilder.CreateBox(
        `terrain_${patch.id}`,
        { width: patch.size.width, depth: patch.size.length, height },
        scene
      );
      mesh.position.set(patch.position.x, patch.position.y + height / 2, patch.position.z);
    }
    mesh.rotation.y = patch.rotationY;
    mesh.material = mat;
    mesh.receiveShadows = true;
    mesh.parent = root;
    mesh.checkCollisions = patch.type !== 'water' && patch.type !== 'depression';
    mesh.metadata = {
      kind: 'terrain',
      terrainId: patch.id,
      type: patch.type,
      districtId: patch.districtId,
      physicsShape: patch.type === 'ramp' ? 'mesh' : 'box',
    };
    if (patch.type === 'water') {
      mat.alpha = 0.78;
    }
    return mesh;
  }

  private static buildRampMesh(scene: Scene, patch: TerrainPatch): Mesh {
    const w = patch.size.width / 2;
    const l = patch.size.length / 2;
    const h = patch.size.height;
    const mesh = new Mesh(`terrain_${patch.id}`, scene);
    const positions = [
      -w, 0, -l,
      w, 0, -l,
      -w, h, l,
      w, h, l,
      -w, -0.25, -l,
      w, -0.25, -l,
      -w, -0.25, l,
      w, -0.25, l,
    ];
    const indices = [
      0, 2, 1, 1, 2, 3,
      4, 5, 6, 5, 7, 6,
      0, 1, 4, 1, 5, 4,
      2, 6, 3, 3, 6, 7,
      0, 4, 2, 2, 4, 6,
      1, 3, 5, 3, 7, 5,
    ];
    const normals: number[] = [];
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    data.normals = normals;
    data.applyToMesh(mesh);
    mesh.position.set(patch.position.x, patch.position.y, patch.position.z);
    return mesh;
  }
}
