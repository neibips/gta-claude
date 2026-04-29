import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { Bone } from '@babylonjs/core/Bones/bone';

export type AnimSet = Partial<Record<'idle' | 'walk' | 'run' | 'shoot' | 'punch' | 'hold_weapon' | 'death_fall' | 'hit_reaction', AnimationGroup>>;

export type RetargetTarget = TransformNode | Bone;

/**
 * Build a name → node lookup from a rig's visual root and skeleton.
 * Used to resolve animation targets when retargeting an AnimationGroup
 * loaded from a separate glb file onto a different rig.
 */
export function buildRetargetMap(
  visualRoot: TransformNode | null,
  skeleton: Skeleton | null
): Map<string, RetargetTarget> {
  const map = new Map<string, RetargetTarget>();
  if (visualRoot) {
    const stack: TransformNode[] = [visualRoot];
    while (stack.length) {
      const n = stack.pop()!;
      if (n.name) map.set(n.name, n);
      const kids = n.getChildren?.() as TransformNode[] | undefined;
      if (kids) for (const k of kids) stack.push(k);
    }
  }
  if (skeleton) {
    for (const b of skeleton.bones) {
      const linked = b.getTransformNode?.();
      if (linked?.name && !map.has(linked.name)) map.set(linked.name, linked);
      if (b.name && !map.has(b.name)) map.set(b.name, b);
    }
  }
  return map;
}

/**
 * Build a fresh AnimationGroup whose targets point at the given rig's nodes,
 * keyframes copied from `source`. Returns null if no targets resolved.
 *
 * Matches by node name — assumes the source rig and destination rig share
 * the same bone naming, which is the case when both glbs export the same
 * underlying rig.
 */
export function retargetAnimationGroup(
  source: AnimationGroup,
  targets: Map<string, RetargetTarget>,
  scene: Scene,
  newName: string
): AnimationGroup | null {
  const ng = new AnimationGroup(newName, scene);
  let bound = 0;
  for (const ta of source.targetedAnimations) {
    const oldName = (ta.target as { name?: string } | null)?.name;
    if (!oldName) continue;
    const tgt = targets.get(oldName);
    if (!tgt) continue;
    ng.addTargetedAnimation(ta.animation.clone(), tgt);
    bound++;
  }
  if (bound === 0) {
    ng.dispose();
    return null;
  }
  ng.normalize(source.from, source.to);
  return ng;
}

const BLEND_DURATION = 0.15; // seconds per spec

export class AnimController {
  private current: AnimationGroup | null = null;
  constructor(private readonly anims: AnimSet) {
    for (const a of Object.values(anims)) a?.stop();
  }

  has(name: keyof AnimSet): boolean {
    return !!this.anims[name];
  }

  play(name: keyof AnimSet, loop = true): void {
    const next = this.anims[name];
    if (!next || next === this.current) return;
    const prev = this.current;
    // Crossfade by enabling blending on both animations and using blendingSpeed.
    next.enableBlending = true;
    next.blendingSpeed = 1 / Math.max(0.001, BLEND_DURATION * 60);
    next.start(loop, 1.0, next.from, next.to, false);
    if (prev) {
      prev.enableBlending = true;
      prev.blendingSpeed = 1 / Math.max(0.001, BLEND_DURATION * 60);
      prev.stop();
    }
    this.current = next;
  }

  stopAll(): void {
    for (const a of Object.values(this.anims)) a?.stop();
    this.current = null;
  }
}
