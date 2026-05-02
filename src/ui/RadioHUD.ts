import type { RadioSystem, Track } from '../audio/RadioSystem';

export class RadioHUD {
  private readonly root: HTMLDivElement;
  private readonly cover: HTMLDivElement;
  private readonly stationEl: HTMLDivElement;
  private readonly hotkeysEl: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly statusDot: HTMLSpanElement;
  private readonly unsubscribe: () => void;

  constructor(private readonly radio: RadioSystem) {
    this.root = document.createElement('div');
    this.root.id = 'radio-hud';
    this.root.style.cssText = [
      'position:fixed',
      'top:22px',
      'left:22px',
      'width:300px',
      'background:rgba(8,10,14,0.78)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'border-left:3px solid #f0c419',
      'box-shadow:0 6px 22px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)',
      'color:#f4f4f4',
      "font-family:'Pricedown','Impact','Arial Black',Helvetica,sans-serif",
      'padding:10px 12px 10px 14px',
      'display:none',
      'z-index:30',
      'pointer-events:none',
      'user-select:none',
      'letter-spacing:0.5px',
    ].join(';');

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;gap:12px;align-items:center;';

    this.cover = document.createElement('div');
    this.cover.style.cssText = [
      'width:56px',
      'height:56px',
      'flex-shrink:0',
      'background:linear-gradient(135deg,#1a1d24 0%,#2a2f3a 100%)',
      'border:1px solid #f0c419',
      'box-shadow:inset 0 0 0 1px rgba(0,0,0,0.6), 0 0 12px rgba(240,196,25,0.18)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:28px',
      'color:#f0c419',
      'text-shadow:0 1px 0 #000',
    ].join(';');
    this.cover.textContent = '◉';
    top.appendChild(this.cover);

    const right = document.createElement('div');
    right.style.cssText = 'flex:1;min-width:0;';

    const stationRow = document.createElement('div');
    stationRow.style.cssText = 'display:flex;align-items:center;gap:7px;';

    this.statusDot = document.createElement('span');
    this.statusDot.style.cssText = [
      'width:7px',
      'height:7px',
      'background:#5c6275',
      'box-shadow:0 0 6px rgba(0,0,0,0.6)',
      'flex-shrink:0',
      'transform:rotate(45deg)',
    ].join(';');
    stationRow.appendChild(this.statusDot);

    this.stationEl = document.createElement('div');
    this.stationEl.style.cssText = [
      'font-size:18px',
      'font-weight:900',
      'color:#f0c419',
      'letter-spacing:1.2px',
      'text-transform:uppercase',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'text-shadow:0 1px 0 #000, 0 0 8px rgba(240,196,25,0.25)',
    ].join(';');
    this.stationEl.textContent = radio.stationName.toUpperCase();
    stationRow.appendChild(this.stationEl);
    right.appendChild(stationRow);

    this.hotkeysEl = document.createElement('div');
    this.hotkeysEl.style.cssText = [
      'font-size:9px',
      'color:#a8acb8',
      'margin-top:3px',
      'letter-spacing:1.4px',
      'text-transform:uppercase',
      'font-family:Helvetica,Arial,sans-serif',
      'font-weight:700',
    ].join(';');
    this.hotkeysEl.innerHTML =
      '<span style="display:inline-block;border:1px solid #a8acb8;padding:1px 5px;margin-right:4px;border-radius:2px;color:#fff;">Q</span>ВКЛ/ВЫКЛ' +
      '<span style="opacity:0.4;margin:0 8px;">|</span>' +
      '<span style="display:inline-block;border:1px solid #a8acb8;padding:1px 5px;margin-right:4px;border-radius:2px;color:#fff;">N</span>СЛЕД. ТРЕК';
    right.appendChild(this.hotkeysEl);

    top.appendChild(right);
    this.root.appendChild(top);

    const divider = document.createElement('div');
    divider.style.cssText = [
      'height:1px',
      'background:linear-gradient(90deg,transparent 0%,rgba(240,196,25,0.5) 20%,rgba(240,196,25,0.5) 80%,transparent 100%)',
      'margin:9px 0 7px',
    ].join(';');
    this.root.appendChild(divider);

    this.titleEl = document.createElement('div');
    this.titleEl.style.cssText = [
      'font-size:12px',
      'color:#f4f4f4',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'font-weight:700',
      'font-family:Helvetica,Arial,sans-serif',
      'text-transform:uppercase',
      'letter-spacing:0.6px',
      'text-shadow:0 1px 0 #000',
    ].join(';');
    this.titleEl.textContent = '—';
    this.root.appendChild(this.titleEl);

    document.body.appendChild(this.root);

    this.unsubscribe = radio.onChange((s) => this.render(s.track, s.enabled));
    this.render(radio.current(), radio.isEnabled());
  }

  show(): void {
    this.root.style.display = 'block';
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  private render(track: Track | null, enabled: boolean): void {
    this.statusDot.style.background = enabled ? '#7fb800' : '#5c6275';
    this.statusDot.style.boxShadow = enabled
      ? '0 0 8px rgba(127,184,0,0.8)'
      : '0 0 6px rgba(0,0,0,0.6)';
    if (!track) {
      this.titleEl.textContent = enabled ? 'ПЛЕЙЛИСТ ПУСТ' : 'РАДИО ВЫКЛЮЧЕНО';
      this.cover.style.filter = 'grayscale(0.4) brightness(0.7)';
      return;
    }
    this.cover.style.filter = enabled ? 'none' : 'grayscale(0.7) brightness(0.55)';
    const text = track.title.toUpperCase();
    this.titleEl.textContent = enabled ? text : `${text} (ВЫКЛ)`;
  }

  dispose(): void {
    this.unsubscribe();
    this.root.remove();
  }
}
