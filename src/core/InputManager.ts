type Listener = (key: string) => void;

export class InputManager {
  private readonly held = new Set<string>();
  private readonly downListeners: Listener[] = [];
  private readonly canvas: HTMLCanvasElement;
  private mouseDown = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (k === 'Space') e.preventDefault();
    if (!this.held.has(k)) {
      this.downListeners.forEach((fn) => fn(k));
    }
    this.held.add(k);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => this.held.delete(e.code);
  private readonly onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = true;
  };
  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private readonly onBlur = () => this.held.clear();

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  isMouseDown(): boolean {
    return this.mouseDown;
  }

  onKeyDownOnce(fn: Listener): () => void {
    this.downListeners.push(fn);
    return () => {
      const i = this.downListeners.indexOf(fn);
      if (i >= 0) this.downListeners.splice(i, 1);
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
  }
}
