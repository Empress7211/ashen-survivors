import { expect, test, type Locator, type Page } from '@playwright/test';

const ARTIFACT_DIR =
  '/Users/Arthur/.gemini/antigravity/brain/fbe84a86-5bd3-41af-9914-cafaae1d0550';
const SAVE_STORAGE_KEY = 'ashen_survivors_save_v1';

interface AuditTracker {
  consoleErrors: string[];
  pageErrors: string[];
  failedResponses: string[];
  failedRequests: string[];
  assertClean: () => void;
}

function attachZeroErrorAudit(page: Page): AuditTracker {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedResponses: string[] = [];
  const failedRequests: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err));
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      failedResponses.push(`${res.status()} ${res.url()}`);
    }
  });
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'unknown error';
    failedRequests.push(`${req.url()} (${failure})`);
  });

  return {
    consoleErrors,
    pageErrors,
    failedResponses,
    failedRequests,
    assertClean: () => {
      expect(consoleErrors, 'console.error list').toEqual([]);
      expect(pageErrors, 'pageerror list').toEqual([]);
      expect(failedResponses, 'HTTP >= 400 responses').toEqual([]);
      expect(failedRequests, 'failed network requests').toEqual([]);
    },
  };
}

async function assertAllImagesLoaded(page: Page, contextLabel: string): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const imgs = Array.from(document.querySelectorAll('img'));
    await Promise.all(
      imgs.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
          setTimeout(() => resolve(), 5000);
        });
      }),
    );
  });

  const broken = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs
      .filter((img) => !img.complete || img.naturalWidth <= 0)
      .map((img) => img.getAttribute('src') ?? img.alt);
  });

  expect(broken, `broken <img> elements on ${contextLabel}`).toEqual([]);
}

async function assertNoInvalidText(page: Page, contextLabel: string): Promise<void> {
  const bodyText = await page.locator('#app').innerText();
  expect(bodyText, `unexpected NaN on ${contextLabel}`).not.toMatch(/\bNaN\b/);
  expect(bodyText, `unexpected undefined on ${contextLabel}`).not.toMatch(/\bundefined\b/);
  expect(bodyText, `unexpected Infinity on ${contextLabel}`).not.toMatch(/\bInfinity\b/);
}

async function shot(page: Page, filename: string): Promise<void> {
  await page.waitForTimeout(260);
  await page.screenshot({
    path: `${ARTIFACT_DIR}/${filename}`,
    fullPage: false,
  });
}

async function assertCanvasNonBlack(
  page: Page,
  canvas: Locator,
  label: string,
): Promise<void> {
  const pngBytes = await canvas.screenshot();
  const base64 = pngBytes.toString('base64');
  const stats = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([arr], { type: 'image/png' }));
    const off = document.createElement('canvas');
    off.width = bmp.width;
    off.height = bmp.height;
    const ctx = off.getContext('2d')!;
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const { data, width, height } = ctx.getImageData(0, 0, off.width, off.height);
    let nonBlack = 0;
    let total = 0;
    let lumSum = 0;
    for (let y = 90; y < height - 40; y += 10) {
      for (let x = 40; x < width - 40; x += 10) {
        const idx = (y * width + x) * 4;
        const lum = data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114;
        lumSum += lum;
        total++;
        if (lum > 18) nonBlack++;
      }
    }
    return {
      meanLum: lumSum / Math.max(1, total),
      nonBlackRatio: nonBlack / Math.max(1, total),
    };
  }, base64);

  expect(stats.meanLum, `canvas mean luminance too dark on ${label}`).toBeGreaterThan(18);
  expect(stats.nonBlackRatio, `canvas appears blank/black on ${label}`).toBeGreaterThan(0.5);
}

