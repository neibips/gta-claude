import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';

export class WantedHUD {
  private level = 0;
  private stars: TextBlock[] = [];
  private blinkOn = false;
  private lastBlink = 0;

  constructor(ui: AdvancedDynamicTexture) {
    const panel = new Rectangle('wantedPanel');
    panel.width = '260px';
    panel.height = '60px';
    panel.thickness = 0;
    panel.background = 'transparent';
    panel.top = '20px';
    panel.left = '-20px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    ui.addControl(panel);

    for (let i = 0; i < 5; i++) {
      const t = new TextBlock(`star_${i}`, '★');
      t.fontSize = 44;
      t.color = '#3b3b3b';
      t.shadowColor = '#000';
      t.shadowBlur = 4;
      t.width = '48px';
      t.height = '60px';
      t.left = `${-i * 48}px`;
      t.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      t.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
      panel.addControl(t);
      this.stars.push(t);
    }
  }

  setLevel(n: number): void {
    this.level = Math.max(0, Math.min(5, n));
    for (let i = 0; i < this.stars.length; i++) {
      this.stars[i].color = i < this.level ? '#ffd60a' : '#3b3b3b';
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
        this.stars[idx].color = this.blinkOn ? '#ffd60a' : '#a87a00';
      }
    }
  }
}
