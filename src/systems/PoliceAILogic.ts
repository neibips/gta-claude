// Pure-logic helpers for PoliceAISystem — extracted so they can be unit-tested
// without a BabylonJS scene. The runtime PoliceAISystem delegates to these.

export type V2 = { x: number; z: number };

export function pickBestCover<C extends { id: string; position: V2; occupiedBy: string | null }>(
  candidates: readonly C[],
  selfId: string,
  selfPos: V2,
  playerPos: V2
): C | null {
  let best: C | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    if (c.occupiedBy && c.occupiedBy !== selfId) continue;
    const dxP = c.position.x - playerPos.x;
    const dzP = c.position.z - playerPos.z;
    const distToPlayer2 = dxP * dxP + dzP * dzP;
    if (distToPlayer2 < 36) continue;
    const dxM = c.position.x - selfPos.x;
    const dzM = c.position.z - selfPos.z;
    const distToMe2 = dxM * dxM + dzM * dzM;
    const score = distToMe2 + distToPlayer2 * 0.4;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** True if a shooting line from `from` to `target` would cross any other ally
 *  closer than `radius`. Used to prevent friendly fire / stacking up. */
export function allyCrossesLine(
  from: V2,
  target: V2,
  others: readonly V2[],
  radius = 1.0
): boolean {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1) return false;
  const ux = dx / dist;
  const uz = dz / dist;
  for (const o of others) {
    const ox = o.x - from.x;
    const oz = o.z - from.z;
    const proj = ox * ux + oz * uz;
    if (proj <= 0 || proj >= dist) continue;
    const cx = from.x + ux * proj;
    const cz = from.z + uz * proj;
    const d = Math.hypot(cx - o.x, cz - o.z);
    if (d < radius) return true;
  }
  return false;
}

/** Stagger ring offset so multiple police don't pile on the same point. */
export function staggerOffset(idx: number, count: number, radius: number): { x: number; z: number } {
  const a = (idx / Math.max(1, count)) * Math.PI * 2;
  return { x: Math.cos(a) * radius, z: Math.sin(a) * radius };
}
