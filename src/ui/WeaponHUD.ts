import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Image } from '@babylonjs/gui/2D/controls/image';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import type { WeaponConfigEntry } from '../entities/Weapon';

const ACCENT = '#7CFC4A';
const ACCENT_DIM = '#4a7a32';
const BG_INACTIVE = 'rgba(0, 0, 0, 0.45)';
const BG_ACTIVE = 'rgba(0, 0, 0, 0.82)';

const WEAPON_ICONS: Record<string, string> = {
  fists: svgRaw(`
    <path fill="__C__" d="M22 30c0-4 3-7 7-7h4v-6c0-3 2-5 5-5s5 2 5 5v6h3v-7c0-3 2-5 5-5s5 2 5 5v7h3v-5c0-3 2-5 5-5s5 2 5 5v22c0 13-10 22-23 22h-4c-11 0-20-9-20-20V30z"/>
    <path fill="none" stroke="__C__" stroke-width="2" d="M33 30v8M41 30v9M49 30v9"/>
  `),
  ak47: svgRaw(`
    <path fill="__C__" d="M6 46h74v8H56l-3 8H40l-3-8h-9l-2 6H16l-3-6H6z"/>
    <rect fill="__C__" x="22" y="36" width="34" height="10"/>
    <rect fill="__C__" x="58" y="40" width="20" height="6"/>
    <rect fill="__C__" x="78" y="42" width="14" height="4"/>
    <path fill="__C__" d="M28 36V24h6v12zM48 36V18h4v18z"/>
    <path fill="none" stroke="__C__" stroke-width="2" d="M30 54l-4 8M40 62l2 8M52 62l4 8"/>
  `),
  rpg: svgRaw(`
    <rect fill="__C__" x="8" y="40" width="70" height="14" rx="2"/>
    <path fill="__C__" d="M78 38l16 6v6l-16 6z"/>
    <rect fill="__C__" x="14" y="32" width="14" height="8"/>
    <rect fill="__C__" x="40" y="54" width="6" height="14"/>
    <path fill="__C__" d="M30 68h22l-2 6H32z"/>
    <circle fill="__C__" cx="62" cy="36" r="3"/>
  `),
  water_gun: svgRaw(`
    <path fill="__C__" d="M10 38h44v14H42l-2 18H22l-2-18H10z"/>
    <rect fill="__C__" x="20" y="22" width="22" height="16" rx="3"/>
    <rect fill="__C__" x="54" y="42" width="28" height="6" rx="2"/>
    <path fill="none" stroke="__C__" stroke-width="2" stroke-linecap="round" d="M84 45h6M86 39l5-3M86 51l5 3"/>
    <circle fill="none" stroke="__C__" stroke-width="2" cx="31" cy="30" r="3"/>
  `),
};

function svgRaw(inner: string): string {
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'>${inner}</svg>`;
}

