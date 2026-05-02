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

export type WeaponAttachmentOffsets = Pick<
  WeaponConfigEntry,
  'positionOffset' | 'rotationOffset'
>;

const MIN_PARENT_SCALE = 1e-4;

function inverseScaleComponent(value: number): number {
  const abs = Math.abs(value);
  return abs > MIN_PARENT_SCALE ? 1 / abs : 1;
}

function attachmentParentScale(parent: TransformNode): Vector3 {
  parent.computeWorldMatrix(true);
  return parent.absoluteScaling;
}

export function attachWeaponModelToRightHand(
  root: TransformNode,
  bone: Bone | null,
  fallbackParent: TransformNode,
  offsets: WeaponAttachmentOffsets,
  baseScaling = root.scaling
): void {
  const linked = bone?.getTransformNode?.();
  const parent = linked ?? fallbackParent;
  const parentScale = attachmentParentScale(parent);
  const invScale = new Vector3(
    inverseScaleComponent(parentScale.x),
    inverseScaleComponent(parentScale.y),
    inverseScaleComponent(parentScale.z)
  );

  root.setEnabled(true);
  root.parent = parent;
  root.position.set(
    offsets.positionOffset.x * invScale.x,
    offsets.positionOffset.y * invScale.y,
    offsets.positionOffset.z * invScale.z
  );
  root.scaling.set(
    baseScaling.x * invScale.x,
    baseScaling.y * invScale.y,
    baseScaling.z * invScale.z
  );
  root.rotationQuaternion = Quaternion.RotationYawPitchRoll(
    offsets.rotationOffset.y,
    offsets.rotationOffset.x,
    offsets.rotationOffset.z
  );
}

export class Weapon {
  meshRoot: TransformNode | null = null;
  private baseScaling: Vector3 | null = null;
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
      // Multiply, don't overwrite — overwriting throws away whatever scale the
      // GLB importer applied (often the model's real units), which would make
      // the weapon invisibly small or oversized.
      root.scaling.x *= this.cfg.scale;
      root.scaling.y *= this.cfg.scale;
      root.scaling.z *= this.cfg.scale;
      this.baseScaling = root.scaling.clone();
    } catch (e) {
      console.warn(`[Weapon] failed to load ${this.cfg.assetPath}`, e);
      const fb = MeshBuilder.CreateBox(`${this.cfg.id}_fb`, { width: 0.1, depth: 0.6, height: 0.15 }, scene);
      const mat = new StandardMaterial(`${this.cfg.id}_fbm`, scene);
      mat.diffuseColor = new Color3(0.2, 0.2, 0.2);
      fb.material = mat;
      fb.setEnabled(false);
      fb.scaling.scaleInPlace(this.cfg.scale);
      this.baseScaling = fb.scaling.clone();
      this.meshRoot = fb as unknown as TransformNode;
    }
  }

  attach(bone: Bone | null, parentMesh: AbstractMesh): void {
    const root = this.meshRoot;
    if (!root) return;
    attachWeaponModelToRightHand(
      root,
      bone,
      parentMesh as unknown as TransformNode,
      this.cfg,
      this.baseScaling ?? root.scaling
    );
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
