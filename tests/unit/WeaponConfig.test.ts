import { describe, it, expect } from 'vitest';
import weaponConfig from '../../src/config/WeaponConfig.json';

describe('WeaponConfig', () => {
  it('defines exactly 4 weapons', () => {
    expect(Array.isArray(weaponConfig.weapons)).toBe(true);
    expect(weaponConfig.weapons).toHaveLength(4);
  });

  it('uses unique slot ids 1..4', () => {
    const slots = weaponConfig.weapons.map((w) => w.slot).sort();
    expect(slots).toEqual([1, 2, 3, 4]);
  });

  it('every weapon has the required fields', () => {
    for (const w of weaponConfig.weapons) {
      expect(typeof w.id).toBe('string');
      expect(typeof w.name).toBe('string');
      expect(typeof w.damage).toBe('number');
      expect(typeof w.range).toBe('number');
      expect(typeof w.fireRate).toBe('number');
      expect(typeof w.boneName).toBe('string');
      expect(w.positionOffset).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
      expect(w.rotationOffset).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    }
  });

  it('AK-47 matches spec (35 dmg, 80 range, 30 mag)', () => {
    const ak = weaponConfig.weapons.find((w) => w.id === 'ak47');
    expect(ak).toBeDefined();
    expect(ak!.damage).toBe(35);
    expect(ak!.range).toBe(80);
    expect(ak!.magazineSize).toBe(30);
  });

  it('RPG matches spec (200 dmg)', () => {
    const rpg = weaponConfig.weapons.find((w) => w.id === 'rpg');
    expect(rpg).toBeDefined();
    expect(rpg!.damage).toBe(200);
  });

  it('Fists have damage=25 and range=1.5 with no asset path', () => {
    const f = weaponConfig.weapons.find((w) => w.id === 'fists');
    expect(f).toBeDefined();
    expect(f!.damage).toBe(25);
    expect(f!.range).toBe(1.5);
    expect(f!.assetPath).toBeNull();
  });

  it('Water gun has damage=5', () => {
    const w = weaponConfig.weapons.find((w) => w.id === 'water_gun');
    expect(w).toBeDefined();
    expect(w!.damage).toBe(5);
  });
});
