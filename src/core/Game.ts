import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { GameEngine } from './Engine';
import { SceneManager } from './SceneManager';
import { PhysicsManager } from './PhysicsManager';
import { InputManager } from './InputManager';
import { AssetLoader } from './AssetLoader';
import { MapLoader } from '../world/MapLoader';
import { MapBuilder, type BuiltMap } from '../world/MapBuilder';
import { Player } from '../entities/Player';
import { WeaponSystem } from '../systems/WeaponSystem';
import { SpawnManager } from '../systems/SpawnManager';
import { PoliceAISystem } from '../systems/PoliceAISystem';
import { TrafficSystem } from '../systems/TrafficSystem';
import { WantedSystem } from '../systems/WantedSystem';
import { HUD } from '../ui/HUD';
import { StartScreen, type StartScreenHandle } from '../ui/StartScreen';
import { GameConfig } from '../config/GameConfig';
import weaponConfigJson from '../config/WeaponConfig.json';
import type { WeaponConfigEntry } from '../entities/Weapon';
import type { Vehicle } from '../entities/Vehicle';
import { NPC } from '../entities/NPC';

export class Game {
  private engine: GameEngine | null = null;
  private sceneMgr: SceneManager | null = null;
  private physics: PhysicsManager | null = null;
  private input: InputManager | null = null;
  private loader: AssetLoader | null = null;
  private builtMap: BuiltMap | null = null;
  private player: Player | null = null;
  private weapons: WeaponSystem | null = null;
  private spawn: SpawnManager | null = null;
  private police: PoliceAISystem | null = null;
  private traffic: TrafficSystem | null = null;
  private wanted: WantedSystem | null = null;
  private hud: HUD | null = null;
  private startUI: StartScreenHandle | null = null;
  private playerVehicle: Vehicle | null = null;
  private cleanups: Array<() => void> = [];
  private hudReady = false;
  private lastFrame = 0;
  private running = false;

  constructor(private readonly canvas: HTMLCanvasElement) {}