test.describe('《Vampire Survivors · 灰烬之夜》 E2E & Visual QA', () => {
  test('1. Title Screen, Settings Save Transfer, PowerUp Buy & 100% Refund, Collection, Bestiary & Achievements', async ({
    page,
  }) => {
    const audit = attachZeroErrorAudit(page);

    await page.goto('/');
    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: '《灰烬之夜》' })).toBeVisible();
    await expect(page.getByTestId('title-gold-counter')).toContainText('0 G');

    await assertAllImagesLoaded(page, 'Title Screen');
    await assertNoInvalidText(page, 'Title Screen');
    await shot(page, '01-title-screen.png');

    // Open Settings & test JSON Export + Import with 2,500 G
    await page.getByTestId('btn-settings').click();
    await expect(page.getByTestId('modal-settings')).toBeVisible();
    await page.getByTestId('btn-export-save').click();
    await shot(page, '06-settings.png');

    const rawExport = await page.getByTestId('textarea-save-json').inputValue();
    const parsed = JSON.parse(rawExport) as Record<string, unknown>;
    expect(parsed.version).toBe(1);
    parsed.gold = 2500;
    parsed.totalGoldEarned = 2500;

    await page.getByTestId('textarea-save-json').fill(JSON.stringify(parsed, null, 2));
    await page.getByTestId('btn-import-save').click();
    await expect(page.getByTestId('settings-status-banner')).toContainText('成功载入');
    await expect(page.getByTestId('title-gold-counter')).toContainText('2,500 G');
    await page.getByTestId('btn-close-settings').click();
    await expect(page.getByTestId('modal-settings')).toBeHidden();

    // PowerUp Shop: verify buy -> gold decreases & rank increases -> 100% Refund -> gold restored
    await page.getByTestId('btn-powerups').click();
    await expect(page.getByTestId('screen-powerups')).toBeVisible();
    await expect(page.getByTestId('powerups-gold-counter')).toContainText('2,500 G');
    await assertAllImagesLoaded(page, 'PowerUp Shop');

    // Buy Might Lv.1 (baseCost 200 -> 200 G; gold becomes 2,300 G)
    await page.getByTestId('btn-buy-powerup-might').click();
    await expect(page.getByTestId('powerup-rank-might')).toHaveText('1/5');
    await expect(page.getByTestId('powerups-gold-counter')).toContainText('2,300 G');

    // Buy Magnet Lv.1 (baseCost 300 * 1 * 1.1 = 330 G; gold becomes 1,970 G)
    await page.getByTestId('btn-buy-powerup-magnet').click();
    await expect(page.getByTestId('powerup-rank-magnet')).toHaveText('1/2');
    await expect(page.getByTestId('powerups-gold-counter')).toContainText('1,970 G');
    await assertNoInvalidText(page, 'PowerUp Shop');
    await shot(page, '02-powerups.png');

    // Click 100% Refund and verify exact gold restoration
    await page.getByTestId('btn-powerups-refund').click();
    await expect(page.getByTestId('powerups-gold-counter')).toContainText('2,500 G');
    await expect(page.getByTestId('powerup-rank-might')).toHaveText('0/5');
    await expect(page.getByTestId('powerup-rank-magnet')).toHaveText('0/2');
    await page.getByTestId('btn-powerups-back').click();
    await expect(page.getByTestId('screen-title')).toBeVisible();

    // Collection & Grimoire modal across all 5 tabs
    await page.getByTestId('btn-collection').click();
    await expect(page.getByTestId('modal-collection')).toBeVisible();
    await assertAllImagesLoaded(page, 'Collection Grimoire');
    await shot(page, '03-collection.png');
    for (const tab of ['weapons', 'passives', 'arcanas', 'relics'] as const) {
      await page.getByTestId(`collection-tab-${tab}`).click();
      await assertAllImagesLoaded(page, `Collection tab ${tab}`);
    }
    await page.getByTestId('btn-close-collection').click();

    // Bestiary modal
    await page.getByTestId('btn-bestiary').click();
    await expect(page.getByTestId('modal-bestiary')).toBeVisible();
    await expect(page.locator('[data-testid="modal-bestiary"] .codex-card')).toHaveCount(28);
    await assertAllImagesLoaded(page, 'Bestiary Modal');
    await shot(page, '04-bestiary.png');
    await page.getByTestId('btn-close-bestiary').click();

    // Achievements modal
    await page.getByTestId('btn-achievements').click();
    await expect(page.getByTestId('modal-achievements')).toBeVisible();
    const achCount = await page
      .locator('[data-testid="modal-achievements"] .codex-card')
      .count();
    expect(achCount).toBeGreaterThanOrEqual(40);
    await assertNoInvalidText(page, 'Achievements Modal');
    await shot(page, '05-achievements.png');
    await page.getByTestId('btn-close-achievements').click();

    audit.assertClean();
  });

  test('2. Hero Select -> Stage Select -> Mad Forest Live Battle (WASD, Kills, XP Level-Up, Pause Grimoire/Map, Settlement DPS)', async ({
    page,
  }) => {
    const audit = attachZeroErrorAudit(page);

    await page.goto('/');
    await page.evaluate((key) => window.localStorage.removeItem(key), SAVE_STORAGE_KEY);
    await page.reload();

    await page.getByTestId('btn-start-hunt').click();
    await expect(page.getByTestId('screen-hero-select')).toBeVisible();
    await assertAllImagesLoaded(page, 'Hero Select');
    await assertNoInvalidText(page, 'Hero Select');
    await shot(page, '07-hero-select.png');

    // Confirm Antonio and enter Stage Select
    await page.getByTestId('hero-card-antonio').click();
    await page.getByTestId('btn-hero-confirm').click();
    await expect(page.getByTestId('screen-stage-select')).toBeVisible();
    await assertAllImagesLoaded(page, 'Stage Select');

    // Enable Hurry for crisp fast combat pacing during live E2E
    await page.getByTestId('toggle-hurry').click();
    await shot(page, '08-stage-select.png');

    await page.getByTestId('btn-stage-start').click();
    await expect(page.getByTestId('screen-battle')).toBeVisible();
    await expect(page.getByTestId('battle-hud')).toBeVisible();

    const canvas = page.locator('[data-testid="screen-battle"] canvas');
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(1200);
    expect(box!.height).toBeGreaterThanOrEqual(760);

    // Wait for loading overlay to finish, clock to tick, and canvas to paint non-black battle scene
    await expect(page.getByTestId('battle-loading')).toBeHidden({ timeout: 10_000 });
    await expect
      .poll(async () => page.getByTestId('hud-timer').innerText(), { timeout: 10_000 })
      .not.toBe('00:00');
    await assertCanvasNonBlack(page, canvas, 'Mad Forest Live Battle');

    // Drive real WASD movement to engage enemies, kill them, and magnetize XP gems to Lv.2
    const keys = ['KeyD', 'KeyW', 'KeyA', 'KeyS'];
    let capturedBattleShot = false;
    let reachedLevelUp = false;
    const deadline = Date.now() + 45_000;
    let stepIdx = 0;

    while (Date.now() < deadline) {
      if (await page.getByTestId('modal-level-up').isVisible()) {
        reachedLevelUp = true;
        break;
      }

      const key = keys[stepIdx % keys.length]!;
      await page.keyboard.down(key);
      await page.waitForTimeout(1150);
      await page.keyboard.up(key);
      stepIdx += 1;

      if (await page.getByTestId('modal-level-up').isVisible()) {
        reachedLevelUp = true;
        break;
      }

      const killsText = await page.getByTestId('hud-kills').innerText();
      const killsNum = Number(killsText.replace(/[^\d]/g, ''));
      if (!capturedBattleShot && killsNum >= 1) {
        await assertNoInvalidText(page, 'Mad Forest Battle');
        await shot(page, '09-mad-forest-battle.png');
        capturedBattleShot = true;
      }
    }

    if (!capturedBattleShot) {
      await shot(page, '09-mad-forest-battle.png');
    }

    const finalKills = Number(
      (await page.getByTestId('hud-kills').innerText()).replace(/[^\d]/g, ''),
    );
    expect(finalKills, 'expected Whip to kill enemies in Mad Forest').toBeGreaterThan(0);
    expect(reachedLevelUp, 'expected XP gems to trigger Level-Up modal').toBe(true);

    // Inspect Level-Up modal and choose option 1 via hotkey '1'
    await expect(page.getByTestId('modal-level-up')).toBeVisible();
    await assertAllImagesLoaded(page, 'Level-Up Modal');
    await assertNoInvalidText(page, 'Level-Up Modal');
    await shot(page, '10-level-up-modal.png');

    await page.keyboard.press('Digit1');
    await expect(page.getByTestId('modal-level-up')).toBeHidden();
    await expect(page.getByTestId('hud-level')).toContainText('Lv. 2');

    // Pause via Space -> verify Grimoire & Milky Way Map -> screenshot
    await page.keyboard.press('Space');
    await expect(page.getByTestId('modal-pause')).toBeVisible();
    await expect(page.getByTestId('pause-grimoire-section')).toBeVisible();
    await expect(page.getByTestId('pause-minimap-section')).toBeVisible();
    await expect(page.locator('[data-testid="pause-minimap-section"] svg.minimap-svg')).toBeVisible();
    await page.keyboard.press('KeyG');
    await page.keyboard.press('KeyM');
    await assertAllImagesLoaded(page, 'Pause Modal');
    await assertNoInvalidText(page, 'Pause Modal');
    await shot(page, '11-pause-grimoire-map.png');

    // Retire to Settlement & verify DPS breakdown table
    await page.getByTestId('btn-pause-retire').click();
    await expect(page.getByTestId('modal-settlement')).toBeVisible();
    await expect(page.getByTestId('settlement-dps-table')).toBeVisible();
    const firstRowCells = page.locator(
      '[data-testid="settlement-dps-table"] tbody tr:first-child td',
    );
    await expect(firstRowCells).toHaveCount(5);
    const totalDamageText = await firstRowCells.nth(3).innerText();
    const dpsText = await firstRowCells.nth(4).innerText();
    expect(Number(totalDamageText.replace(/[^\d]/g, ''))).toBeGreaterThan(0);
    expect(Number(dpsText)).toBeGreaterThan(0);
    await assertAllImagesLoaded(page, 'Settlement Modal');
    await assertNoInvalidText(page, 'Settlement Modal');
    await shot(page, '12-settlement-dps.png');

    // Return to Title Menu cleanly
    await page.getByTestId('btn-settlement-menu').click();
    await expect(page.getByTestId('screen-title')).toBeVisible();

    audit.assertClean();
  });

  test('3. Inlaid Library Corridor Battle (Bookshelf Walls, Clamping, Unlocked Grimoire & Milky Way Map)', async ({
    page,
  }) => {
    const audit = attachZeroErrorAudit(page);

    await page.goto('/');
    await page.evaluate((key) => {
      const seeded = {
        version: 1,
        gold: 500,
        totalGoldEarned: 500,
        totalKills: 100,
        totalRuns: 1,
        powerUps: {
          max_health: 3,
          armor: 3,
          recovery: 5,
          might: 4,
          area: 2,
          cooldown: 2,
        },
        unlockedHeroes: ['antonio', 'imelda', 'pasqualina', 'gennaro'],
        purchasedHeroes: ['antonio'],
        unlockedStages: ['mad_forest', 'inlaid_library'],
        unlockedHyper: [],
        unlockedRelics: ['relic_grimoire', 'relic_map'],
        unlockedArcanas: [],
        unlockedAchievements: ['ach_unlock_library'],
        discoveredItems: ['whip', 'magic_wand', 'relic_grimoire', 'relic_map'],
        bestiaryKills: {},
        bestRunByStage: {},
        selectedHeroId: 'antonio',
        selectedStageId: 'inlaid_library',
        stageOptions: {
          hyper: false,
          hurry: false,
          arcanasEnabled: false,
          limitBreakEnabled: false,
          endless: false,
        },
        settings: {
          bgmVolume: 0.4,
          sfxVolume: 0.6,
          muted: true,
          showDamageNumbers: true,
          screenShake: true,
          visualEffectsQuality: 'high',
          showMinimap: true,
          language: 'zh-CN',
        },
      };
      window.localStorage.setItem(key, JSON.stringify(seeded));
    }, SAVE_STORAGE_KEY);
    await page.reload();

    await page.getByTestId('btn-start-hunt').click();
    await page.getByTestId('btn-hero-confirm').click();
    await expect(page.getByTestId('screen-stage-select')).toBeVisible();
    await page.getByTestId('stage-card-inlaid_library').click();
    await expect(page.getByTestId('stage-detail-pane')).toContainText('镶嵌图书馆');
    await expect(page.getByTestId('stage-detail-pane')).toContainText('回廊限制');

    await page.getByTestId('btn-stage-start').click();
    await expect(page.getByTestId('screen-battle')).toBeVisible();

    await expect
      .poll(async () => page.getByTestId('hud-timer').innerText(), { timeout: 10_000 })
      .not.toBe('00:00');

    // Walk North (W) past y=-360 for 3.6s to clamp directly against northern bookshelf wall,
    // then walk East (D) 1.5s along the corridor wall
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3600);
    await page.keyboard.up('KeyW');

    await page.keyboard.down('KeyD');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyD');

    await assertNoInvalidText(page, 'Inlaid Library Battle');
    await shot(page, '13-inlaid-library-corridor.png');

    // Pause via Esc: verify Grimoire + Milky Way Map + corridor boundary rect in SVG
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('modal-pause')).toBeVisible();
    await expect(page.getByTestId('pause-grimoire-section')).toContainText('魔导书已解锁');
    await expect(page.getByTestId('pause-minimap-section')).toContainText('银河系地图已激活');
    await expect(page.locator('svg.minimap-svg rect')).toHaveCount(1);

    await page.getByTestId('btn-pause-retire').click();
    await expect(page.getByTestId('modal-settlement')).toBeVisible();
    await page.getByTestId('btn-settlement-menu').click();
    await expect(page.getByTestId('screen-title')).toBeVisible();

    audit.assertClean();
  });

  test('4. 1,200+ Enemy Horde Stress & WebGL2 Pooled Rendering Audit', async ({ page }) => {
    const audit = attachZeroErrorAudit(page);

    await page.goto('http://127.0.0.1:4174/');
    await expect(page.getByTestId('screen-title')).toBeVisible();

    const stressStats = await page.evaluate(async () => {
      const dynImport = (p: string): Promise<Record<string, unknown>> =>
        (new Function('u', 'return import(u)') as (u: string) => Promise<Record<string, unknown>>)(
          p,
        );

      const [core, renderMod, dataMod, hudMod] = (await Promise.all([
        dynImport('/src/core/index.ts'),
        dynImport('/src/render/index.ts'),
        dynImport('/src/data/index.ts'),
        dynImport('/src/ui/BattleHud.ts'),
      ])) as [
        typeof import('../../src/core/index.ts'),
        typeof import('../../src/render/index.ts'),
        typeof import('../../src/data/index.ts'),
        typeof import('../../src/ui/BattleHud.ts'),
      ];

      const app = document.getElementById('app')!;
      app.replaceChildren();
      const container = document.createElement('div');
      container.className = 'battle-screen';
      container.style.width = '1280px';
      container.style.height = '800px';
      app.appendChild(container);

      const canvasHost = document.createElement('div');
      canvasHost.className = 'battle-canvas-host';
      const hud = new hudMod.BattleHudView({
        catalog: dataMod.CATALOG,
        isMuted: () => true,
        onToggleMute: () => {},
        onTogglePause: () => {},
      });
      container.append(canvasHost, hud.element);

      const renderer = new renderMod.BattleRenderer(canvasHost, {
        stageId: 'mad_forest',
        width: 1280,
        height: 800,
        visualEffectsQuality: 'high',
        screenShakeEnabled: true,
        showDamageNumbers: true,
      });
      await renderer.ready();

      const save = core.createDefaultSaveState(dataMod.CATALOG);
      const sim = new core.GameSimulation(
        {
          heroId: 'pugnala',
          stageId: 'mad_forest',
          hyper: true,
          hurry: false,
          arcanasEnabled: false,
          limitBreakEnabled: true,
          endless: false,
          seed: 777,
        },
        save,
        dataMod.CATALOG,
      );

      // Equip high-density evolved weapons for real VFX + projectile stress
      for (const w of [
        'phieraggi',
        'death_spiral',
        'unholy_vespers',
        'la_borra',
        'thunder_loop',
        'bloody_tear',
      ] as const) {
        sim.weaponSystem.addOrUpgradeWeapon(w);
      }

      const poolIds = [
        'bat_brown',
        'zombie',
        'skeleton',
        'skeleton_armored',
        'werewolf',
        'imp_demon',
      ] as const;

      for (let i = 0; i < 1260; i++) {
        const theta = (i / 1260) * Math.PI * 2 * 7;
        const ring = 150 + ((i * 19) % 520);
        sim.enemySystem.spawnEnemy(
          poolIds[i % poolIds.length]!,
          Math.cos(theta) * ring,
          Math.sin(theta) * ring,
          { hpScale: 45 },
        );
      }
      sim.enemySystem.spawnEnemy('boss_werewolf_alpha', 280, -140, { hpScale: 8 });

      let minActive = Infinity;
      let maxActive = 0;
      let hasNaN = false;
      const frameTimes: number[] = [];

      for (let f = 0; f < 45; f++) {
        while (sim.enemySystem.activeCount < 1180) {
          const idx = sim.enemySystem.activeCount;
          const theta = ((idx + f * 37) * 0.6180339) * Math.PI * 2;
          const ring = 260 + ((idx * 17) % 380);
          sim.enemySystem.spawnEnemy(
            poolIds[idx % poolIds.length]!,
            sim.playerX + Math.cos(theta) * ring,
            sim.playerY + Math.sin(theta) * ring,
            { hpScale: 45 },
          );
        }
        const t0 = performance.now();
        const angle = f * 0.08;
        const frame = sim.step(Math.cos(angle), Math.sin(angle), core.FIXED_DT);
        if (frame.phase !== 'playing' && frame.draftModal?.options[0]) {
          sim.dispatch({
            type: 'choose_draft',
            optionId: frame.draftModal.options[0].optionId,
          });
        }
        renderer.render(frame);
        hud.update(frame, true);
        const dtMs = performance.now() - t0;
        frameTimes.push(dtMs);

        minActive = Math.min(minActive, frame.hud.activeEnemyCount);
        maxActive = Math.max(maxActive, frame.hud.activeEnemyCount);

        if (
          !Number.isFinite(frame.player.x) ||
          !Number.isFinite(frame.player.y) ||
          !Number.isFinite(frame.player.hp) ||
          !Number.isFinite(frame.hud.activeEnemyCount)
        ) {
          hasNaN = true;
        }
        for (let e = 0; e < frame.enemies.length; e++) {
          const en = frame.enemies[e]!;
          if (!Number.isFinite(en.x) || !Number.isFinite(en.y)) {
            hasNaN = true;
            break;
          }
        }

        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }

      const avgFrameMs =
        frameTimes.reduce((acc, v) => acc + v, 0) / Math.max(1, frameTimes.length);

      (window as unknown as { __destroyStressRenderer?: () => boolean }).__destroyStressRenderer =
        () => {
          renderer.destroy();
          return renderer.isDestroyed();
        };

      return {
        minActive,
        maxActive,
        hasNaN,
        avgFrameMs,
        canvasWidth: canvasHost.querySelector('canvas')?.width ?? 0,
        canvasHeight: canvasHost.querySelector('canvas')?.height ?? 0,
      };
    });

    expect(stressStats.hasNaN).toBe(false);
    expect(stressStats.minActive).toBeGreaterThanOrEqual(1000);
    expect(stressStats.maxActive).toBeGreaterThanOrEqual(1200);
    expect(stressStats.canvasWidth).toBe(1280);
    expect(stressStats.canvasHeight).toBe(800);
    expect(stressStats.avgFrameMs).toBeLessThan(35);

    await assertNoInvalidText(page, '1,200+ Enemy Stress HUD');
    await shot(page, '14-horde-stress-1000.png');

    const destroyed = await page.evaluate(() =>
      (window as unknown as { __destroyStressRenderer?: () => boolean }).__destroyStressRenderer?.(),
    );
    expect(destroyed).toBe(true);

    audit.assertClean();
  });
});
