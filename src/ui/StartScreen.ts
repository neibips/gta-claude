import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Button } from '@babylonjs/gui/2D/controls/button';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { Scene } from '@babylonjs/core/scene';

export type StartScreenHandle = {
  setProgress(p: number): void;
  setStatus(text: string): void;
  enablePlay(enabled: boolean): void;
  fadeOutAndDestroy(): Promise<void>;
};

export class StartScreen {
  static mount(scene: Scene, onPlay: () => void): StartScreenHandle {
    const ui = AdvancedDynamicTexture.CreateFullscreenUI('startUI', true, scene);
    ui.idealWidth = 1280;

    const root = new Rectangle('startRoot');
    root.width = 1;
    root.height = 1;
    root.thickness = 0;
    root.background = '#06070bcc';
    ui.addControl(root);

    const title = new TextBlock('title', 'GTA6 AI');
    title.color = '#ffffff';
    title.fontFamily = 'Helvetica, Arial, sans-serif';
    title.fontWeight = '900';
    title.fontSize = 96;
    title.shadowColor = '#000000aa';
    title.shadowBlur = 20;
    title.top = '-180px';
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    root.addControl(title);

    const subtitle = new TextBlock('sub', 'Distrito 6');
    subtitle.color = '#ffd166';
    subtitle.fontSize = 28;
    subtitle.fontWeight = '600';
    subtitle.top = '-80px';
    subtitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    subtitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    root.addControl(subtitle);

    const status = new TextBlock('status', 'Loading…');
    status.color = '#cfd5dc';
    status.fontSize = 20;
    status.top = '120px';
    status.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    status.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    root.addControl(status);

    const barOuter = new Rectangle('barOuter');
    barOuter.width = '460px';
    barOuter.height = '14px';
    barOuter.cornerRadius = 7;
    barOuter.thickness = 1;
    barOuter.color = '#2b3140';
    barOuter.background = '#0d1018';
    barOuter.top = '70px';
    barOuter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barOuter.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    root.addControl(barOuter);

    const barInner = new Rectangle('barInner');
    barInner.width = '0px';
    barInner.height = '14px';
    barInner.cornerRadius = 7;
    barInner.thickness = 0;
    barInner.background = '#3a86ff';
    barInner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barOuter.addControl(barInner);

    const playBtn = Button.CreateSimpleButton('play', 'PLAY');
    playBtn.width = '220px';
    playBtn.height = '60px';
    playBtn.color = '#ffffff';
    playBtn.background = '#3a86ff';
    playBtn.cornerRadius = 8;
    playBtn.thickness = 0;
    playBtn.fontSize = 26;
    playBtn.fontWeight = 'bold';
    playBtn.top = '20px';
    playBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    playBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    playBtn.isEnabled = false;
    playBtn.isVisible = true;
    playBtn.alpha = 0.5;
    playBtn.onPointerClickObservable.add(() => onPlay());
    root.addControl(playBtn);

    return {
      setProgress(p: number) {
        const w = Math.max(0, Math.min(1, p));
        barInner.width = `${Math.floor(w * 460)}px`;
      },
      setStatus(t: string) {
        status.text = t;
      },
      enablePlay(enabled: boolean) {
        playBtn.isEnabled = enabled;
        playBtn.alpha = enabled ? 1 : 0.5;
      },
      async fadeOutAndDestroy() {
        const start = performance.now();
        await new Promise<void>((resolve) => {
          const tick = () => {
            const t = (performance.now() - start) / 400;
            root.alpha = Math.max(0, 1 - t);
            if (t >= 1) {
              ui.dispose();
              resolve();
              return;
            }
            requestAnimationFrame(tick);
          };
          tick();
        });
      },
    };
  }
}
