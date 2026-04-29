import { Engine as BabylonEngine } from '@babylonjs/core/Engines/engine';

export class GameEngine {
  readonly engine: BabylonEngine;
  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.engine = new BabylonEngine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
    });
    window.addEventListener('resize', this.handleResize);
  }

  private readonly handleResize = () => this.engine.resize();

  startRenderLoop(render: () => void): void {
    this.engine.runRenderLoop(render);
  }

  stopRenderLoop(): void {
    this.engine.stopRenderLoop();
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.engine.dispose();
  }
}
