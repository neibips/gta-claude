import { test, expect } from '@playwright/test';

const BOOT_TIMEOUT = 60_000;

test.describe('GTA6 AI', () => {
  test('boots without errors and shows the start screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    const canvas = page.locator('#renderCanvas');
    await expect(canvas).toBeVisible();

    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
      { timeout: BOOT_TIMEOUT }
    );

    const significant = errors.filter(
      (e) =>
        !/havok/i.test(e) &&
        !/WebGL/i.test(e) &&
        !/Image_/i.test(e) // GLB texture warnings
    );
    expect(significant).toEqual([]);
  });

  test('map file is loaded from assets/maps/city-map.json (no runtime generation)', async ({ page }) => {
    let generatorCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('generate-map')) generatorCalls++;
    });
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/assets/maps/city-map.json'),
      { timeout: BOOT_TIMEOUT }
    );
    await page.goto('/');
    const resp = await respPromise;
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.size).toEqual({ width: 200, height: 200 });
    expect(Array.isArray(body.roads)).toBe(true);
    expect(body.roads.length).toBeGreaterThan(0);
    expect(Array.isArray(body.buildings)).toBe(true);
    expect(body.buildings.some((b: { type: string }) => b.type === 'police_station')).toBe(true);
    expect(generatorCalls).toBe(0);
  });

  test('clicking PLAY starts the game and player becomes ready', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
      { timeout: BOOT_TIMEOUT }
    );
    await page.evaluate(() => {
      const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
      void g.play();
    });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
      { timeout: BOOT_TIMEOUT }
    );
    // After play, the start screen UI fades out, leaving only the canvas.
    const canvas = page.locator('#renderCanvas');
    await expect(canvas).toBeVisible();
  });

  test('player can move and weapon slots can be selected', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
      { timeout: BOOT_TIMEOUT }
    );
    await page.evaluate(() => {
      const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
      void g.play();
    });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
      { timeout: BOOT_TIMEOUT }
    );
    // Drive the input + tick directly. Synthetic KeyboardEvent.code is unreliable
    // and the in-process render loop can stall under Playwright headless WebGL,
    // so we exercise Player.update() with a deterministic dt to validate movement
    // semantics (no falling through map, walks toward camera-forward).
    const result = await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).__gta;
      // Force one frame so camera matrices are valid before the manual ticks.
      g.sceneMgr.scene.render();
      const p0 = { x: g.player.root.position.x, y: g.player.root.position.y, z: g.player.root.position.z };
      const held = g.input['held'] as Set<string>;
      held.add('KeyW');
      for (let i = 0; i < 20; i++) {
        g.player.update(0.05); // 1s simulated
        g.sceneMgr.scene.render();
      }
      held.delete('KeyW');
      const p1 = { x: g.player.root.position.x, y: g.player.root.position.y, z: g.player.root.position.z };
      return { p0, p1 };
    });
    const moved = Math.hypot(result.p1.x - result.p0.x, result.p1.z - result.p0.z);
    expect(moved).toBeGreaterThan(0.5);
    // Player Y should not be below 0 (no falling through map).
    expect(result.p1.y).toBeGreaterThan(0);

    // Slot 2 = AK-47 — drive Game.equipSlot directly to avoid keyboard-focus flakes.
    const slot = await page.evaluate(() => {
      const g = (window as unknown as {
        __gta: { ['weapons']: { equipSlot(s: number): void; ['active']: { cfg: { slot: number; id: string } } } };
      }).__gta;
      g['weapons'].equipSlot(2);
      return { slot: g['weapons'].active.cfg.slot, id: g['weapons'].active.cfg.id };
    });
    expect(slot.id).toBe('ak47');
    expect(slot.slot).toBe(2);
  });

  test('wanted system rises when an NPC is killed', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
      { timeout: BOOT_TIMEOUT }
    );
    await page.evaluate(() => {
      const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
      void g.play();
    });
    await page.waitForFunction(
      () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
      { timeout: BOOT_TIMEOUT }
    );
    const result = await page.evaluate(() => {
      const w = (
        window as unknown as {
          __gta: { ['wanted']: { getLevel(): number; onNPCKilled(): void } };
        }
      ).__gta['wanted'];
      const before = w.getLevel();
      w.onNPCKilled();
      const after = w.getLevel();
      return { before, after };
    });
    expect(result.before).toBe(0);
    expect(result.after).toBe(1);
  });
});
