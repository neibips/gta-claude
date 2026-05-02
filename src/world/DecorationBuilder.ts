import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { CityMapFile, SavedAssetInstance, SavedDecoration, SavedTree } from '../types/map';
import type { AssetLoader } from '../core/AssetLoader';
import { fitLoadedModelToBox } from './ModelFitter';

const hexToColor3 = (value?: string): Color3 => {
  if (!value?.startsWith('#')) return new Color3(0.45, 0.45, 0.42);
  const n = parseInt(value.slice(1), 16);
  return new Color3(((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255);
};

export class DecorationBuilder {
  static async build(
    scene: Scene,
    root: TransformNode,
    map: CityMapFile,
    loader?: AssetLoader
  ): Promise<{ trees: Mesh[]; deco: Mesh[] }> {
    const trees = map.trees.map((t) => this.buildTree(scene, t, root));
    const deco = map.decorations.map((d) => this.buildDeco(scene, d, root));
    for (const inst of map.assetInstances ?? []) {
      const mesh = this.buildAssetProxy(scene, inst, root);
      deco.push(mesh);
      if (loader && inst.modelPath) await this.loadAssetModel(loader, inst, mesh);
    }
    return { trees, deco };
  }

  private static buildTree(scene: Scene, t: SavedTree, root: TransformNode): Mesh {
    const trunkH = (t.type === 'pine_cluster' ? 3.2 : 2.4) * t.scale;
    const trunk = MeshBuilder.CreateCylinder(`trunk_${t.id}`, { height: trunkH, diameter: 0.3 * t.scale }, scene);
    trunk.position.set(t.position.x, t.position.y + trunkH / 2, t.position.z);
    const trunkMat = new StandardMaterial(`mat_trunk_${t.id}`, scene);
    trunkMat.diffuseColor = new Color3(0.35, 0.22, 0.14);
    trunk.material = trunkMat;
    trunk.parent = root;

    const foliage =
      t.type === 'pine_cluster'
        ? MeshBuilder.CreateCylinder(`leaves_${t.id}`, { height: 4.2 * t.scale, diameterTop: 0.2 * t.scale, diameterBottom: 3.2 * t.scale }, scene)
        : MeshBuilder.CreateSphere(`leaves_${t.id}`, { diameter: 3 * t.scale, segments: 8 }, scene);
    foliage.position.set(t.position.x, t.position.y + trunkH + 0.8 * t.scale, t.position.z);
    const leafMat = new StandardMaterial(`mat_leaf_${t.id}`, scene);
    leafMat.diffuseColor = t.type === 'pine_cluster' ? new Color3(0.12, 0.32, 0.18) : new Color3(0.18, 0.45, 0.18);
    leafMat.specularColor = new Color3(0, 0, 0);
    foliage.material = leafMat;
    foliage.parent = trunk;
    foliage.position.subtractInPlace(trunk.position);

    trunk.checkCollisions = true;
    trunk.metadata = { kind: 'tree', districtId: t.districtId, treeType: t.type };
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
      case 'barrier':
        m = this.box(scene, d, { width: 2.4, depth: 0.5, height: 0.8 }, '#c9a33a');
        break;
      case 'crate':
        m = this.box(scene, d, { width: 1.2, depth: 1.2, height: 1.2 }, '#7a5a35');
        break;
      case 'pipe':
        m = this.pipe(scene, d);
        break;
      case 'monument':
        m = this.monument(scene, d);
        break;
      case 'curb':
      default:
        m = this.box(scene, d, { width: 1, depth: 0.2, height: 0.15 }, '#9a9a9a');
    }
    m.parent = root;
    m.metadata = {
      ...(m.metadata ?? {}),
      kind: 'decoration',
      decoKind: d.kind,
      districtId: d.districtId,
      modelPath: d.modelPath,
    };
    return m;
  }

  private static box(
    scene: Scene,
    d: SavedDecoration,
    size: { width: number; depth: number; height: number },
    color: string
  ): Mesh {
    const m = MeshBuilder.CreateBox(`deco_${d.id}`, size, scene);
    m.position.set(d.position.x, d.position.y + size.height / 2, d.position.z);
    m.rotation.y = d.rotationY;
    const mat = new StandardMaterial(`mat_deco_${d.id}`, scene);
    mat.diffuseColor = hexToColor3(d.materialId ?? color);
    m.material = mat;
    m.checkCollisions = size.height > 0.3;
    return m;
  }

  private static lamp(scene: Scene, d: SavedDecoration): Mesh {
    const post = MeshBuilder.CreateCylinder(`lamp_${d.id}`, { height: 4, diameter: 0.15 }, scene);
    post.position.set(d.position.x, d.position.y + 2, d.position.z);
    post.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_lamp_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.2, 0.2, 0.22);
    post.material = mat;
    post.checkCollisions = true;
    post.metadata = { collisionShape: 'cylinder' };
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
    seat.position.set(d.position.x, d.position.y + 0.5, d.position.z);
    seat.rotation.y = d.rotationY;
    seat.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_bench_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.45, 0.3, 0.18);
    seat.material = mat;
    seat.checkCollisions = true;
    const back = MeshBuilder.CreateBox(`benchb_${d.id}`, { width: 2, depth: 0.1, height: 0.6 }, scene);
    back.parent = seat;
    back.position.set(0, 0.4, -0.2);
    back.material = mat;
    return seat;
  }

  private static trashBin(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateCylinder(`bin_${d.id}`, { height: 1, diameter: 0.6 }, scene);
    m.position.set(d.position.x, d.position.y + 0.5, d.position.z);
    m.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_bin_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.3, 0.3, 0.3);
    m.material = mat;
    m.checkCollisions = true;
    m.metadata = { collisionShape: 'cylinder' };
    return m;
  }

  private static sign(scene: Scene, d: SavedDecoration): Mesh {
    const post = MeshBuilder.CreateCylinder(`sign_${d.id}`, { height: 3, diameter: 0.15 }, scene);
    post.position.set(d.position.x, d.position.y + 1.5, d.position.z);
    post.rotation.y = d.rotationY;
    post.checkCollisions = true;
    const board = MeshBuilder.CreateBox(`signb_${d.id}`, { width: 2, depth: 0.05, height: 1 }, scene);
    board.parent = post;
    board.position.set(0, 1.3, 0);

    const tex = new DynamicTexture(`signt_${d.id}`, { width: 256, height: 128 }, scene, false);
    const label = d.tags?.includes('shop') ? 'SHOP' : d.tags?.includes('field') ? 'FIELD' : 'POLICE';
    tex.drawText(label, 36, 80, 'bold 52px sans-serif', '#ffffff', '#1a3a78', true);
    const mat = new StandardMaterial(`mat_sign_${d.id}`, scene);
    mat.diffuseTexture = tex;
    mat.emissiveColor = new Color3(0.2, 0.2, 0.2);
    board.material = mat;
    return post;
  }

  private static fence(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateBox(`fence_${d.id}`, { width: 4, depth: 0.1, height: 1.2 }, scene);
    m.position.set(d.position.x, d.position.y + 0.6, d.position.z);
    m.rotation.y = d.rotationY;
    m.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_fence_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.5, 0.3, 0.18);
    m.material = mat;
    m.checkCollisions = true;
    return m;
  }

  private static hydrant(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateCylinder(`hyd_${d.id}`, { height: 0.7, diameter: 0.3 }, scene);
    m.position.set(d.position.x, d.position.y + 0.35, d.position.z);
    m.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_hyd_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.85, 0.18, 0.18);
    m.material = mat;
    m.checkCollisions = true;
    m.metadata = { collisionShape: 'cylinder' };
    return m;
  }

  private static flowerBed(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateBox(`flb_${d.id}`, { width: 2, depth: 1, height: 0.4 }, scene);
    m.position.set(d.position.x, d.position.y + 0.2, d.position.z);
    m.rotation.y = d.rotationY;
    m.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_flb_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.5, 0.3, 0.18);
    m.material = mat;
    m.checkCollisions = true;
    return m;
  }

  private static pipe(scene: Scene, d: SavedDecoration): Mesh {
    const m = MeshBuilder.CreateCylinder(`pipe_${d.id}`, { height: 5, diameter: 0.5 }, scene);
    m.position.set(d.position.x, d.position.y + 0.35, d.position.z);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = d.rotationY;
    m.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_pipe_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.34, 0.36, 0.38);
    m.material = mat;
    m.checkCollisions = true;
    m.metadata = { collisionShape: 'cylinder' };
    return m;
  }

  private static monument(scene: Scene, d: SavedDecoration): Mesh {
    const base = MeshBuilder.CreateCylinder(`monument_${d.id}`, { height: 2.8, diameterTop: 0.8, diameterBottom: 1.6 }, scene);
    base.position.set(d.position.x, d.position.y + 1.4, d.position.z);
    base.scaling.setAll(d.scale);
    const mat = new StandardMaterial(`mat_monument_${d.id}`, scene);
    mat.diffuseColor = new Color3(0.58, 0.58, 0.55);
    base.material = mat;
    base.checkCollisions = true;
    base.metadata = { collisionShape: 'cylinder' };
    return base;
  }

  private static buildAssetProxy(scene: Scene, inst: SavedAssetInstance, root: TransformNode): Mesh {
    const size = inst.size ?? {
      width: Math.max(1, inst.scale.x),
      depth: Math.max(1, inst.scale.z),
      height: Math.max(1, inst.scale.y),
    };
    let mesh: Mesh;
    switch (inst.primitive) {
      case 'cylinder':
      case 'tower':
        mesh = MeshBuilder.CreateCylinder(`asset_${inst.id}`, { height: size.height, diameter: size.width }, scene);
        break;
      case 'sphere':
        mesh = MeshBuilder.CreateSphere(`asset_${inst.id}`, { diameter: size.width }, scene);
        break;
      case 'bridge':
        mesh = MeshBuilder.CreateBox(`asset_${inst.id}`, { width: size.width, depth: size.depth, height: size.height }, scene);
        break;
      case 'ramp':
      case 'arch':
      case 'billboard':
      case 'box':
      default:
        mesh = MeshBuilder.CreateBox(`asset_${inst.id}`, { width: size.width, depth: size.depth, height: size.height }, scene);
    }
    mesh.position.set(inst.position.x, inst.position.y + size.height / 2, inst.position.z);
    mesh.rotation.y = inst.rotationY;
    const mat = new StandardMaterial(`mat_asset_${inst.id}`, scene);
    mat.diffuseColor = hexToColor3(inst.materialId);
    mesh.material = mat;
    mesh.visibility = inst.modelPath ? 0 : 1;
    mesh.checkCollisions = inst.collision !== 'none';
    mesh.receiveShadows = true;
    mesh.parent = root;
    mesh.metadata = {
      kind: inst.category === 'vegetation' ? 'tree' : 'decoration',
      assetId: inst.id,
      assetCategory: inst.category,
      districtId: inst.districtId,
      modelPath: inst.modelPath,
      tags: inst.tags,
      collisionShape: inst.collision === 'cylinder' ? 'cylinder' : 'box',
    };
    return mesh;
  }

  private static async loadAssetModel(
    loader: AssetLoader,
    inst: SavedAssetInstance,
    proxy: Mesh
  ): Promise<void> {
    if (!inst.modelPath) return;
    try {
      const model = await loader.loadModel(inst.modelPath);
      fitLoadedModelToBox(
        model,
        {
          width: inst.size?.width ?? Math.max(1, inst.scale.x),
          depth: inst.size?.depth ?? Math.max(1, inst.scale.z),
          height: inst.size?.height ?? Math.max(1, inst.scale.y),
        },
        0.9
      );
      model.rootMesh.parent = proxy;
      for (const mesh of model.meshes) {
        mesh.receiveShadows = true;
        mesh.checkCollisions = false;
        mesh.metadata = { kind: 'asset_visual', assetId: inst.id, modelPath: inst.modelPath };
      }
    } catch (e) {
      console.warn(`[DecorationBuilder] failed to load ${inst.modelPath}`, e);
      proxy.visibility = 1;
    }
  }
}
