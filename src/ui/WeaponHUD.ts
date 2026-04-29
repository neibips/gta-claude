import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import type { WeaponConfigEntry } from '../entities/Weapon';

export class WeaponHUD {
  private cells: { box: Rectangle; ammo: TextBlock; name: TextBlock }[] = [];
  private weapons: WeaponConfigEntry[];

  constructor(ui: AdvancedDynamicTexture, weapons: WeaponConfigEntry[]) {
    this.weapons = weapons;
    const panel = new Rectangle('weaponPanel');
    panel.width = '380px';
    panel.height = '90px';
    panel.thickness = 0;
    panel.top = '-20px';
    panel.left = '-20px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    ui.addControl(panel);

    for (let i = 0; i < 4; i++) {
      const cell = new Rectangle(`wcell_${i}`);
      cell.width = '88px';
      cell.height = '88px';
      cell.cornerRadius = 6;
      cell.thickness = 2;
      cell.color = '#3a3a3a';
      cell.background = '#0008';
      cell.left = `${i * 92 - 138}px`;
      cell.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      cell.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      panel.addControl(cell);

      const slotText = new TextBlock(`wslot_${i}`, String(i + 1));
      slotText.fontSize = 12;
      slotText.color = '#888';
      slotText.top = '-30px';
      slotText.left = '-30px';
      cell.addControl(slotText);

      const name = new TextBlock(`wname_${i}`, weapons[i]?.name ?? '');
      name.fontSize = 14;
      name.color = '#fff';
      name.height = '20px';
      name.top = '14px';
      cell.addControl(name);

      const ammo = new TextBlock(`wammo_${i}`, '');
      ammo.fontSize = 18;
      ammo.color = '#ffd60a';
      ammo.fontWeight = 'bold';
      ammo.top = '20px';
      cell.addControl(ammo);

      this.cells.push({ box: cell, ammo, name });
    }
  }

  update(activeSlot: number, ammoBySlot: Record<number, { mag: number; mags: number; magazineSize: number }>): void {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const slot = i + 1;
      const isActive = slot === activeSlot;
      c.box.color = isActive ? '#ffd60a' : '#3a3a3a';
      c.box.thickness = isActive ? 3 : 2;
      const a = ammoBySlot[slot];
      if (!a) {
        c.ammo.text = '';
      } else if (a.magazineSize === 0) {
        c.ammo.text = '∞';
      } else {
        c.ammo.text = `${a.mag}/${a.magazineSize}`;
      }
      void this.weapons; // keep for future expansion
    }
  }
}
