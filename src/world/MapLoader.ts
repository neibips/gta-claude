import type { CityMapFile } from '../types/map';
import { WorldMapValidator } from './WorldMapValidator';

export const MAP_URL = 'assets/maps/city-map.json';

export class MapLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapLoadError';
  }
}

export class MapLoader {
  /**
   * Loads the pre-built city map. Throws MapLoadError if the file is missing
   * or invalid. The game NEVER generates maps at runtime.
   */
  static async load(url: string = MAP_URL, fetcher: typeof fetch = fetch): Promise<CityMapFile> {
    let resp: Response;
    try {
      resp = await fetcher(url, { cache: 'no-cache' });
    } catch (e) {
      throw new MapLoadError(`Map file not found: ${url}`);
    }
    if (!resp.ok) {
      if (resp.status === 404) throw new MapLoadError(`Map file not found: ${url}`);
      throw new MapLoadError(`Map file not found: ${url}`);
    }
    let json: unknown;
    try {
      json = await resp.json();
    } catch {
      throw new MapLoadError(`Map file is not valid JSON: ${url}`);
    }
    const issues = WorldMapValidator.validate(json);
    if (issues.length) {
      throw new MapLoadError(`Map validation failed:\n  - ${issues.join('\n  - ')}`);
    }
    return json as CityMapFile;
  }
}
