# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: game.spec.ts >> GTA6 AI >> player can move and weapon slots can be selected
- Location: tests/e2e/game.spec.ts:75:3

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForFunction: Test timeout of 60000ms exceeded.
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | const BOOT_TIMEOUT = 60_000;
  4   | 
  5   | test.describe('GTA6 AI', () => {
  6   |   test('boots without errors and shows the start screen', async ({ page }) => {
  7   |     const errors: string[] = [];
  8   |     page.on('pageerror', (e) => errors.push(e.message));
  9   |     page.on('console', (msg) => {
  10  |       if (msg.type() === 'error') errors.push(msg.text());
  11  |     });
  12  | 
  13  |     await page.goto('/');
  14  |     const canvas = page.locator('#renderCanvas');
  15  |     await expect(canvas).toBeVisible();
  16  | 
  17  |     await page.waitForFunction(
  18  |       () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
  19  |       { timeout: BOOT_TIMEOUT }
  20  |     );
  21  | 
  22  |     const significant = errors.filter(
  23  |       (e) =>
  24  |         !/havok/i.test(e) &&
  25  |         !/WebGL/i.test(e) &&
  26  |         !/Image_/i.test(e) // GLB texture warnings
  27  |     );
  28  |     expect(significant).toEqual([]);
  29  |   });
  30  | 
  31  |   test('map file is loaded from assets/maps/city-map.json (no runtime generation)', async ({ page }) => {
  32  |     let generatorCalls = 0;
  33  |     page.on('request', (req) => {
  34  |       if (req.url().includes('generate-map')) generatorCalls++;
  35  |     });
  36  |     const respPromise = page.waitForResponse(
  37  |       (r) => r.url().includes('/assets/maps/city-map.json'),
  38  |       { timeout: BOOT_TIMEOUT }
  39  |     );
  40  |     await page.goto('/');
  41  |     const resp = await respPromise;
  42  |     expect(resp.status()).toBe(200);
  43  |     const body = await resp.json();
  44  |     expect(body.version).toBe(2);
  45  |     expect(body.size).toEqual({ width: 600, height: 600 });
  46  |     expect(body.districts.map((d: { id: string }) => d.id).sort()).toEqual(['city', 'factory', 'field', 'village']);
  47  |     expect(body.visualModel.modelPath).toBe('assets/maps/city_map.glb');
  48  |     expect(body.visualModel.collision).toBe('mesh');
  49  |     expect(Array.isArray(body.roads)).toBe(true);
  50  |     expect(body.roads.length).toBeGreaterThan(0);
  51  |     expect(Array.isArray(body.buildings)).toBe(true);
  52  |     expect(body.assetInstances.some((a: { modelPath?: string }) => a.modelPath?.startsWith('assets/environment/'))).toBe(true);
  53  |     expect(generatorCalls).toBe(0);
  54  |   });
  55  | 
  56  |   test('clicking PLAY starts the game and player becomes ready', async ({ page }) => {
  57  |     await page.goto('/');
  58  |     await page.waitForFunction(
  59  |       () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
  60  |       { timeout: BOOT_TIMEOUT }
  61  |     );
  62  |     await page.evaluate(() => {
  63  |       const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
  64  |       void g.play();
  65  |     });
  66  |     await page.waitForFunction(
  67  |       () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
  68  |       { timeout: BOOT_TIMEOUT }
  69  |     );
  70  |     // After play, the start screen UI fades out, leaving only the canvas.
  71  |     const canvas = page.locator('#renderCanvas');
  72  |     await expect(canvas).toBeVisible();
  73  |   });
  74  | 
  75  |   test('player can move and weapon slots can be selected', async ({ page }) => {
  76  |     await page.goto('/');
> 77  |     await page.waitForFunction(
      |                ^ Error: page.waitForFunction: Test timeout of 60000ms exceeded.
  78  |       () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
  79  |       { timeout: BOOT_TIMEOUT }
  80  |     );
  81  |     await page.evaluate(() => {
  82  |       const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
  83  |       void g.play();
  84  |     });
  85  |     await page.waitForFunction(
  86  |       () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
  87  |       { timeout: BOOT_TIMEOUT }
  88  |     );
  89  |     // Drive the input + tick directly. Synthetic KeyboardEvent.code is unreliable
  90  |     // and the in-process render loop can stall under Playwright headless WebGL,
  91  |     // so we exercise Player.update() with a deterministic dt to validate movement
  92  |     // semantics (no falling through map, walks toward camera-forward).
  93  |     const result = await page.evaluate(() => {
  94  |       // eslint-disable-next-line @typescript-eslint/no-explicit-any
  95  |       const g = (window as any).__gta;
  96  |       // Force one frame so camera matrices are valid before the manual ticks.
  97  |       g.sceneMgr.scene.render();
  98  |       const p0 = { x: g.player.root.position.x, y: g.player.root.position.y, z: g.player.root.position.z };
  99  |       const held = g.input['held'] as Set<string>;
  100 |       held.add('KeyW');
  101 |       for (let i = 0; i < 20; i++) {
  102 |         g.player.update(0.05); // 1s simulated
  103 |         g.sceneMgr.scene.render();
  104 |       }
  105 |       held.delete('KeyW');
  106 |       const p1 = { x: g.player.root.position.x, y: g.player.root.position.y, z: g.player.root.position.z };
  107 |       return { p0, p1 };
  108 |     });
  109 |     const moved = Math.hypot(result.p1.x - result.p0.x, result.p1.z - result.p0.z);
  110 |     expect(moved).toBeGreaterThan(0.5);
  111 |     // Player Y should not be below 0 (no falling through map).
  112 |     expect(result.p1.y).toBeGreaterThan(0);
  113 | 
  114 |     // Slot 2 = AK-47 — drive Game.equipSlot directly to avoid keyboard-focus flakes.
  115 |     const slot = await page.evaluate(() => {
  116 |       const g = (window as unknown as {
  117 |         __gta: { ['weapons']: { equipSlot(s: number): void; ['active']: { cfg: { slot: number; id: string } } } };
  118 |       }).__gta;
  119 |       g['weapons'].equipSlot(2);
  120 |       return { slot: g['weapons'].active.cfg.slot, id: g['weapons'].active.cfg.id };
  121 |     });
  122 |     expect(slot.id).toBe('ak47');
  123 |     expect(slot.slot).toBe(2);
  124 |   });
  125 | 
  126 |   test('wanted system rises when an NPC is killed', async ({ page }) => {
  127 |     await page.goto('/');
  128 |     await page.waitForFunction(
  129 |       () => Boolean((window as unknown as { __gtaBootComplete?: boolean }).__gtaBootComplete),
  130 |       { timeout: BOOT_TIMEOUT }
  131 |     );
  132 |     await page.evaluate(() => {
  133 |       const g = (window as unknown as { __gta: { play(): Promise<void> } }).__gta;
  134 |       void g.play();
  135 |     });
  136 |     await page.waitForFunction(
  137 |       () => Boolean((window as unknown as { __gtaReady?: boolean }).__gtaReady),
  138 |       { timeout: BOOT_TIMEOUT }
  139 |     );
  140 |     const result = await page.evaluate(() => {
  141 |       const w = (
  142 |         window as unknown as {
  143 |           __gta: { ['wanted']: { getLevel(): number; onNPCKilled(): void } };
  144 |         }
  145 |       ).__gta['wanted'];
  146 |       const before = w.getLevel();
  147 |       w.onNPCKilled();
  148 |       const after = w.getLevel();
  149 |       return { before, after };
  150 |     });
  151 |     expect(result.before).toBe(0);
  152 |     expect(result.after).toBe(1);
  153 |   });
  154 | });
  155 | 
```