  async boot(): Promise<void> {
    this.engine = new GameEngine(this.canvas);
    this.sceneMgr = new SceneManager(this.engine);
    this.physics = new PhysicsManager();
    this.input = new InputManager(this.canvas);
    this.loader = new AssetLoader(this.sceneMgr.scene);

    this.startUI = StartScreen.mount(this.sceneMgr.scene, () => this.handlePlay());

    // Begin loading flow.
    this.engine.startRenderLoop(() => this.sceneMgr!.scene.render());

    try {
      this.startUI.setStatus('Loading map…');
      this.startUI.setProgress(0.05);
      const map = await MapLoader.load();

      this.startUI.setStatus('Initializing physics…');
      this.startUI.setProgress(0.15);
      const hasPhysics = await this.physics.init(this.sceneMgr.scene);

      this.startUI.setStatus('Building city…');
      this.startUI.setProgress(0.35);
      this.builtMap = MapBuilder.build(this.sceneMgr.scene, map, hasPhysics);
      const shadowGen = this.sceneMgr.shadowGen;
      for (const m of [...this.builtMap.buildings, ...this.builtMap.trees]) shadowGen.addShadowCaster(m);

      this.startUI.setStatus('Loading player…');
      this.startUI.setProgress(0.55);
      this.player = new Player(this.sceneMgr.scene, this.input, this.canvas);
      this.player.setSpawn(this.builtMap.spawn.player);
      await this.player.load(this.loader);
      this.player.setupCamera();
      if (hasPhysics) this.player.enablePhysics();
      shadowGen.addShadowCaster(this.player.root);

      this.startUI.setStatus('Loading weapons…');
      this.startUI.setProgress(0.75);
      this.weapons = new WeaponSystem(this.sceneMgr.scene, this.loader, this.player);
      await this.weapons.load();

      this.wanted = new WantedSystem();
      this.spawn = new SpawnManager(
        this.sceneMgr.scene,
        this.loader,
        this.builtMap.npcGraph,
        { npc: this.builtMap.spawn.npc, police: this.builtMap.spawn.police },
        this.builtMap.coverPoints,
        this.player
      );
      this.spawn.prespawnAll();
      this.police = new PoliceAISystem(this.sceneMgr.scene, this.player);
      this.traffic = new TrafficSystem(
        this.sceneMgr.scene,
        this.loader,
        this.builtMap.trafficGraph,
        this.builtMap.spawn.cars
      );
      this.traffic.ensureMin();

      this.hud = new HUD(this.sceneMgr.scene, (weaponConfigJson as { weapons: WeaponConfigEntry[] }).weapons);
      this.cleanups.push(this.wanted.onChange((lvl) => {
        this.hud!.wanted.setLevel(lvl);
        this.spawn!.setDesiredPolice(this.wanted!.policeForLevel());
      }));

      // Hook player events
      this.player.onDeath = () => {
        this.wanted!.onPlayerDied();
      };

      // Hook weapon events
      this.weapons.setTargets([
        ...this.spawn.npcs,
        ...this.spawn.police,
      ]);

      // Spawned NPC death → wanted bump
      const onNPCDeath = (_n: import('../entities/NPC').NPC, byPlayer: boolean) => {
        if (byPlayer) this.wanted!.onNPCKilled();
      };
      const onPoliceDeath = () => {
        this.wanted!.onPoliceKilled();
      };
      // Patch any newly spawned npc/police
      const wireSpawned = () => {
        for (const n of this.spawn!.npcs) if (!n.onDeath) n.onDeath = onNPCDeath;
        for (const p of this.spawn!.police) {
          if (!p.onDeath) p.onDeath = onPoliceDeath;
          if (!p.onShootPlayer) {
            p.onShootPlayer = (dmg: number) => this.player!.takeDamage(dmg);
          }
        }
        this.weapons!.setTargets([
          ...this.spawn!.npcs.filter((n) => !n.isDead()),
          ...this.spawn!.police.filter((p) => !p.isDead()),
        ]);
      };
      this.cleanups.push(() => void wireSpawned);
      this.wireSpawnedRef = wireSpawned;

      // Input bindings
      this.cleanups.push(this.input.onKeyDownOnce((code) => this.onKeyDown(code)));

      this.startUI.setStatus('Ready');
      this.startUI.setProgress(1);
      this.startUI.enablePlay(true);
      (window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete = true;
    } catch (e) {
      console.error('[Game] boot failed', e);
      this.startUI?.setStatus(String((e as Error).message ?? e));
      this.startUI?.enablePlay(false);
    }
  }

  private wireSpawnedRef: (() => void) | null = null;

  /** Public entry the start screen calls; also exposed for e2e tests. */
  async play(): Promise<void> {
    return this.handlePlay();
  }

  private async handlePlay(): Promise<void> {
    if (!this.startUI || !this.player) return;
    await this.startUI.fadeOutAndDestroy();
    this.startUI = null;
    this.hudReady = true;
    this.running = true;
    this.lastFrame = performance.now();
    this.sceneMgr!.scene.onBeforeRenderObservable.add(() => this.tick());
    this.canvas.style.cursor = 'none';
    const requestLock = () => {
      if (document.pointerLockElement !== this.canvas) {
        try { this.canvas.requestPointerLock(); } catch { /* ignore */ }
      }
    };
    requestLock();
    const onCanvasClick = () => requestLock();
    this.canvas.addEventListener('click', onCanvasClick);
    this.cleanups.push(() => this.canvas.removeEventListener('click', onCanvasClick));
    // Mark globals for tests
    (window as unknown as { __gtaReady?: boolean }).__gtaReady = true;
  }

  private onKeyDown(code: string): void {
    if (!this.running) return;
    if (code === 'Digit1') this.weapons?.equipSlot(1);
    else if (code === 'Digit2') this.weapons?.equipSlot(2);
    else if (code === 'Digit3') this.weapons?.equipSlot(3);
    else if (code === 'Digit4') this.weapons?.equipSlot(4);
    else if (code === 'KeyE') this.tryEnterVehicle();
    else if (code === 'KeyF') this.tryExitVehicle();
  }

  private tryEnterVehicle(): void {
    if (!this.player || !this.traffic) return;
    if (this.player.state !== 'alive') return;
    const car = this.traffic.nearest(this.player.position(), 3);
    if (!car) return;
    this.traffic.takeOver(car);
    this.player.setVehicleMode(true);
    this.playerVehicle = car;
  }

  private tryExitVehicle(): void {
    if (!this.player || !this.playerVehicle || !this.traffic) return;
    const car = this.playerVehicle;
    car.speed = 0;
    const exit = car.root.position.add(new Vector3(2, 0, 0));
    this.player.root.position.set(exit.x, GameConfig.player.capsule.height / 2, exit.z);
    this.player.setVehicleMode(false);
    this.traffic.release(car);
    this.playerVehicle = null;
  }

  private tick(): void {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    this.player?.update(dt);
    this.spawn?.step(dt * 1000);
    this.wireSpawnedRef?.();

    if (this.playerVehicle) {
      const throttle = this.input!.isDown('KeyW') ? 1 : 0;
      const brake = this.input!.isDown('KeyS') ? 1 : 0;
      const steer = (this.input!.isDown('KeyA') ? -1 : 0) + (this.input!.isDown('KeyD') ? 1 : 0);
      this.playerVehicle.applyDriverInput(throttle, brake, steer, dt);
      // Camera follow vehicle
      const cam = this.player!.camera as ArcRotateCamera;
      cam.target = Vector3.Lerp(cam.target, this.playerVehicle.root.position, Math.min(1, dt * 8));
      // Move player invisibly with car so position queries work
      this.player!.root.position.copyFrom(this.playerVehicle.root.position);
      this.player!.root.position.y = GameConfig.player.capsule.height / 2;
    }

    // Update NPC list — refresh crowd neighbors for separation steering.
    if (this.spawn) {
      NPC.neighbors = [
        ...this.spawn.npcs.filter((n) => !n.isDead()),
        ...this.spawn.police.filter((p) => !p.isDead()),
      ];
    }
    for (const n of this.spawn?.npcs ?? []) n.update(dt);
    if (this.spawn && this.police) this.police.update(this.spawn.police, dt);
    this.traffic?.update(dt);
    this.wanted?.update();

    // Run-over detection: traffic vehicles hitting NPCs
    if (this.traffic && this.spawn) {
      for (const n of this.spawn.aliveNPCs()) {
        const hit = this.traffic.detectRunOver(n.position(), 1.0);
        if (hit) {
          const dmg = hit.speed > 20 ? 9999 : hit.speed * 4;
          const killedByPlayer = hit.v === this.playerVehicle;
          // Launch the body along the car's heading, scaled by speed.
          const f = hit.v.forward();
          const launch = Math.max(8, Math.min(28, hit.speed * 1.4));
          n.queueDeathImpulse(new Vector3(f.x * launch, launch * 0.55, f.z * launch));
          n.takeDamage(dmg, killedByPlayer ? 'player' : 'world');
        }
      }
      // Also check police — running over cops is a signature feature.
      for (const p of this.spawn.police) {
        if (p.isDead()) continue;
        const hit = this.traffic.detectRunOver(p.position(), 1.0);
        if (hit) {
          const dmg = hit.speed > 20 ? 9999 : hit.speed * 4;
          const f = hit.v.forward();
          const launch = Math.max(8, Math.min(28, hit.speed * 1.4));
          p.queueDeathImpulse(new Vector3(f.x * launch, launch * 0.55, f.z * launch));
          const byPlayer = hit.v === this.playerVehicle;
          p.takeDamage(dmg, byPlayer ? 'player' : 'world');
        }
      }
    }

    if (this.weapons && this.input!.isMouseDown()) {
      const fired = this.weapons.tryFire();
      if (fired) this.spawn?.notifyGunshot(this.player!.position());
    }

    // HUD updates
    if (this.hud && this.weapons && this.player && this.hudReady) {
      const ammoBySlot: Record<number, { mag: number; mags: number; magazineSize: number }> = {};
      for (const w of this.weapons.weapons) {
        ammoBySlot[w.cfg.slot] = { mag: w.ammoInMag, mags: w.totalAmmo, magazineSize: w.cfg.magazineSize };
      }
      const activeSlot = this.weapons.active?.cfg.slot ?? 1;
      this.hud.weapon.update(activeSlot, ammoBySlot);
      this.hud.health.update(this.player.hp, dt);
      this.hud.update();
    }
  }

  stop(): void {
    this.running = false;
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.hud?.dispose();
    this.engine?.dispose();
  }
}
