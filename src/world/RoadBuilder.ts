import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile } from '../types/map';

export class RoadBuilder {
  static build(scene: Scene, root: TransformNode, map: CityMapFile): Mesh[] {
    const asphalt = new StandardMaterial('mat_asphalt', scene);
    asphalt.diffuseColor = new Color3(0.12, 0.12, 0.13);
    asphalt.specularColor = new Color3(0.05, 0.05, 0.05);

    const sidewalk = new StandardMaterial('mat_sidewalk', scene);
    sidewalk.diffuseColor = new Color3(0.7, 0.7, 0.72);
    sidewalk.specularColor = new Color3(0.1, 0.1, 0.1);

    const meshes: Mesh[] = [];

    for (const r of map.roads) {
      const w = r.size.width;
      const l = r.size.length;
      const m = MeshBuilder.CreateGround(`road_${r.id}`, { width: w, height: l }, scene);
      m.position.set(r.position.x, r.position.y + 0.01, r.position.z);
      m.rotation.y = r.rotationY;
      m.material = asphalt;
      m.receiveShadows = true;
      m.parent = root;
      m.checkCollisions = false;
      meshes.push(m);
    }

    for (const s of map.sidewalks) {
      const m = MeshBuilder.CreateBox(
        `sw_${s.id}`,
        { width: s.size.width, depth: s.size.length, height: 0.15 },
        scene
      );
      m.position.set(s.position.x, 0.075, s.position.z);
      m.rotation.y = s.rotationY;
      m.material = sidewalk;
      m.receiveShadows = true;
      m.parent = root;
      meshes.push(m);
    }

    // Ground beneath everything (ensures we don't see sky through gaps)
    const ground = MeshBuilder.CreateGround(
      'ground',
      { width: map.size.width + 40, height: map.size.height + 40 },
      scene
    );
    const grass = new StandardMaterial('mat_grass', scene);
    grass.diffuseColor = new Color3(0.32, 0.45, 0.22);
    grass.specularColor = new Color3(0, 0, 0);
    ground.material = grass;
    ground.receiveShadows = true;
    ground.position.y = -0.02;
    ground.parent = root;
    ground.checkCollisions = true;
    // expose name for downstream raycast filters
    ground.metadata = { kind: 'ground' };
    meshes.push(ground);

    // Center dashed white line on the inner east-west road for flavor
    const lineMat = new StandardMaterial('mat_line', scene);
    lineMat.diffuseColor = new Color3(0.95, 0.95, 0.95);
    lineMat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    for (const r of map.roads) {
      if (r.type !== 'inner') continue;
      const segs = 12;
      const totalLen = r.size.length;
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs - 0.5;
        const local = new Vector3(0, 0.02, t * totalLen);
        const dash = MeshBuilder.CreateBox(
          `line_${r.id}_${i}`,
          { width: 0.3, depth: 1.2, height: 0.02 },
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
}
