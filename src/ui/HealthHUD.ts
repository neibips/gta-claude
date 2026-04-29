import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';

export class HealthHUD {
  private outer: Rectangle;
  private inner: Rectangle;
  private label: TextBlock;
  private displayedHP = 100;

  constructor(ui: AdvancedDynamicTexture) {
    const panel = new Rectangle('healthPanel');
    panel.width = '280px';
    panel.height = '50px';
    panel.thickness = 0;
    panel.left = '20px';
    panel.top = '-20px';
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    ui.addControl(panel);

    this.outer = new Rectangle('hpOuter');
    this.outer.width = '260px';
    this.outer.height = '20px';
    this.outer.cornerRadius = 4;
    this.outer.thickness = 1;
    this.outer.color = '#222';
    this.outer.background = '#0d0d0d';
    this.outer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.outer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    panel.addControl(this.outer);

    this.inner = new Rectangle('hpInner');
    this.inner.width = '256px';
    this.inner.height = '16px';
    this.inner.cornerRadius = 3;
    this.inner.thickness = 0;
    this.inner.background = '#22aa55';
    this.inner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.outer.addControl(this.inner);

    this.label = new TextBlock('hpLabel', 'HP 100');
    this.label.color = '#ffffff';
    this.label.fontSize = 14;
    this.label.fontWeight = 'bold';
    this.label.top = '0px';
    this.outer.addControl(this.label);
  }

  /** dt smooths the displayed value toward target. */
  update(targetHP: number, dt: number): void {
    this.displayedHP += (targetHP - this.displayedHP) * Math.min(1, dt * 6);
    const pct = Math.max(0, Math.min(1, this.displayedHP / 100));
    this.inner.width = `${Math.floor(pct * 256)}px`;
    this.inner.background = this.displayedHP < 30 ? '#dd3344' : this.displayedHP < 60 ? '#dda033' : '#22aa55';
    this.label.text = `HP ${Math.round(this.displayedHP)}`;
  }
}
