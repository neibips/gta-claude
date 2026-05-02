import { PlaylistStore, type StoredTrack } from './PlaylistStore';
import radioConfig from '../config/RadioConfig.json';

const builtinAudioModules = import.meta.glob('../../assets/music/*.{mp3,ogg,wav,m4a}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function discoverBuiltinTracks(): Track[] {
  return Object.entries(builtinAudioModules).map(([path, url]) => {
    const file = path.split('/').pop() ?? path;
    const title = file.replace(/\.[^.]+$/, '').replace(/^\s+|\s+$/g, '');
    const id = `builtin:${file}`;
    return { id, title, url, source: 'builtin' as const };
  });
}

export interface Track {
  id: string;
  title: string;
  url: string;
  source: 'builtin' | 'user';
}

export type RadioListener = (state: { track: Track | null; enabled: boolean }) => void;

export class RadioSystem {
  readonly stationName: string = radioConfig.stationName;
  private readonly audio: HTMLAudioElement;
  private playlist: Track[] = [];
  private order: number[] = [];
  private orderIdx = 0;
  private enabled = false;
  private readonly userObjectUrls = new Map<string, string>();
  private readonly listeners = new Set<RadioListener>();
  readonly store = new PlaylistStore();

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0.7;
    this.audio.addEventListener('ended', () => this.next());
  }

  async loadPlaylist(): Promise<void> {
    const builtin = discoverBuiltinTracks();
    let user: Track[] = [];
    try {
      const stored = await this.store.list();
      user = stored.map((s) => this.toUserTrack(s));
    } catch (e) {
      console.warn('[Radio] failed to load user tracks', e);
    }
    this.playlist = [...builtin, ...user];
    this.shuffleOrder();
  }

  private toUserTrack(s: StoredTrack): Track {
    let url = this.userObjectUrls.get(s.id);
    if (!url) {
      url = URL.createObjectURL(s.blob);
      this.userObjectUrls.set(s.id, url);
    }
    return { id: s.id, title: s.title, url, source: 'user' };
  }

  async addUserTracks(files: File[]): Promise<void> {
    for (const file of files) {
      const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const title = file.name.replace(/\.[^.]+$/, '');
      const stored: StoredTrack = { id, title, blob: file, addedAt: Date.now() };
      await this.store.add(stored);
    }
    await this.refreshPlaylistPreserving();
  }

  async removeUserTrack(id: string): Promise<void> {
    await this.store.remove(id);
    const url = this.userObjectUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      this.userObjectUrls.delete(id);
    }
    await this.refreshPlaylistPreserving();
  }

  private async refreshPlaylistPreserving(): Promise<void> {
    const currentId = this.current()?.id ?? null;
    await this.loadPlaylist();
    if (currentId) {
      const idx = this.playlist.findIndex((t) => t.id === currentId);
      if (idx >= 0) {
        const orderPos = this.order.indexOf(idx);
        if (orderPos >= 0) this.orderIdx = orderPos;
      }
    }
    this.emit();
  }

  async listAll(): Promise<Track[]> {
    return [...this.playlist];
  }

  private shuffleOrder(): void {
    this.order = this.playlist.map((_, i) => i);
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.order[i], this.order[j]] = [this.order[j], this.order[i]];
    }
    this.orderIdx = 0;
  }

  current(): Track | null {
    if (!this.playlist.length || !this.order.length) return null;
    return this.playlist[this.order[this.orderIdx]] ?? null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  start(): void {
    if (!this.playlist.length) {
      this.enabled = true;
      this.emit();
      return;
    }
    this.enabled = true;
    this.ensureLoaded();
    this.audio.play().catch((e) => console.warn('[Radio] play failed', e));
    this.emit();
  }

  stop(): void {
    this.enabled = false;
    this.audio.pause();
    this.emit();
  }

  toggle(): void {
    if (this.enabled) this.stop();
    else this.start();
  }

  next(): void {
    if (!this.playlist.length) return;
    this.orderIdx = (this.orderIdx + 1) % this.order.length;
    if (this.orderIdx === 0) this.shuffleOrder();
    this.loadCurrent();
    if (this.enabled) {
      this.audio.play().catch((e) => console.warn('[Radio] play failed', e));
    }
    this.emit();
  }

  private ensureLoaded(): void {
    if (!this.audio.src) this.loadCurrent();
  }

  private loadCurrent(): void {
    const t = this.current();
    if (!t) {
      this.audio.removeAttribute('src');
      this.audio.load();
      return;
    }
    if (this.audio.src !== t.url && !this.audio.src.endsWith(t.url)) {
      this.audio.src = t.url;
    }
  }

  onChange(fn: RadioListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = { track: this.current(), enabled: this.enabled };
    for (const fn of this.listeners) {
      try {
        fn(snap);
      } catch (e) {
        console.warn('[Radio] listener error', e);
      }
    }
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute('src');
    for (const url of this.userObjectUrls.values()) URL.revokeObjectURL(url);
    this.userObjectUrls.clear();
    this.listeners.clear();
  }
}
