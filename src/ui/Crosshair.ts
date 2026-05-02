import type { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { Control } from '@babylonjs/gui/2D/controls/control';

export class Crosshair {
  private readonly root: Rectangle;

  constructor(ui: AdvancedDynamicTexture) {
    this.root = new Rectangle('crosshair');
    this.root.width = '20px';
    this.root.height = '20px';
    this.root.thickness = 0;
    this.root.background = 'transparent';
    this.root.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.root.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this.root.isHitTestVisible = false;
    ui.addControl(this.root);

    const mk = (w: string, h: string) => {
      const r = new Rectangle();
      r.width = w;
      r.height = h;
      r.thickness = 0;
      r.background = 'rgba(124, 252, 74, 0.85)';
      r.isHitTestVisible = false;
      return r;
    };
    const h = mk('14px', '2px');
    const v = mk('2px', '14px');
    const dot = mk('2px', '2px');
    dot.background = 'rgba(124, 252, 74, 1)';
    this.root.addControl(h);
    this.root.addControl(v);
    this.root.addControl(dot);
  }

  setVisible(v: boolean): void {
    this.root.isVisible = v;
  }

  dispose(): void {
    this.root.dispose();
  }
}
