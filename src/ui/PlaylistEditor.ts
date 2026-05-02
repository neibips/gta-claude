import type { RadioSystem, Track } from '../audio/RadioSystem';

export class PlaylistEditor {
  private readonly overlay: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private fileInput: HTMLInputElement | null = null;

  constructor(private readonly radio: RadioSystem) {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(6,7,11,0.85)',
      'z-index:100',
      'display:none',
      'align-items:center',
      'justify-content:center',
      'font-family:Helvetica,Arial,sans-serif',
      'color:#e7ebf3',
    ].join(';');

    const panel = document.createElement('div');
    panel.style.cssText = [
      'width:560px',
      'max-width:90vw',
      'max-height:80vh',
      'background:#10131c',
      'border:1px solid #2a3044',
      'border-radius:14px',
      'box-shadow:0 20px 60px rgba(0,0,0,0.7)',
      'display:flex',
      'flex-direction:column',
      'overflow:hidden',
    ].join(';');

    const header = document.createElement('div');
    header.style.cssText = [
      'padding:18px 22px',
      'border-bottom:1px solid #2a3044',
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
    ].join(';');

    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.textContent = `${this.radio.stationName} — Плейлист`;
    title.style.cssText = 'font-size:20px;font-weight:800;color:#ffd166;';
    titleWrap.appendChild(title);
    const sub = document.createElement('div');
    sub.textContent = 'Добавляйте, удаляйте и слушайте свои треки';
    sub.style.cssText = 'font-size:12px;color:#8d94a6;margin-top:4px;';
    titleWrap.appendChild(sub);
    header.appendChild(titleWrap);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = btnSecondaryStyle('36px', '36px');
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);

    panel.appendChild(header);

    this.listEl = document.createElement('div');
    this.listEl.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'padding:10px 14px',
      'min-height:200px',
    ].join(';');
    panel.appendChild(this.listEl);

    const footer = document.createElement('div');
    footer.style.cssText = [
      'padding:14px 22px',
      'border-top:1px solid #2a3044',
      'display:flex',
      'gap:10px',
      'align-items:center',
      'justify-content:space-between',
    ].join(';');

    const hint = document.createElement('div');
    hint.textContent = 'Поддерживаются файлы MP3, OGG, WAV, M4A. Сохраняются между сессиями.';
    hint.style.cssText = 'font-size:11px;color:#8d94a6;flex:1;';
    footer.appendChild(hint);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Добавить треки';
    addBtn.style.cssText = btnPrimaryStyle();
    addBtn.addEventListener('click', () => this.openFilePicker());
    footer.appendChild(addBtn);

    panel.appendChild(footer);
    this.overlay.appendChild(panel);
    document.body.appendChild(this.overlay);

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });
  }

  private openFilePicker(): void {
    if (!this.fileInput) {
      this.fileInput = document.createElement('input');
      this.fileInput.type = 'file';
      this.fileInput.accept = 'audio/*';
      this.fileInput.multiple = true;
      this.fileInput.style.display = 'none';
      document.body.appendChild(this.fileInput);
      this.fileInput.addEventListener('change', async () => {
        const files = Array.from(this.fileInput!.files ?? []);
        this.fileInput!.value = '';
        if (!files.length) return;
        try {
          await this.radio.addUserTracks(files);
          await this.refresh();
        } catch (e) {
          console.error('[Playlist] failed to add', e);
          alert('Не удалось добавить треки: ' + (e as Error).message);
        }
      });
    }
    this.fileInput.click();
  }

  async show(): Promise<void> {
    this.overlay.style.display = 'flex';
    await this.refresh();
  }

  hide(): void {
    this.overlay.style.display = 'none';
  }

  isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  private async refresh(): Promise<void> {
    const tracks = await this.radio.listAll();
    this.listEl.innerHTML = '';
    if (!tracks.length) {
      const empty = document.createElement('div');
      empty.textContent = 'Плейлист пуст. Добавьте треки кнопкой ниже.';
      empty.style.cssText = 'padding:40px 10px;text-align:center;color:#8d94a6;font-size:14px;';
      this.listEl.appendChild(empty);
      return;
    }
    for (const t of tracks) this.listEl.appendChild(this.renderRow(t));
  }

  private renderRow(t: Track): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:10px',
      'padding:10px 8px',
      'border-bottom:1px solid #1d2233',
    ].join(';');

    const icon = document.createElement('div');
    icon.textContent = t.source === 'builtin' ? '🎵' : '🎧';
    icon.style.cssText = 'width:28px;text-align:center;font-size:18px;';
    row.appendChild(icon);

    const titleCol = document.createElement('div');
    titleCol.style.cssText = 'flex:1;min-width:0;';
    const titleEl = document.createElement('div');
    titleEl.textContent = t.title;
    titleEl.style.cssText = 'font-size:14px;color:#e7ebf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    titleCol.appendChild(titleEl);
    const tagEl = document.createElement('div');
    tagEl.textContent = t.source === 'builtin' ? 'Встроенный' : 'Загружен';
    tagEl.style.cssText = `font-size:10px;color:${t.source === 'builtin' ? '#8d94a6' : '#3ddc84'};margin-top:2px;`;
    titleCol.appendChild(tagEl);
    row.appendChild(titleCol);

    if (t.source === 'user') {
      const del = document.createElement('button');
      del.textContent = 'Удалить';
      del.style.cssText = btnDangerStyle();
      del.addEventListener('click', async () => {
        del.disabled = true;
        try {
          await this.radio.removeUserTrack(t.id);
          await this.refresh();
        } catch (e) {
          console.error('[Playlist] remove failed', e);
          del.disabled = false;
        }
      });
      row.appendChild(del);
    } else {
      const lock = document.createElement('div');
      lock.textContent = '🔒';
      lock.style.cssText = 'opacity:0.4;font-size:14px;padding:0 10px;';
      row.appendChild(lock);
    }

    return row;
  }

  dispose(): void {
    this.overlay.remove();
    this.fileInput?.remove();
  }
}

function btnPrimaryStyle(): string {
  return [
    'background:#3a86ff',
    'color:#fff',
    'border:0',
    'border-radius:8px',
    'padding:10px 16px',
    'font-size:14px',
    'font-weight:700',
    'cursor:pointer',
    'font-family:inherit',
  ].join(';');
}

function btnDangerStyle(): string {
  return [
    'background:#ef476f',
    'color:#fff',
    'border:0',
    'border-radius:6px',
    'padding:6px 12px',
    'font-size:12px',
    'font-weight:700',
    'cursor:pointer',
    'font-family:inherit',
  ].join(';');
}

function btnSecondaryStyle(width: string, height: string): string {
  return [
    `width:${width}`,
    `height:${height}`,
    'background:#1d2233',
    'color:#e7ebf3',
    'border:1px solid #2a3044',
    'border-radius:8px',
    'font-size:16px',
    'cursor:pointer',
    'font-family:inherit',
  ].join(';');
}
