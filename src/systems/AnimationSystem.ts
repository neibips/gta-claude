import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Scene } from '@babylonjs/core/scene';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Skeleton } from '@babylonjs/core/Bones/skeleton';
import type { Bone } from '@babylonjs/core/Bones/bone';

export type AnimSet = Partial<Record<'idle' | 'walk' | 'run' | 'shoot' | 'punch' | 'jump' | 'hold_weapon' | 'death_fall' | 'hit_reaction', AnimationGroup>>;

export type RetargetTarget = TransformNode | Bone;

/**
 * Build a name → node lookup from a rig's visual root and skeleton.
 * Used to resolve animation targets when retargeting an AnimationGroup
 * loaded from a separate glb file onto a different rig.
 */
/** Strip exporter-specific prefixes (Mixamo, Blender) so a `mixamorig:Hips`
 * target binds to a `Hips` bone and vice versa. Used as a fallback key. */
const stripRigPrefix = (n: string): string =>
  n.replace(/^mixamorig[:_]?/i, '').replace(/^Armature\|/i, '');

export function buildRetargetMap(
  visualRoot: TransformNode | null,
  skeleton: Skeleton | null
): Map<string, RetargetTarget> {
  const map = new Map<string, RetargetTarget>();
  const addBoth = (name: string | undefined, node: RetargetTarget) => {
    if (!name) return;
    if (!map.has(name)) map.set(name, node);
    const stripped = stripRigPrefix(name);
    if (stripped !== name && !map.has(stripped)) map.set(stripped, node);
  };
  if (visualRoot) {
    const stack: TransformNode[] = [visualRoot];
    while (stack.length) {
      const n = stack.pop()!;
      addBoth(n.name, n);
      const kids = n.getChildren?.() as TransformNode[] | undefined;
      if (kids) for (const k of kids) stack.push(k);
    }
  }
  if (skeleton) {
    for (const b of skeleton.bones) {
      const linked = b.getTransformNode?.();
      if (linked) addBoth(linked.name, linked);
      addBoth(b.name, b);
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
    const tgt = targets.get(oldName) ?? targets.get(stripRigPrefix(oldName));
    if (!tgt) continue;
    ng.addTargetedAnimation(ta.animation.clone(), tgt);
    bound++;
  }
  if (bound === 0) {
    console.warn(`[retarget] ${newName}: no targets matched (source has ${source.targetedAnimations.length} channels)`);
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

  durationMs(name: keyof AnimSet): number {
    const a = this.anims[name];
    if (!a) return 0;
    const fps = 60;
    return ((a.to - a.from) / fps) * 1000;
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