function tintedIcon(raw: string, color: string): string {
  const svg = raw.replace(/__C__/g, color);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function fallbackIcon(): string {
  return svgRaw(
    `<rect x='20' y='40' width='60' height='20' fill='__C__'/><rect x='40' y='30' width='8' height='10' fill='__C__'/>`,
  );
}

type Cell = {
  box: Rectangle;
  ammo: TextBlock;
  slotText: TextBlock;
  name: TextBlock;
  icon: Image;
};

export class WeaponHUD {
  private cells: Cell[] = [];
  private weapons: WeaponConfigEntry[];

  constructor(ui: AdvancedDynamicTexture, weapons: WeaponConfigEntry[]) {
    this.weapons = weapons;
    const count = weapons.length;
    const cellW = 170;
    const cellH = 90;
    const totalH = count * cellH;

    const panel = new Rectangle('weaponPanel');
    panel.width = `${cellW}px`;
    panel.height = `${totalH}px`;
    panel.thickness = 0;
    panel.background = 'transparent';
    panel.top = '-24px';
    panel.left = '-24px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.isHitTestVisible = false;
    ui.addControl(panel);

    for (let i = 0; i < count; i++) {
      const w = weapons[i];
      const cell = new Rectangle(`wcell_${i}`);
      cell.width = `${cellW}px`;
      cell.height = `${cellH}px`;
      cell.cornerRadius = 0;
      cell.thickness = 0;
      cell.background = BG_INACTIVE;
      cell.top = `${i * cellH - (totalH - cellH) / 2}px`;
      cell.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
      cell.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      cell.isHitTestVisible = false;
      panel.addControl(cell);

      // Slot number — small, top-left, no padding
      const slotText = new TextBlock(`wslot_${i}`, String(i + 1));
      slotText.fontSize = 11;
      slotText.fontFamily = "'Courier New', monospace";
      slotText.fontWeight = 'bold';
      slotText.color = '#6e7a6e';
      slotText.width = '14px';
      slotText.height = '12px';
      slotText.top = '4px';
      slotText.left = '4px';
      slotText.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      slotText.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      slotText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      slotText.isHitTestVisible = false;
      cell.addControl(slotText);

      // Weapon silhouette — large, fills left side, edge-to-edge
      const iconKey = w?.id ?? '';
      const raw = WEAPON_ICONS[iconKey] ?? fallbackIcon();
      const icon = new Image(`wicon_${i}`, tintedIcon(raw, ACCENT_DIM));
      icon.width = '90px';
      icon.height = '70px';
      icon.left = '0px';
      icon.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      icon.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      icon.stretch = Image.STRETCH_UNIFORM;
      icon.isHitTestVisible = false;
      cell.addControl(icon);

      // Big ammo counter — right side, dominant
      const ammo = new TextBlock(`wammo_${i}`, '');
      ammo.fontSize = 32;
      ammo.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
      ammo.fontWeight = '900';
      ammo.color = ACCENT_DIM;
      ammo.height = '36px';
      ammo.width = '76px';
      ammo.top = '-8px';
      ammo.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      ammo.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      ammo.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      ammo.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      ammo.isHitTestVisible = false;
      cell.addControl(ammo);

      // Weapon name — small, under ammo
      const name = new TextBlock(`wname_${i}`, (w?.name ?? '').toUpperCase());
      name.fontSize = 10;
      name.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
      name.fontWeight = 'bold';
      name.color = '#9aa39a';
      name.height = '12px';
      name.width = '90px';
      name.top = '20px';
      name.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      name.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      name.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      name.isHitTestVisible = false;
      cell.addControl(name);

      this.cells.push({ box: cell, ammo, slotText, name, icon });
    }
  }

  update(activeSlot: number, ammoBySlot: Record<number, { mag: number; mags: number; magazineSize: number }>): void {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const w = this.weapons[i];
      const slot = i + 1;
      const isActive = slot === activeSlot;

      c.box.background = isActive ? BG_ACTIVE : BG_INACTIVE;
      c.slotText.color = isActive ? ACCENT : '#6e7a6e';
      c.name.color = isActive ? ACCENT : '#9aa39a';

      const iconKey = w?.id ?? '';
      const raw = WEAPON_ICONS[iconKey] ?? fallbackIcon();
      c.icon.source = tintedIcon(raw, isActive ? ACCENT : ACCENT_DIM);

      const a = ammoBySlot[slot];
      if (!a) {
        c.ammo.text = '—';
        c.ammo.color = '#5a6a5a';
      } else if (a.magazineSize === 0) {
        c.ammo.text = '∞';
        c.ammo.color = isActive ? ACCENT : ACCENT_DIM;
      } else {
        c.ammo.text = String(a.mag);
        const low = a.magazineSize > 0 && a.mag <= Math.max(1, Math.floor(a.magazineSize * 0.2));
        c.ammo.color = low ? '#ff6b3d' : isActive ? ACCENT : ACCENT_DIM;
      }
    }
  }
}
