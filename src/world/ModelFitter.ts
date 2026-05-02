import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { LoadedModel } from '../core/AssetLoader';

export type FitBox = {
  width: number;
  depth: number;
  height: number;
};

export function fitLoadedModelToBox(
  model: LoadedModel,
  target: FitBox,
  fill = 0.88,
  scaleMultiplier = 1
): number {
  const root = model.rootMesh;
  root.position.set(0, 0, 0);
  root.computeWorldMatrix(true);
  for (const mesh of model.meshes) mesh.computeWorldMatrix(true);

  const bounds = root.getHierarchyBoundingVectors(true, (mesh) => model.meshes.includes(mesh));
  const size = bounds.max.subtract(bounds.min);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) {
    root.scaling.scaleInPlace(scaleMultiplier);
    return scaleMultiplier;
  }

  const scale =
    Math.min(target.width / size.x, target.height / size.y, target.depth / size.z) *
    fill *
    scaleMultiplier;
  const center = bounds.min.add(size.scale(0.5));

  root.scaling.scaleInPlace(scale);
  root.position.copyFrom(
    new Vector3(
      -center.x * scale,
      -target.height / 2 - bounds.min.y * scale,
      -center.z * scale
    )
  );
  return scale;
}
