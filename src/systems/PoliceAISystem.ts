import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import { Policeman } from '../entities/Policeman';
import { GameConfig } from '../config/GameConfig';
import type { Player } from '../entities/Player';
import type { WaypointGraph, Waypoint } from '../world/WaypointGraph';

const STAGGER_RADIUS = 6;

type PatrolState = { wp: Waypoint | null; prevId: string | null };

export class PoliceAISystem {
  /** Damage applied to player per shot (per policeman). */
  static readonly DAMAGE_PER_SHOT = 6;

  private patrol = new WeakMap<Policeman, PatrolState>();

  constructor(
    private readonly scene: Scene,
    private readonly player: Player,
    private readonly patrolGraph: WaypointGraph | null = null
  ) {}

  /** Tick all police. */
  update(police: Policeman[], dt: number): void {
    const now = performance.now();
    const alive = police.filter((p) => !p.isDead());
    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      this.updateOne(p, alive, i, now, dt);
    }
  }

  private updateOne(p: Policeman, all: Policeman[], idx: number, now: number, dt: number): void {
    if (p.isDead()) return;
    const playerPos = this.player.position();
    const distToPlayer = Vector3.Distance(p.position(), playerPos);
    const hasLOS = p.hasLineOfSight();

    // RETREAT overrides everything if HP is low
    if (p.hp <= GameConfig.police.hp * 0.3 && p.state !== 'RETREAT' && p.state !== 'DEAD') {
      p.releaseCover();
      p.setState('RETREAT');
    }

    switch (p.state) {
      case 'PATROL': {
        // Engage the player on sight or at close range; otherwise wander
        // along the sidewalk waypoint graph at walking pace.
        if (hasLOS && distToPlayer < GameConfig.police.losMaxRange) {
          p.setState('CHASE');
          break;
        }
        if (this.patrolGraph) {
          let st = this.patrol.get(p);
          if (!st) {
            const start = this.patrolGraph.nearest(p.position());
            st = { wp: start, prevId: null };
            this.patrol.set(p, st);
          }
          if (!st.wp) st.wp = this.patrolGraph.nearest(p.position());
          const target = st.wp.position;
          p.playWalking();
          const reached = p.moveTo(target, GameConfig.police.patrolSpeed, dt);
          if (reached) {
            const next = this.patrolGraph.next(st.wp, st.prevId);
            st.prevId = st.wp.id;
            st.wp = next;
          }
        }
        break;
      }
      case 'CHASE': {
        p.playRunning();
        // Move toward a flanking point so they don't all stack up.
        const flankAngle = (idx / Math.max(1, all.length)) * Math.PI * 2;
        const target = playerPos.add(
          new Vector3(Math.cos(flankAngle) * STAGGER_RADIUS, 0, Math.sin(flankAngle) * STAGGER_RADIUS)
        );
        const reached = p.moveTo(target, GameConfig.police.chaseSpeed, dt);
        if (hasLOS && distToPlayer < 25) {
          // Try to find cover, otherwise attack
          const cover = p.pickCover();
          if (cover) p.setState('TAKE_COVER');
          else p.setState('ATTACK');
        } else if (reached && !hasLOS) {
          p.setState('SEARCH');
        }
        break;
      }
      case 'SEARCH': {
        p.playWalking();
        // Walk in random direction until LOS regained.
        if (hasLOS) {
          p.setState('CHASE');
        } else if (p.isStateExpired(now)) {
          p.setState('CHASE');
        }
        const target = playerPos;
        p.moveTo(target, GameConfig.police.chaseSpeed * 0.7, dt);
        break;
      }
      case 'TAKE_COVER': {
        const cover = p['currentCover'] as ReturnType<Policeman['pickCover']>;
        if (!cover) {
          p.setState('CHASE');
          break;
        }
        const reached = p.moveTo(cover.position, GameConfig.police.chaseSpeed, dt);
        if (reached) {
          p.stopAnim();
          if (hasLOS) p.setState('ATTACK');
        }
        if (p.isStateExpired(now)) {
          // periodic reposition
          p.releaseCover();
          p.setState('FLANK');
        }
        break;
      }
      case 'FLANK': {
        p.playRunning();
        const flankAngle = (idx / Math.max(1, all.length)) * Math.PI * 2 + Math.PI;
        const target = playerPos.add(
          new Vector3(Math.cos(flankAngle) * 10, 0, Math.sin(flankAngle) * 10)
        );
        const reached = p.moveTo(target, GameConfig.police.flankSpeed, dt);
        if (reached || p.isStateExpired(now)) {
          if (hasLOS) p.setState('ATTACK');
          else p.setState('CHASE');
        }
        break;
      }
      case 'ATTACK': {
        // Stand and shoot. Move only if no LOS.
        if (!hasLOS) {
          p.setAiming(false);
          p.setState('CHASE');
          break;
        }
        p.setAiming(true);
        p.faceTarget(playerPos, dt);
        if (p.canShoot(now) && !this.allyInLine(p, all, playerPos)) {
          p.scheduleNextShot(now);
          p.playShootRecoil();
          p.onShootPlayer?.(PoliceAISystem.DAMAGE_PER_SHOT);
        }
        if (p.isStateExpired(now)) {
          // Reposition
          if (Math.random() < 0.5) {
            const cover = p.pickCover();
            if (cover) p.setState('TAKE_COVER');
            else p.setState('FLANK');
          } else {
            p.setState('FLANK');
          }
        }
        break;
      }
      case 'RETREAT': {
        p.playRunning();
        const away = p.position().subtract(playerPos);
        away.y = 0;
        if (away.lengthSquared() < 1) away.set(1, 0, 0);
        away.normalize();
        const target = p.position().add(away.scale(15));
        p.moveTo(target, GameConfig.police.flankSpeed, dt);
        if (Vector3.Distance(p.position(), playerPos) > 35) {
          p.setState('CHASE'); // re-engage at safe distance
        }
        break;
      }
      case 'DEAD':
        return;
    }
  }

  /** True if shooting at player would cross another (ally) policeman. */
  private allyInLine(p: Policeman, all: Policeman[], playerPos: Vector3): boolean {
    const from = p.position();
    const dir = playerPos.subtract(from);
    const dist = dir.length();
    if (dist < 1) return false;
    dir.scaleInPlace(1 / dist);
    for (const other of all) {
      if (other === p || other.isDead()) continue;
      const op = other.position();
      const toOther = op.subtract(from);
      const proj = Vector3.Dot(toOther, dir);
      if (proj <= 0 || proj >= dist) continue;
      const closest = from.add(dir.scale(proj));
      if (Vector3.Distance(closest, op) < 1.0) return true;
    }
    return false;
  }
}
