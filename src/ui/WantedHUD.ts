import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';

const ACCENT = '#7CFC4A';
const ACCENT_DIM = '#2a4a18';
const INACTIVE = '#1a2418';

export class WantedHUD {
  private level = 0;
  private stars: TextBlock[] = [];
  private blinkOn = false;
  private lastBlink = 0;

  constructor(ui: AdvancedDynamicTexture) {
    const panel = new Rectangle('wantedPanel');
    panel.width = '320px';
    panel.height = '70px';
    panel.thickness = 0;
    panel.background = 'transparent';
    panel.top = '24px';
    panel.left = '-24px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.isHitTestVisible = false;
    ui.addControl(panel);

    const tag = new TextBlock('wantedTag', 'WANTED');
    tag.fontSize = 10;
    tag.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    tag.fontWeight = 'bold';
    tag.color = ACCENT;
    tag.height = '12px';
    tag.top = '-26px';
    tag.left = '-2px';
    tag.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    tag.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    tag.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.addControl(tag);

    for (let i = 0; i < 5; i++) {
      const t = new TextBlock(`star_${i}`, '★');
      t.fontSize = 38;
      t.color = INACTIVE;
      t.shadowColor = 'rgba(0,0,0,0.7)';
      t.shadowBlur = 6;
      t.shadowOffsetX = 0;
      t.shadowOffsetY = 1;
      t.width = '46px';
      t.height = '50px';
      t.left = `${-i * 46}px`;
      t.top = '8px';
      t.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      t.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      panel.addControl(t);
      this.stars.push(t);
    }
  }

  setLevel(n: number): void {
    this.level = Math.max(0, Math.min(5, n));
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].color = i < this.level ? ACCENT : INACTIVE;
    }
  }

  /** Blinks the highest active star. */
  update(): void {
    const now = performance.now();
    if (now - this.lastBlink > 350) {
      this.lastBlink = now;
      this.blinkOn = !this.blinkOn;
      if (this.level > 0) {
        const idx = this.level - 1;
        this.stars[idx].color = this.blinkOn ? ACCENT : ACCENT_DIM;
      }
    }
  }
}
