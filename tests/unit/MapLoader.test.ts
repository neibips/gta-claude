import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MapLoader, MapLoadError } from '../../src/world/MapLoader';

const realMap = JSON.parse(
  readFileSync(resolve(__dirname, '../../assets/maps/city-map.json'), 'utf8')
);

const okFetch = (body: unknown) =>
  vi.fn(async (_url: string, _init?: unknown) =>
    new Response(JSON.stringify(body), { status: 200 })
  ) as unknown as typeof fetch;

const badFetch = (status: number) =>
  vi.fn(async () => new Response('not found', { status })) as unknown as typeof fetch;

describe('MapLoader', () => {
  it('loads and returns parsed map', async () => {
    const map = await MapLoader.load('assets/maps/city-map.json', okFetch(realMap));
    expect(map.size.width).toBe(200);
    expect(map.size.height).toBe(200);
  });

  it('throws MapLoadError when file missing (404)', async () => {
    await expect(MapLoader.load('assets/maps/city-map.json', badFetch(404))).rejects.toThrow(
      MapLoadError
    );
    await expect(MapLoader.load('assets/maps/city-map.json', badFetch(404))).rejects.toThrow(
      /Map file not found/
    );
  });

  it('does not generate a map (no MapBuilder import here)', async () => {
    // Simply assert that the loader returns the same parsed object — it never calls
    // a generator. If the file is missing, it errors instead of producing data.
    const map = await MapLoader.load('assets/maps/city-map.json', okFetch(realMap));
    expect(map).toEqual(realMap);
  });

  it('throws on validation failure', async () => {
    const broken = { ...realMap, version: 99 };
    await expect(MapLoader.load('assets/maps/city-map.json', okFetch(broken))).rejects.toThrow(
      /validation failed/
    );
  });

  it('throws on invalid JSON body', async () => {
    const fetcher = vi.fn(async () => new Response('not-json', { status: 200 })) as unknown as typeof fetch;
    await expect(MapLoader.load('assets/maps/city-map.json', fetcher)).rejects.toThrow(/JSON/);
  });
});
