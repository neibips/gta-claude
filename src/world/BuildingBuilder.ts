import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile, SavedBuilding } from '../types/map';

const hexToColor3 = (hex: string): Color3 => {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return new Color3(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
};

export class BuildingBuilder {
  static build(scene: Scene, root: TransformNode, map: CityMapFile): Mesh[] {
    const meshes: Mesh[] = [];
    const winMat = new StandardMaterial('mat_window', scene);
    winMat.diffuseColor = new Color3(0.05, 0.08, 0.12);
    winMat.emissiveColor = new Color3(0.95, 0.78, 0.4);
    winMat.specularColor = new Color3(0.4, 0.4, 0.4);

    for (const b of map.buildings) {
      const m = this.buildOne(scene, b, winMat);
      m.parent = root;
      m.checkCollisions = true;
      meshes.push(m);
    }
    return meshes;
  }

  private static buildOne(scene: Scene, b: SavedBuilding, winMat: StandardMaterial): Mesh {
    const body = MeshBuilder.CreateBox(
      `bld_${b.id}`,
      { width: b.size.width, depth: b.size.depth, height: b.size.height },
      scene
    );
    body.position.set(b.position.x, b.size.height / 2, b.position.z);
    body.rotation.y = b.rotationY;

    const facade = new PBRMaterial(`mat_${b.id}`, scene);
    facade.albedoColor = hexToColor3(b.materialId.startsWith('#') ? b.materialId : '#888888');
    facade.metallic = 0.05;
    facade.roughness = 0.85;
    facade.maxSimultaneousLights = 4;
    body.material = facade;
    body.receiveShadows = true;
    body.metadata = { kind: 'building', buildingId: b.id, type: b.type };

    // Window strip (one per floor) — emissive plane on long sides
    const sides: Array<[Vector3, number]> = [
      [new Vector3(0, 0, b.size.depth / 2 + 0.01), 0],
      [new Vector3(0, 0, -b.size.depth / 2 - 0.01), Math.PI],
      [new Vector3(b.size.width / 2 + 0.01, 0, 0), Math.PI / 2],
      [new Vector3(-b.size.width / 2 - 0.01, 0, 0), -Math.PI / 2],
    ];
    if (b.windowPattern !== 'sparse') {
      for (let f = 0; f < b.floors; f++) {
        const yC = (f + 0.5) * 4;
        for (let si = 0; si < sides.length; si++) {
          const [off, rot] = sides[si];
          const sideLen = si < 2 ? b.size.width : b.size.depth;
          const w = Math.max(0.4, sideLen - 1.5);
          const win = MeshBuilder.CreatePlane(
            `win_${b.id}_${f}_${si}`,
            { width: w, height: 1.2 },
            scene
          );
          win.material = winMat;
          win.position = body.position.add(off);
          win.position.y = yC;
          win.rotation.y = rot;
          win.parent = body;
          win.position.subtractInPlace(body.position);
          win.position.y = yC;
          win.isPickable = false;
        }
      }
    }

    // Roof accent for police station
    if (b.type === 'police_station') {
      const roof = MeshBuilder.CreateBox(
        `roof_${b.id}`,
        { width: b.size.width * 0.4, depth: b.size.depth * 0.4, height: 1 },
        scene
      );
      const roofMat = new StandardMaterial(`roofmat_${b.id}`, scene);
      roofMat.diffuseColor = new Color3(0.1, 0.2, 0.55);
      roofMat.emissiveColor = new Color3(0.1, 0.15, 0.35);
      roof.material = roofMat;
      roof.position.set(b.position.x, b.size.height + 0.5, b.position.z);
      roof.parent = body;
      roof.position.subtractInPlace(body.position);
    }

    return body;
  }
}
