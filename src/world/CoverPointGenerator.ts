import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { SavedCoverPoint, CoverType } from '../types/map';

export type CoverPoint = {
  id: string;
  position: Vector3;
  direction: Vector3;
  type: CoverType;
  occupiedBy: string | null;
};

export class CoverPointGenerator {
  static load(saved: SavedCoverPoint[]): CoverPoint[] {
    return saved.map((c) => ({
      id: c.id,
      position: new Vector3(c.position.x, c.position.y, c.position.z),
      direction: new Vector3(c.direction.x, c.direction.y, c.direction.z).normalize(),
      type: c.type,
      occupiedBy: null,
    }));
  }
}
