import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Scene } from '@babylonjs/core/scene';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Player } from '../entities/Player';
import type { WeaponSystem } from './WeaponSystem';
import type { WaypointGraph } from '../world/WaypointGraph';

type PickupKind = 'rifle' | 'rocket' | 'water';

type Pickup = {
  mesh: Mesh;
  pos: Vector3;
  kind: PickupKind;
  amount: number;
  taken: boolean;
  respawnAt: number;
};

const PICKUP_COLORS: Record<PickupKind, Color3> = {
  rifle: new Color3(0.2, 1.0, 0.3),
  rocket: new Color3(1.0, 0.25, 0.15),
  water: new Color3(0.25, 0.6, 1.0),
};

const PICKUP_AMOUNTS: Record<PickupKind, number> = {
  rifle: 30,
  rocket: 1,
  water: 50,
};

const PICKUP_RADIUS = 1.6;
const RESPAWN_MS = 30_000;
const KIND_WEIGHTS: Array<[PickupKind, number]> = [
  ['rifle', 0.7],
  ['rocket', 0.12],
  ['water', 0.18],
];

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickKind(rng: () => number): PickupKind {
  const r = rng();
  let acc = 0;
  for (const [k, w] of KIND_WEIGHTS) {
    acc += w;
    if (r < acc) return k;
  }
  return 'rifle';
}

export class AmmoPickupSystem {
  private readonly pickups: Pickup[] = [];
  private materials: Record<PickupKind, StandardMaterial> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly player: Player,
    private readonly weapons: WeaponSystem
  ) {}

  spawnAll(npcGraph: WaypointGraph, count = 60): void {
    const rng = mulberry32(0xa11ab1a5);
    const nodes = npcGraph.nodeArr;
    if (nodes.length === 0) return;

    this.materials = {
      rifle: this.makeMaterial('rifle'),
      rocket: this.makeMaterial('rocket'),
      water: this.makeMaterial('water'),
    };

    const placed: Vector3[] = [];
    const minSep2 = 14 * 14;
    let tries = 0;
    while (this.pickups.length < count && tries < count * 20) {
      tries++;
      const wp = nodes[Math.floor(rng() * nodes.length)];
      const p = wp.position;
      let tooClose = false;
      for (const q of placed) {
        if (Vector3.DistanceSquared(p, q) < minSep2) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      placed.push(p);
      this.spawnAt(p, pickKind(rng));
    }
  }

  private makeMaterial(kind: PickupKind): StandardMaterial {
    const mat = new StandardMaterial(`pickupMat_${kind}`, this.scene);
    const c = PICKUP_COLORS[kind];
    mat.emissiveColor = c;
    mat.diffuseColor = new Color3(0, 0, 0);
    mat.specularColor = new Color3(0, 0, 0);
    // Decouples pickup shading from scene lights — avoids per-mesh shader
    // recompilation when lights move and prevents the 4-light-per-mesh cap
    // from clobbering nearby world materials.
    mat.disableLighting = true;
    mat.freeze();
    return mat;
  }

  private spawnAt(pos: Vector3, kind: PickupKind): void {
    const y = pos.y + 0.6;
    const mesh = MeshBuilder.CreateSphere(
      `pickup_${this.pickups.length}`,
      { diameter: 0.55, segments: 8 },
      this.scene
    );
    mesh.position.set(pos.x, y, pos.z);
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.receiveShadows = false;
    mesh.material = this.materials![kind];
    mesh.metadata = { kind: 'pickup', pickupKind: kind };
    mesh.freezeWorldMatrix();

    this.pickups.push({
      mesh,
      pos: new Vector3(pos.x, y, pos.z),
      kind,
      amount: PICKUP_AMOUNTS[kind],
      taken: false,
      respawnAt: 0,
    });
  }

  update(_dt: number): void {
    const now = performance.now();
    const player = this.player.position();
    const r2 = PICKUP_RADIUS * PICKUP_RADIUS;

    for (const pu of this.pickups) {
      if (pu.taken) {
        if (now >= pu.respawnAt) {
          pu.taken = false;
          pu.mesh.setEnabled(true);
        }
        continue;
      }
      const dx = player.x - pu.pos.x;
      const dz = player.z - pu.pos.z;
      if (dx * dx + dz * dz <= r2) this.collect(pu);
    }
  }

  private collect(pu: Pickup): void {
    const target = this.weapons.weapons.find((w) => w.cfg.ammoType === pu.kind);
    if (target) {
      target.ammoInMag += pu.amount;
      target.totalAmmo += pu.amount;
    }
    pu.taken = true;
    pu.respawnAt = performance.now() + RESPAWN_MS;
    pu.mesh.setEnabled(false);
  }

  dispose(): void {
    for (const pu of this.pickups) pu.mesh.dispose();
    this.pickups.length = 0;
    if (this.materials) {
      this.materials.rifle.dispose();
      this.materials.rocket.dispose();
      this.materials.water.dispose();
      this.materials = null;
    }
  }
}
