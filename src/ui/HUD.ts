import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import type { Scene } from '@babylonjs/core/scene';
import { WantedHUD } from './WantedHUD';
import { WeaponHUD } from './WeaponHUD';
import { HealthHUD } from './HealthHUD';
import { Crosshair } from './Crosshair';
import type { WeaponConfigEntry } from '../entities/Weapon';

export class HUD {
  readonly ui: AdvancedDynamicTexture;
  readonly wanted: WantedHUD;
  readonly weapon: WeaponHUD;
  readonly health: HealthHUD;
  readonly crosshair: Crosshair;

  constructor(scene: Scene, weapons: WeaponConfigEntry[]) {
    this.ui = AdvancedDynamicTexture.CreateFullscreenUI('hud', true, scene);
    this.ui.idealWidth = 1280;
    this.wanted = new WantedHUD(this.ui);
    this.weapon = new WeaponHUD(this.ui, weapons);
    this.health = new HealthHUD(this.ui);
    this.crosshair = new Crosshair(this.ui);
  }

  update(): void {
    this.wanted.update();
  }

  dispose(): void {
    this.ui.dispose();
  }
}
