import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Bone } from '@babylonjs/core/Bones/bone';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AssetLoader } from '../core/AssetLoader';

export type WeaponConfigEntry = {
  id: string;
  slot: number;
  name: string;
  assetPath: string | null;
  damage: number;
  range: number;
  fireRate: number;
  magazineSize: number;
  reloadTime: number;
  boneName: string;
  positionOffset: { x: number; y: number; z: number };
  rotationOffset: { x: number; y: number; z: number };
  scale: number;
  ammoType: string;
  effects: string[];
};

export class Weapon {
  meshRoot: TransformNode | null = null;
  ammoInMag: number;
  totalAmmo: number;
  lastFireAt = 0;

  constructor(public readonly cfg: WeaponConfigEntry) {
    this.ammoInMag = cfg.magazineSize;
    this.totalAmmo = cfg.magazineSize > 0 ? cfg.magazineSize * 3 : 0;
  }

  async load(scene: Scene, loader: AssetLoader): Promise<void> {
    if (!this.cfg.assetPath) {
      this.meshRoot = null;
      return;
    }
    try {
      const m = await loader.loadModel(this.cfg.assetPath);
      const root = m.rootMesh as unknown as TransformNode;
      this.meshRoot = root;
      root.setEnabled(false);
      // Preserve sign of the GLB importer's RH→LH flip on each axis when applying
      // weapon scale; overwriting with positive scale on all axes mirrors the model.
      const sx = Math.sign(root.scaling.x) || 1;
      const sy = Math.sign(root.scaling.y) || 1;
      const sz = Math.sign(root.scaling.z) || 1;
      root.scaling.set(sx * this.cfg.scale, sy * this.cfg.scale, sz * this.cfg.scale);
    } catch (e) {
      console.warn(`[Weapon] failed to load ${this.cfg.assetPath}`, e);
      const fb = MeshBuilder.CreateBox(`${this.cfg.id}_fb`, { width: 0.1, depth: 0.6, height: 0.15 }, scene);
      const mat = new StandardMaterial(`${this.cfg.id}_fbm`, scene);
      mat.diffuseColor = new Color3(0.2, 0.2, 0.2);
      fb.material = mat;
      fb.setEnabled(false);
      this.meshRoot = fb as unknown as TransformNode;
    }
  }

  attach(bone: Bone | null, parentMesh: AbstractMesh): void {
    const root = this.meshRoot as unknown as Mesh | null;
    if (!root) return;
    root.setEnabled(true);
    // Prefer the bone's linked TransformNode (skinned glb path) — parenting to a
    // node is more reliable than attachToBone when the imported root is a
    // __root__ wrapper with non-identity scaling.
    const linked = bone?.getTransformNode?.();
    if (linked) {
      root.parent = linked;
    } else if (bone) {
      root.attachToBone(bone, parentMesh);
    } else {
      root.parent = parentMesh;
    }
    root.position.set(this.cfg.positionOffset.x, this.cfg.positionOffset.y, this.cfg.positionOffset.z);
    const rOff = Quaternion.RotationYawPitchRoll(
      this.cfg.rotationOffset.y,
      this.cfg.rotationOffset.x,
      this.cfg.rotationOffset.z
    );
    root.rotationQuaternion = rOff;
  }

  detach(): void {
    const root = this.meshRoot as unknown as Mesh | null;
    if (!root) return;
    if ('detachFromBone' in root) (root as Mesh).detachFromBone();
    root.setEnabled(false);
  }

  canFire(now: number): boolean {
    if (this.cfg.fireRate <= 0) return false;
    const interval = 1000 / this.cfg.fireRate;
    if (now - this.lastFireAt < interval) return false;
    if (this.cfg.magazineSize > 0 && this.ammoInMag <= 0) return false;
    return true;
  }

  registerFire(now: number): void {
    this.lastFireAt = now;
    if (this.cfg.magazineSize > 0) this.ammoInMag--;
  }

  /** Returns muzzle world position; falls back to weaponRoot position. */
  muzzleWorldPosition(playerPos: Vector3, fwd: Vector3): Vector3 {
    if (this.meshRoot) {
      const m = (this.meshRoot as unknown as AbstractMesh).getAbsolutePosition();
      return m.add(fwd.scale(0.4));
    }
    return playerPos.add(fwd.scale(0.6)).add(new Vector3(0, 1.2, 0));
  }
}
