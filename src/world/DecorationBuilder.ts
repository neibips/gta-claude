import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile, SavedTree, SavedDecoration } from '../types/map';

export class DecorationBuilder {
  static build(scene: Scene, root: TransformNode, map: CityMapFile): { trees: Mesh[]; deco: Mesh[] } {
    const trees = map.trees.map((t) => this.buildTree(scene, t, root));
    const deco = map.decorations.map((d) => this.buildDeco(scene, d, root));
    return { trees, deco };
  }

  private static buildTree(scene: Scene, t: SavedTree, root: TransformNode): Mesh {
    const trunkH = 2.4 * t.scale;
    const trunk = MeshBuilder.CreateCylinder(`trunk_${t.id}`, { height: trunkH, diameter: 0.3 * t.scale }, scene);
    trunk.position.set(t.position.x, trunkH / 2, t.position.z);
    const trunkMat = new StandardMaterial(`mat_trunk_${t.id}`, scene);
    trunkMat.diffuseColor = new Color3(0.35, 0.22, 0.14);
    trunk.material = trunkMat;
    trunk.parent = root;

    const foliage = MeshBuilder.CreateSphere(`leaves_${t.id}`, { diameter: 3 * t.scale, segments: 8 }, scene);
    foliage.position.set(t.position.x, trunkH + 0.8 * t.scale, t.position.z);
    const leafMat = new StandardMaterial(`mat_leaf_${t.id}`, scene);
    leafMat.diffuseColor = new Color3(0.18, 0.45, 0.18);
    leafMat.specularColor = new Color3(0, 0, 0);
    foliage.material = leafMat;
    foliage.parent = trunk;
    foliage.position.subtractInPlace(trunk.position);

    trunk.checkCollisions = true;
    trunk.metadata = { kind: 'tree' };
    return trunk;
  }

  private static buildDeco(scene: Scene, d: SavedDecoration, root: TransformNode): Mesh {
    let m: Mesh;
    switch (d.kind) {
      case 'lamp':
        m = this.lamp(scene, d);
        break;
      case 'bench':
        m = this.bench(scene, d);
        break;
      case 'trash_bin':
        m = this.trashBin(scene, d);
        break;
      case 'sign':
        m = this.sign(scene, d);
        break;
      case 'fence':
        m = this.fence(scene, d);
        break;
      case 'hydrant':
        m = this.hydrant(scene, d);
        break;
      case 'flower_bed':
        m = this.flowerBed(scene, d);
        break;
      case 'curb':
      default:
        m = MeshBuilder.CreateBox(`deco_${d.id}`, { width: 1, depth: 0.2, height: 0.15 }, scene);
        m.position.set(d.position.x, 0.075, d.position.z);
    }
    m.parent = root;
    m.metadata = { kind: 'decoration', decoKind: d.kind };
    return m;
  }

  private static lamp(scene: Scene, d: SavedDecoration): Mesh {
    const post = MeshBuilder.CreateCylinder(`lamp_${d.id}`, { height: 4, diameter: 0.15 }, scene);
    post.position.set(d.position.x, 2, d.position.z);
    const mat = new StandardMaterial(`mat_lamp_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.2, 0.2, 0.22);
    post.material = mat;
    const head = MeshBuilder.CreateSphere(`lamphead_${d.id}`, { diameter: 0.5 }, scene);
    head.parent = post;
    head.position.set(0, 2.0, 0);
    const hMat = new StandardMaterial(`mat_lamph_${d.id}`, scene);
    hMat.emissiveColor = new Color3(1, 0.9, 0.6);
    head.material = hMat;
    return post;
  }
  private static bench(scene: Scene, d: SavedDecoration): Mesh {
    const seat = MeshBuilder.CreateBox(`bench_${d.id}`, { width: 2, depth: 0.5, height: 0.1 }, scene);
    seat.position.set(d.position.x, 0.5, d.position.z);
    seat.rotation.y = d.rotationY;
    const mat = new StandardMaterial(`mat_bench_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.45, 0.3, 0.18);
    seat.material = mat;
    const back = MeshBuilder.CreateBox(`benchb_${d.id}`, { width: 2, depth: 0.1, height: 0.6 }, scene);
    back.parent = seat;
    back.position.set(0, 0.4, -0.2);
    back.material = mat;
    return seat;
  }
  private static trashBin(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateCylinder(`bin_${d.id}`, { height: 1, diameter: 0.6 }, scene);
    m.position.set(d.position.x, 0.5, d.position.z);
    const mat = new StandardMaterial(`mat_bin_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    m.material = mat;
    return m;
  }
  private static sign(scene: Scene, d: SavedDecoration): Mesh {
    const post = MeshBuilder.CreateCylinder(`sign_${d.id}`, { height: 3, diameter: 0.15 }, scene);
    post.position.set(d.position.x, 1.5, d.position.z);
    const board = MeshBuilder.CreateBox(`signb_${d.id}`, { width: 2, depth: 0.05, height: 1 }, scene);
    board.parent = post;
    board.position.set(0, 1.3, 0);

    const tex = new DynamicTexture(`signt_${d.id}`, { width: 256, height: 128 }, scene, false);
    tex.drawText('POLICE', 40, 80, 'bold 56px sans-serif', '#ffffff', '#1a3a78', true);
    const mat = new StandardMaterial(`mat_sign_${d.id}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    board.material = mat;
    return post;
  }
  private static fence(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateBox(`fence_${d.id}`, { width: 4, depth: 0.1, height: 1.2 }, scene);
    m.position.set(d.position.x, 0.6, d.position.z);
    m.rotation.y = d.rotationY;
    const mat = new StandardMaterial(`mat_fence_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.5, 0.3, 0.18);
    m.material = mat;
    m.checkCollisions = true;
    return m;
  }
  private static hydrant(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateCylinder(`hyd_${d.id}`, { height: 0.7, diameter: 0.3 }, scene);
    m.position.set(d.position.x, 0.35, d.position.z);
    const mat = new StandardMaterial(`mat_hyd_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.85, 0.18, 0.18);
    m.material = mat;
    return m;
  }
  private static flowerBed(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateBox(`flb_${d.id}`, { width: 2, depth: 1, height: 0.4 }, scene);
    m.position.set(d.position.x, 0.2, d.position.z);
    const mat = new StandardMaterial(`mat_flb_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.5, 0.3, 0.18);
    m.material = mat;
    return m;
  }
}
