import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Button } from '@babylonjs/gui/2D/controls/button';
import { Control } from '@babylonjs/gui/2D/controls/control';
import type { Scene } from '@babylonjs/core/scene';

const ACCENT = '#7CFC4A';
const ACCENT_DIM = '#3a6b22';

export type StartScreenHandle = {
  setProgress(p: number): void;
  setStatus(text: string): void;
  enablePlay(enabled: boolean): void;
  fadeOutAndDestroy(): Promise<void>;
};

export class StartScreen {
  static mount(scene: Scene, onPlay: () => void, onPlaylist?: () => void): StartScreenHandle {
    const ui = AdvancedDynamicTexture.CreateFullscreenUI('startUI', true, scene);
    ui.idealWidth = 1280;

    const root = new Rectangle('startRoot');
    root.width = 1;
    root.height = 1;
    root.thickness = 0;
    root.background = 'rgba(0, 0, 0, 0.82)';
    root.isPointerBlocker = false;
    ui.addControl(root);

    // Top tag
    const topTag = new TextBlock('topTag', '— ОТКРЫТЫЙ МИР —');
    topTag.color = ACCENT_DIM;
    topTag.fontSize = 12;
    topTag.fontFamily = "'Courier New', monospace";
    topTag.fontWeight = 'bold';
    topTag.top = '-260px';
    topTag.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    topTag.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    topTag.isHitTestVisible = false;
    root.addControl(topTag);

    const title = new TextBlock('title', 'GTA 6 AI');
    title.color = ACCENT;
    title.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    title.fontWeight = '900';
    title.fontSize = 128;
    title.shadowColor = 'rgba(124, 252, 74, 0.35)';
    title.shadowBlur = 24;
    title.top = '-180px';
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    title.isHitTestVisible = false;
    root.addControl(title);

    const subtitle = new TextBlock('sub', 'РАЙОН ШЕСТЬ');
    subtitle.color = '#bdbdbd';
    subtitle.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    subtitle.fontSize = 22;
    subtitle.fontWeight = 'bold';
    subtitle.top = '-90px';
    subtitle.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    subtitle.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    subtitle.isHitTestVisible = false;
    root.addControl(subtitle);

    // Divider
    const divider = new Rectangle('divider');
    divider.width = '420px';
    divider.height = '1px';
    divider.thickness = 0;
    divider.background = 'rgba(124, 252, 74, 0.35)';
    divider.top = '-50px';
    divider.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    divider.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    divider.isHitTestVisible = false;
    root.addControl(divider);

    const status = new TextBlock('status', 'ЗАГРУЗКА…');
    status.color = ACCENT;
    status.fontFamily = "'Courier New', monospace";
    status.fontWeight = 'bold';
    status.fontSize = 14;
    status.top = '20px';
    status.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    status.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    status.isHitTestVisible = false;
    root.addControl(status);

    // Progress bar (no rounding, monochrome)
    const barOuter = new Rectangle('barOuter');
    barOuter.width = '460px';
    barOuter.height = '6px';
    barOuter.cornerRadius = 0;
    barOuter.thickness = 0;
    barOuter.background = 'rgba(255,255,255,0.08)';
    barOuter.top = '50px';
    barOuter.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    barOuter.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    barOuter.isHitTestVisible = false;
    root.addControl(barOuter);

    const barInner = new Rectangle('barInner');
    barInner.width = '0px';
    barInner.height = '6px';
    barInner.cornerRadius = 0;
    barInner.thickness = 0;
    barInner.background = ACCENT;
    barInner.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    barOuter.addControl(barInner);

    const progressTxt = new TextBlock('progressTxt', '0%');
    progressTxt.color = '#9aa39a';
    progressTxt.fontFamily = "'Courier New', monospace";
    progressTxt.fontSize = 11;
    progressTxt.top = '70px';
    progressTxt.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    progressTxt.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    progressTxt.isHitTestVisible = false;
    root.addControl(progressTxt);

    const playBtn = Button.CreateSimpleButton('play', 'ИГРАТЬ');
    playBtn.width = '280px';
    playBtn.height = '56px';
    playBtn.color = ACCENT;
    playBtn.background = 'rgba(124, 252, 74, 0.10)';
    playBtn.cornerRadius = 0;
    playBtn.thickness = 1;
    playBtn.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    playBtn.fontSize = 22;
    playBtn.fontWeight = 'bold';
    playBtn.top = '130px';
    playBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    playBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    playBtn.isEnabled = false;
    playBtn.isVisible = true;
    playBtn.alpha = 0.4;
    playBtn.isPointerBlocker = true;
    playBtn.isHitTestVisible = true;
    if (playBtn.textBlock) {
      playBtn.textBlock.color = ACCENT;
    }
    playBtn.onPointerEnterObservable.add(() => {
      if (playBtn.isEnabled) playBtn.background = 'rgba(124, 252, 74, 0.22)';
    });
    playBtn.onPointerOutObservable.add(() => {
      playBtn.background = 'rgba(124, 252, 74, 0.10)';
    });
    playBtn.onPointerClickObservable.add(() => onPlay());
    root.addControl(playBtn);

    const playlistBtn = Button.CreateSimpleButton('playlist', '♪  РАДИО ГОБЛИН FM — ПЛЕЙЛИСТ');
    playlistBtn.width = '320px';
    playlistBtn.height = '40px';
    playlistBtn.color = '#9aa39a';
    playlistBtn.background = 'rgba(0, 0, 0, 0.4)';
    playlistBtn.cornerRadius = 0;
    playlistBtn.thickness = 0;
    playlistBtn.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    playlistBtn.fontSize = 13;
    playlistBtn.fontWeight = 'bold';
    playlistBtn.top = '200px';
    playlistBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    playlistBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    playlistBtn.isPointerBlocker = true;
    playlistBtn.isHitTestVisible = true;
    if (playlistBtn.textBlock) {
      playlistBtn.textBlock.color = '#9aa39a';
    }
    playlistBtn.onPointerEnterObservable.add(() => {
      playlistBtn.color = ACCENT;
      if (playlistBtn.textBlock) playlistBtn.textBlock.color = ACCENT;
    });
    playlistBtn.onPointerOutObservable.add(() => {
      playlistBtn.color = '#9aa39a';
      if (playlistBtn.textBlock) playlistBtn.textBlock.color = '#9aa39a';
    });
    playlistBtn.onPointerClickObservable.add(() => onPlaylist?.());
    root.addControl(playlistBtn);

    // Bottom hint
    const hint = new TextBlock('hint', 'WASD — ДВИЖЕНИЕ   ·   МЫШЬ — ПРИЦЕЛ   ·   ЛКМ — ОГОНЬ   ·   1-4 — ОРУЖИЕ   ·   F — В ТРАНСПОРТ');
    hint.color = '#5a6a5a';
    hint.fontFamily = "'Helvetica Neue', Helvetica, Arial, sans-serif";
    hint.fontSize = 11;
    hint.fontWeight = 'bold';
    hint.top = '-20px';
    hint.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    hint.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    hint.isHitTestVisible = false;
    root.addControl(hint);

    return {
      setProgress(p: number) {
        const w = Math.max(0, Math.min(1, p));
        barInner.width = `${Math.floor(w * 460)}px`;
        progressTxt.text = `${Math.floor(w * 100)}%`;
      },
      setStatus(t: string) {
        status.text = t.toUpperCase();
      },
      enablePlay(enabled: boolean) {
        playBtn.isEnabled = enabled;
        playBtn.alpha = enabled ? 1 : 0.4;
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
