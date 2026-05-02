import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';

const ACCENT = '#7CFC4A';
const ACCENT_DIM = '#3a6b22';

export class HealthHUD {
  private outer: Rectangle;
  private inner: Rectangle;
  private label: TextBlock;
  private displayedHP = 100;
  private static readonly BAR_WIDTH = 280;

  constructor(ui: AdvancedDynamicTexture) {
    const panel = new Rectangle('healthPanel');
    panel.width = '320px';
    panel.height = '60px';
    panel.thickness = 0;
    panel.background = 'transparent';
    panel.left = '24px';
    panel.top = '-24px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    panel.isHitTestVisible = false;
    ui.addControl(panel);

    const tag = new TextBlock('hpTag', 'HP');
    tag.fontSize = 11;
    tag.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    tag.fontWeight = 'bold';
    tag.color = ACCENT;
    tag.width = '20px';
    tag.height = '14px';
    tag.left = '0px';
    tag.top = '-16px';
    tag.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tag.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.addControl(tag);

    this.outer = new Rectangle('hpOuter');
    this.outer.width = `${HealthHUD.BAR_WIDTH}px`;
    this.outer.height = '14px';
    this.outer.cornerRadius = 1;
    this.outer.thickness = 1;
    this.outer.color = ACCENT_DIM;
    this.outer.background = 'rgba(8, 14, 10, 0.55)';
    this.outer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.outer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.outer.left = '24px';
    panel.addControl(this.outer);

    this.inner = new Rectangle('hpInner');
    this.inner.width = `${HealthHUD.BAR_WIDTH - 4}px`;
    this.inner.height = '10px';
    this.inner.thickness = 0;
    this.inner.background = ACCENT;
    this.inner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.outer.addControl(this.inner);

    this.label = new TextBlock('hpLabel', '100');
    this.label.color = ACCENT;
    this.label.fontFamily = "'Courier New', monospace";
    this.label.fontSize = 12;
    this.label.fontWeight = 'bold';
    this.label.width = '40px';
    this.label.height = '14px';
    this.label.left = `${24 + HealthHUD.BAR_WIDTH + 8}px`;
    this.label.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.label.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(this.label);
  }

  /** dt smooths the displayed value toward target. */
  update(targetHP: number, dt: number): void {
    this.displayedHP += (targetHP - this.displayedHP) * Math.min(1, dt * 6);
    const pct = Math.max(0, Math.min(1, this.displayedHP / 100));
    const usable = HealthHUD.BAR_WIDTH - 4;
    this.inner.width = `${Math.floor(pct * usable)}px`;
    const critical = this.displayedHP < 25;
    const low = this.displayedHP < 50;
    this.inner.background = critical ? '#ff3b3b' : low ? '#d9d23a' : ACCENT;
    this.label.color = critical ? '#ff3b3b' : ACCENT;
    this.label.text = String(Math.round(this.displayedHP)).padStart(3, '0');
  }
}
