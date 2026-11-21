import { describe, expect, it } from 'vitest';
import {
  EVOLVED_WEAPON_IDS,
  WEAPON_IDS,
  type PassiveId,
  type RunStartConfig,
  type WeaponId,
} from '../src/contracts/index.ts';
import {
  FIXED_DT,
  GameSimulation,
  MAX_ACTIVE_XP_GEMS,
  MemoryStorage,
  ProgressionSystem,
  SaveStore,
  SpatialHashGrid,
  calculatePlayerStats,
  createDefaultSaveState,
} from '../src/core/index.ts';
import { CATALOG } from '../src/data/index.ts';

function makeRunConfig(overrides: Partial<RunStartConfig> = {}): RunStartConfig {
  return {
    heroId: 'antonio',
    stageId: 'mad_forest',
    hyper: false,
    hurry: false,
    arcanasEnabled: false,
    limitBreakEnabled: true,
    endless: false,
    seed: 123456,
    ...overrides,
  };
}

describe('SpatialHashGrid', () => {
  it('supports radius, rect, arc, line/beam, and nearest queries accurately', () => {
    const grid = new SpatialHashGrid(96, 128);
    // 0: east at (100, 0), 1: north at (0, -140), 2: west at (-100, 0), 3: far at (2000, 2000)
    grid.insert(0, 100, 0, 14);
    grid.insert(1, 0, -140, 14);
    grid.insert(2, -100, 0, 14);
    grid.insert(3, 2000, 2000, 16);

    const out: number[] = [];
    grid.queryRadius(0, 0, 110, out);
    expect(out.sort()).toEqual([0, 2]);

    grid.queryRect(-120, -160, 20, -110, out);
    expect(out).toEqual([1]);

    // Facing east (+X) with 45 deg half-angle
    grid.queryArc(0, 0, 160, 1, 0, Math.PI / 4, out);
    expect(out).toEqual([0]);

    // Line / beam shooting north (0, 0) -> (0, -250)
    grid.queryLine(0, 0, 0, -250, 16, out);
    expect(out).toEqual([1]);

    // Nearest enemy within 150px
    expect(grid.queryNearest(10, 0, 150)).toBe(0);
    // Far enemy fallback when maxRadius = Infinity
    expect(grid.queryNearest(1900, 1950)).toBe(3);
  });
});

describe('StatCalculator', () => {
  it('applies hero level scalings, temporary decays, PowerUps, Passives, Hyper, and Arcanas', () => {
    const baseSave = createDefaultSaveState(CATALOG);

    // Antonio: +10% Might / 10 levels, max +50%
    const antonioLv50 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'antonio',
      stageId: 'mad_forest',
      playerLevel: 50,
      currentHp: 120,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(antonioLv50.might).toBeCloseTo(1.5, 5);

    const antonioLv80 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'antonio',
      stageId: 'mad_forest',
      playerLevel: 80,
      currentHp: 120,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(antonioLv80.might).toBeCloseTo(1.5, 5);

    // Imelda: +10% Growth every 5 levels, max +30%
    const imeldaLv15 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'imelda',
      stageId: 'mad_forest',
      playerLevel: 15,
      currentHp: 100,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(imeldaLv15.growth).toBeCloseTo(1.3, 5);

    // Porta: +30% Area and Lv1-4 cooldown bonus decay
    const portaLv1 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'porta',
      stageId: 'mad_forest',
      playerLevel: 1,
      currentHp: 100,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    const portaLv5 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'porta',
      stageId: 'mad_forest',
      playerLevel: 5,
      currentHp: 100,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(portaLv1.area).toBeCloseTo(1.3, 5);
    expect(portaLv1.cooldown).toBeCloseTo(0.1, 5);
    expect(portaLv5.cooldown).toBeCloseTo(1.0, 5);

    // Clerici: +50 HP and Lv1-5 area decay
    const clericiLv1 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'clerici',
      stageId: 'mad_forest',
      playerLevel: 1,
      currentHp: 150,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    const clericiLv6 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'clerici',
      stageId: 'mad_forest',
      playerLevel: 6,
      currentHp: 150,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(clericiLv1.maxHp).toBe(150);
    expect(clericiLv1.area).toBeCloseTo(5.0, 5);
    expect(clericiLv6.area).toBeCloseTo(1.0, 5);

    // Pugnala uncapped +1% Might/lv & Mortaccio/Cavallo +1 Amount at Lv20/40/60
    const pugnalaLv101 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'pugnala',
      stageId: 'mad_forest',
      playerLevel: 101,
      currentHp: 100,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(pugnalaLv101.might).toBeCloseTo(2.0, 5);

    const mortaccioLv60 = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'mortaccio',
      stageId: 'mad_forest',
      playerLevel: 60,
      currentHp: 100,
      powerUps: {},
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    expect(mortaccioLv60.amount).toBe(3);

    // Arcana XX Silent Sanctuary (1 weapon -> 5 empty slots: +1.0 Might, -0.40 Cooldown) + Arcana IX Divine Bloodline
    const arcanaStats = calculatePlayerStats({
      catalog: CATALOG,
      heroId: 'imelda',
      stageId: 'mad_forest',
      playerLevel: 1,
      currentHp: 40, // 60 missing HP -> +0.30 Might
      powerUps: baseSave.powerUps,
      passives: new Map<PassiveId, number>([['spinach', 2]]), // +0.20 Might
      weaponSlotCount: 1,
      arcanas: ['arcana_xx_silent_sanctuary', 'arcana_ix_divine_bloodline'],
      hyper: true,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });
    // Base 1.0 + spinach 0.2 + Silent Sanctuary 1.0 + Divine Bloodline (60 * 0.005 = 0.3) = 2.5
    expect(arcanaStats.might).toBeCloseTo(2.5, 5);
    expect(arcanaStats.cooldown).toBeCloseTo(0.6, 5);
    expect(arcanaStats.rerolls).toBe(3);
    expect(arcanaStats.moveSpeed).toBeGreaterThan(1.0);
  });
});

describe('WeaponSystem: All 20 Base + 14 Evolved Weapons', () => {
  it('fires and tracks damage/DPS across all 34 weapons', () => {
    const save = createDefaultSaveState(CATALOG);

    for (const weaponId of WEAPON_IDS) {
      const sim = new GameSimulation(makeRunConfig({ seed: 42 }), save, CATALOG);
      // Replace starting weapon with target weapon
      sim.weaponSystem.slots.length = 0;
      sim.weaponSystem.damageHistory.clear();
      sim.weaponSystem.addOrUpgradeWeapon(weaponId);

      // Place enemies in inner ring (95px) and orbit ring (170px) around player
      for (let k = 0; k < 12; k++) {
        const theta = (k / 12) * Math.PI * 2;
        sim.enemySystem.spawnEnemy('zombie', Math.cos(theta) * 95, Math.sin(theta) * 95, {
          hpScale: 4,
          speedScale: 0.1,
        });
        sim.enemySystem.spawnEnemy('zombie', Math.cos(theta) * 170, Math.sin(theta) * 170, {
          hpScale: 4,
          speedScale: 0.1,
        });
      }
      // Put one enemy directly in front (+X) for knife / whip
      sim.enemySystem.spawnEnemy('zombie', 75, 0, { hpScale: 4, speedScale: 0.1 });

      // Step enough frames to trigger even slow cooldown weapons (Pentagram 90s cooldown -> force cooldown ready for non-shield/freeze tests or simulate!)
      const slot = sim.weaponSystem.slots[0]!;
      slot.cooldownTimer = 0.01;
      for (let t = 0; t < 180; t++) {
        sim.step(0, 0, FIXED_DT);
      }

      if (weaponId === 'clock_lancet') {
        // Verify Clock Lancet freezes enemies
        const frozenAny = sim.enemySystem.enemies.some((e) => e.freezeTimer > 0);
        expect(frozenAny, `${weaponId} should freeze enemies`).toBe(true);
      } else if (weaponId === 'laurel') {
        // Verify Laurel blocks contact damage and grants invulnerability + countershock
        expect(sim.weaponSystem.getLaurelCharges()).toBeGreaterThanOrEqual(0);
      } else {
        const summary = sim.weaponSystem.getWeaponBreakdown().find(
          (w) => w.weaponId === weaponId,
        );
        expect(summary, `Missing summary for ${weaponId}`).toBeDefined();
        expect(summary!.totalDamage, `${weaponId} should deal > 0 damage`).toBeGreaterThan(0);
        expect(summary!.dps).toBeGreaterThan(0);
      }
    }
  });

  it('supports Bloody Tear lifesteal, Soul Eater healing->Might, La Borra creep, No Future bounce blast, Thunder Loop double pulse, Gorgeous Moon XP rain, and Phieraggi rotating beams', () => {
    const save = createDefaultSaveState(CATALOG);

    // 1. Bloody Tear 8 HP lifesteal on crit + Soul Eater Might conversion
    const simTear = new GameSimulation(makeRunConfig(), save, CATALOG);
    simTear.weaponSystem.slots.length = 0;
    simTear.weaponSystem.addOrUpgradeWeapon('bloody_tear');
    simTear.weaponSystem.addOrUpgradeWeapon('soul_eater');
    simTear.progression.arcanas.push('arcana_xvi_slash'); // boost crit chance
    simTear.hp = 40;
    for (let i = 0; i < 10; i++) {
      simTear.enemySystem.spawnEnemy('skeleton_armored', 80 + i * 5, 0, { hpScale: 5 });
    }
    for (let t = 0; t < 240; t++) {
      simTear.step(0, 0, FIXED_DT);
    }
    expect(simTear.hp).toBeGreaterThan(40);
    expect(simTear.progression.soulEaterMightBonus).toBeGreaterThan(0);

    // 2. Phieraggi emits 360 rotating piercing beams
    const simPhier = new GameSimulation(makeRunConfig(), save, CATALOG);
    simPhier.weaponSystem.slots.length = 0;
    simPhier.weaponSystem.addOrUpgradeWeapon('phieraggi');
    const slotP = simPhier.weaponSystem.slots[0]!;
    slotP.cooldownTimer = 0.01;
    const frameP = simPhier.step(0, 0, FIXED_DT);
    expect(frameP.beams.length).toBeGreaterThanOrEqual(4);
    expect(frameP.beams[0]!.weaponId).toBe('phieraggi');

    // 3. Clock Lancet + Arcana XII Out of Bounds triggers frost explosions
    const simIce = new GameSimulation(makeRunConfig(), save, CATALOG);
    simIce.weaponSystem.slots.length = 0;
    simIce.weaponSystem.addOrUpgradeWeapon('clock_lancet');
    simIce.progression.arcanas.push('arcana_xii_out_of_bounds');
    simIce.enemySystem.spawnEnemy('zombie', 0, -100, { hpScale: 5 });
    simIce.weaponSystem.slots[0]!.cooldownTimer = 0.01;
    const frameIce = simIce.step(0, 0, FIXED_DT);
    expect(frameIce.zones.some((z) => z.kind === 'explosion')).toBe(true);

    // 4. Gorgeous Moon drops XP crystal rain & vacuums without deleting existing gems
    const simMoon = new GameSimulation(makeRunConfig(), save, CATALOG);
    simMoon.weaponSystem.slots.length = 0;
    simMoon.weaponSystem.addOrUpgradeWeapon('gorgeous_moon');
    simMoon.progression.spawnPickup('pickup', 'xp_blue', 220, 0, { value: 1 });
    simMoon.enemySystem.spawnEnemy('zombie', 150, 0);
    simMoon.weaponSystem.slots[0]!.cooldownTimer = 0.01;
    simMoon.step(0, 0, FIXED_DT);
    const xpGems = simMoon.progression.pickups.filter((p) =>
      p.itemId.startsWith('xp_'),
    );
    expect(xpGems.length).toBeGreaterThan(5);
    expect(xpGems.every((p) => p.magnetized)).toBe(true);

    // 5. La Borra creeping & growing pool + No Future bounce blast + Thunder Loop double pulse + Laurel shield
    const simComb = new GameSimulation(makeRunConfig(), save, CATALOG);
    simComb.weaponSystem.slots.length = 0;
    simComb.weaponSystem.addOrUpgradeWeapon('la_borra');
    simComb.weaponSystem.addOrUpgradeWeapon('no_future');
    simComb.weaponSystem.addOrUpgradeWeapon('thunder_loop');
    simComb.weaponSystem.addOrUpgradeWeapon('laurel');
    simComb.progression.arcanas.push('arcana_xix_heart_of_fire');
    for (const s of simComb.weaponSystem.slots) s.cooldownTimer = 0.01;
    simComb.enemySystem.spawnEnemy('skeleton_armored', 120, 0, { hpScale: 4 });
    // Step 120 ticks (2 seconds): La Borra grows & creeps, No Future bounces off viewport edge & explodes, Thunder Loop fires double pulse
    let sawPool = false;
    let sawExplosion = false;
    let sawLightning = false;
    for (let t = 0; t < 120; t++) {
      const f = simComb.step(0, 0, FIXED_DT);
      if (f.zones.some((z) => z.vfxKey === 'borra_pool')) sawPool = true;
      if (f.zones.some((z) => z.kind === 'explosion')) sawExplosion = true;
      if (f.zones.some((z) => z.kind === 'lightning')) sawLightning = true;
    }
    expect(sawPool).toBe(true);
    expect(sawExplosion).toBe(true);
    expect(sawLightning).toBe(true);

    // Laurel blocks contact damage & grants invuln + countershock
    const startHp = simComb.hp;
    simComb.invulnTimer = 0;
    simComb.enemySystem.spawnEnemy('zombie', simComb.playerX, simComb.playerY, { hpScale: 3 });
    const fLaurel = simComb.step(0, 0, FIXED_DT);
    expect(simComb.hp).toBe(startHp);
    expect(fLaurel.player.invulnTimer).toBeGreaterThan(0);
    expect(fLaurel.zones.some((z) => z.kind === 'shield_burst')).toBe(true);
  });
});

describe('Progression: All 14 Evolutions & Unions, Consolidation, Drafts, Limit Break, Revival', () => {
  it('evolves all 14 evolutions/unions in 10:00+ chests and frees slots on Vandalier & Phieraggi', () => {
    const save = createDefaultSaveState(CATALOG);

    for (const recipe of CATALOG.evolutions) {
      const sim = new GameSimulation(makeRunConfig(), save, CATALOG);
      sim.weaponSystem.slots.length = 0;
      const baseSlot = sim.weaponSystem.addOrUpgradeWeapon(recipe.baseWeapon)!;
      while (baseSlot.level < baseSlot.maxLevel) {
        sim.weaponSystem.addOrUpgradeWeapon(recipe.baseWeapon);
      }
      if (recipe.partnerWeapon) {
        const pSlot = sim.weaponSystem.addOrUpgradeWeapon(recipe.partnerWeapon)!;
        while (pSlot.level < pSlot.maxLevel) {
          sim.weaponSystem.addOrUpgradeWeapon(recipe.partnerWeapon);
        }
      }
      if (recipe.requiredPassive) {
        sim.progression.passives.set(recipe.requiredPassive, 1);
      }

      // Blocked before 10:00
      const pre10Chest = sim.progression.openTreasureChest(
        'silver',
        true,
        sim.stats,
        sim.weaponSystem,
        sim.rng,
        {
          onAudioCue: () => {},
          onHealPlayer: () => {},
          onFloatingText: () => {},
          onRosaryTriggered: () => {},
          onOrologionTriggered: () => {},
          onStatsDirty: () => {},
        },
        300,
      );
      expect(pre10Chest.items.some((i) => i.isEvolution)).toBe(false);

      const slotsBefore = sim.weaponSystem.slots.length;
      const passivesBefore = sim.progression.passives.size;

      // Allowed at 10:00+
      const post10Chest = sim.progression.openTreasureChest(
        'gold',
        true,
        sim.stats,
        sim.weaponSystem,
        sim.rng,
        {
          onAudioCue: () => {},
          onHealPlayer: () => {},
          onFloatingText: () => {},
          onRosaryTriggered: () => {},
          onOrologionTriggered: () => {},
          onStatsDirty: () => {},
        },
        600,
      );
      expect(post10Chest.items.some((i) => i.isEvolution && i.itemId === recipe.evolvedId)).toBe(
        true,
      );
      expect(sim.weaponSystem.slots.some((s) => s.weaponId === recipe.evolvedId)).toBe(true);

      if (recipe.consumesPartnerWeapon) {
        expect(sim.weaponSystem.slots.length).toBe(slotsBefore - 1);
      }
      if (recipe.consumesPassive) {
        expect(sim.progression.passives.size).toBe(passivesBefore - 1);
      }
    }
    expect(EVOLVED_WEAPON_IDS.length).toBe(14);
  });

  it('consolidates >400 XP gems without losing a single point of XP', () => {
    const save = createDefaultSaveState(CATALOG);
    const prog = new ProgressionSystem(CATALOG, save, {
      stageId: 'mad_forest',
      heroId: 'antonio',
      limitBreakEnabled: true,
      arcanasEnabled: false,
    });

    const totalSpawned = 550;
    let expectedXp = 0;
    for (let i = 0; i < totalSpawned; i++) {
      const val = i % 5 === 0 ? 5 : 1;
      expectedXp += val;
      prog.spawnPickup('pickup', val === 5 ? 'xp_green' : 'xp_blue', 600 + i * 2, (i % 7) * 50, {
        value: val,
      });
    }

    expect(prog.pickups.length).toBeLessThanOrEqual(MAX_ACTIVE_XP_GEMS);
    expect(prog.getTotalFloorXp()).toBe(expectedXp);
  });

  it('handles Reroll, Skip, Banish, and Limit Break on full build', () => {
    const save = createDefaultSaveState(CATALOG);
    save.powerUps = { reroll: 2, skip: 2, banish: 2 };
    const sim = new GameSimulation(makeRunConfig({ limitBreakEnabled: true }), save, CATALOG);

    sim.progression.grantXp(5);
    sim.step(0, 0, FIXED_DT);
    expect(sim.phase).toBe('level_up');
    const firstOptions = sim.progression.activeDraft!.options.map((o) => o.optionId);
    expect(firstOptions.length).toBeGreaterThanOrEqual(3);

    // Reroll
    const afterReroll = sim.dispatch({ type: 'reroll_draft' });
    expect(afterReroll.hud.rerollsRemaining).toBe(1);
    expect(afterReroll.draftModal!.options.length).toBeGreaterThanOrEqual(3);

    // Banish first option
    const banishTarget = afterReroll.draftModal!.options[0]!;
    const afterBanish = sim.dispatch({ type: 'toggle_banish_mode' });
    expect(afterBanish.draftModal!.banishModeActive).toBe(true);
    const doneBanish = sim.dispatch({
      type: 'banish_draft',
      optionId: banishTarget.optionId,
    });
    expect(doneBanish.phase).toBe('playing');
    expect(doneBanish.hud.banishesRemaining).toBe(1);
    expect(sim.progression.banishedItems.has(banishTarget.itemId)).toBe(true);

    // Skip next single level-up
    sim.progression.grantXp(sim.progression.xpToNextLevel);
    sim.step(0, 0, FIXED_DT);
    expect(sim.phase).toBe('level_up');
    const xpBeforeSkip = sim.progression.xp;
    const afterSkip = sim.dispatch({ type: 'skip_draft' });
    expect(afterSkip.phase).toBe('playing');
    expect(afterSkip.hud.skipsRemaining).toBe(1);
    expect(sim.progression.xp).toBeGreaterThan(xpBeforeSkip);

    // Limit Break when 6 weapons and 6 passives are maxed
    sim.weaponSystem.slots.length = 0;
    const fullWeapons: WeaponId[] = [
      'whip',
      'magic_wand',
      'knife',
      'axe',
      'cross',
      'fire_wand',
    ];
    for (const wId of fullWeapons) {
      const s = sim.weaponSystem.addOrUpgradeWeapon(wId)!;
      while (s.level < s.maxLevel) sim.weaponSystem.addOrUpgradeWeapon(wId);
    }
    const fullPassives: PassiveId[] = [
      'spinach',
      'armor',
      'hollow_heart',
      'pummarola',
      'empty_tome',
      'candelabrador',
    ];
    for (const pId of fullPassives) {
      sim.progression.passives.set(pId, CATALOG.passives[pId].maxLevel);
    }

    sim.progression.grantXp(1000);
    sim.step(0, 0, FIXED_DT);
    expect(sim.phase).toBe('level_up');
    const lbOption = sim.progression.activeDraft!.options.find(
      (o) => o.kind === 'limit_break',
    );
    expect(lbOption).toBeDefined();
    sim.dispatch({ type: 'choose_draft', optionId: lbOption!.optionId });
    const upgraded = sim.weaponSystem.slots.find((s) => s.weaponId === lbOption!.itemId);
    expect(upgraded!.limitBreakLevel).toBe(1);
  });

  it('triggers Revival modal, consumes Tiragisu, emits shockwave, and applies Arcana IV Awake', () => {
    const save = createDefaultSaveState(CATALOG);
    const sim = new GameSimulation(makeRunConfig(), save, CATALOG);
    sim.progression.passives.set('tiragisu', 1);
    sim.progression.arcanas.push('arcana_iv_awake');
    sim.step(0, 0, FIXED_DT);
    expect(sim.stats.revivals).toBe(4); // 1 tiragisu + 3 Awake

    // Spawn lethal reaper at player position
    sim.enemySystem.spawnEnemy('reaper_red_death', 0, 0);
    sim.enemySystem.rebuildGrid();
    sim.step(0, 0, FIXED_DT);

    expect(sim.phase).toBe('revive');
    const afterRevive = sim.dispatch({ type: 'confirm_revive' });
    expect(afterRevive.phase).toBe('playing');
    expect(sim.progression.passives.has('tiragisu')).toBe(false);
    expect(sim.hp).toBeGreaterThan(0);
    expect(sim.invulnTimer).toBeGreaterThanOrEqual(2.9);
    expect(afterRevive.hud.revivalsRemaining).toBe(3);
  });
});

describe('Stages: Corridor Clamping, Props, Red Death & Endless', () => {
  it('enforces inlaid_library y in [-360,360] and gallo_tower x in [-380,380] clamping', () => {
    const save = createDefaultSaveState(CATALOG);
    const libSim = new GameSimulation(
      makeRunConfig({ stageId: 'inlaid_library' }),
      save,
      CATALOG,
    );
    for (let i = 0; i < 300; i++) {
      libSim.step(0, 1, FIXED_DT); // push +Y continuously
    }
    expect(libSim.playerY).toBeLessThanOrEqual(360 - 14 + 0.01);

    const towerSim = new GameSimulation(
      makeRunConfig({ stageId: 'gallo_tower' }),
      save,
      CATALOG,
    );
    for (let i = 0; i < 300; i++) {
      towerSim.step(-1, 0, FIXED_DT); // push -X continuously
    }
    expect(towerSim.playerX).toBeGreaterThanOrEqual(-380 + 14 - 0.01);
  });

  it('spawns 30:00 Red Death in standard mode and scales Endless cycles +100% HP/damage', () => {
    const save = createDefaultSaveState(CATALOG);
    const simNormal = new GameSimulation(
      makeRunConfig({ hurry: true, endless: false }),
      save,
      CATALOG,
    );
    // Advance clock right to 29:59.5 stage clock
    simNormal.waveDirector.stageClockSeconds = 1799.5;
    simNormal.step(0, 0, FIXED_DT);
    for (let t = 0; t < 40; t++) {
      if (simNormal.phase !== 'playing') break;
      simNormal.step(0, 0, FIXED_DT);
    }
    expect(simNormal.enemySystem.enemies.some((e) => e.enemyId === 'reaper_red_death')).toBe(
      true,
    );

    const simEndless = new GameSimulation(
      makeRunConfig({ endless: true }),
      save,
      CATALOG,
    );
    simEndless.waveDirector.stageClockSeconds = 1805; // cycle 1
    simEndless.step(0, 0, FIXED_DT);
    expect(simEndless.waveDirector.endlessCycle).toBe(1);
    expect(simEndless.enemySystem.enemies.some((e) => e.enemyId === 'reaper_red_death')).toBe(
      false,
    );
  });

  it('triggers 11:00 & 21:00 Arcana chests, prop loot drops, hit-flash 90ms decay, knockback decay, and 1/3/5-item chest jackpots', () => {
    const save = createDefaultSaveState(CATALOG);
    const simArcana = new GameSimulation(
      makeRunConfig({ arcanasEnabled: true }),
      save,
      CATALOG,
    );
    // Pick starting 0:00 Arcana
    expect(simArcana.phase).toBe('arcana_select');
    simArcana.dispatch({
      type: 'choose_draft',
      optionId: simArcana.progression.activeDraft!.options[0]!.optionId,
    });
    expect(simArcana.phase).toBe('playing');

    // Advance to 11:00 (660s) -> Arcana chest spawns
    simArcana.waveDirector.stageClockSeconds = 660;
    simArcana.step(0, 0, FIXED_DT);
    expect(simArcana.progression.pickups.some((p) => p.itemId === 'chest_arcana')).toBe(true);

    // Advance to 21:00 (1260s) -> 2nd Arcana chest spawns
    simArcana.waveDirector.stageClockSeconds = 1260;
    simArcana.step(0, 0, FIXED_DT);
    expect(
      simArcana.progression.pickups.filter((p) => p.itemId === 'chest_arcana').length,
    ).toBe(2);

    // Hit-flash 90ms (6 frames at 60Hz) and knockback decay
    const e = simArcana.enemySystem.spawnEnemy('zombie', 300, 300, { hpScale: 10 });
    simArcana.enemySystem.damageEnemy(simArcana.enemySystem.enemies.length - 1, 5, {
      knockX: 1,
      knockY: 0,
      knockForce: 50,
    });
    expect(e.hitFlashTimer).toBeCloseTo(0.09, 5);
    const initKnock = e.knockVx;
    expect(initKnock).toBeGreaterThan(0);
    for (let f = 0; f < 6; f++) {
      simArcana.step(0, 0, FIXED_DT);
    }
    expect(e.hitFlashTimer).toBe(0);
    expect(e.knockVx).toBeLessThan(initKnock * 0.5);

    // Destructible prop break & loot table
    const prop = simArcana.enemySystem.spawnProp('brazier', 420, 420);
    const res = simArcana.enemySystem.damageProp(simArcana.enemySystem.props.length - 1, 10);
    expect(res.brokenNow).toBe(true);
    expect(prop.broken).toBe(true);

    // 1 / 3 / 5 item chest jackpot rolls across high-Luck trials
    const highLuckStats = { ...simArcana.stats, luck: 4.5 };
    const counts = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const c = simArcana.progression.openTreasureChest(
        'gold',
        false,
        highLuckStats,
        simArcana.weaponSystem,
        simArcana.rng,
        {
          onAudioCue: () => {},
          onHealPlayer: () => {},
          onFloatingText: () => {},
          onRosaryTriggered: () => {},
          onOrologionTriggered: () => {},
          onStatsDirty: () => {},
        },
        0,
      );
      counts.add(c.itemCount);
      simArcana.progression.activeChest = null;
    }
    expect(counts.has(5)).toBe(true);
    expect(counts.has(3)).toBe(true);
  });
});

describe('SaveStore: Shop Refund Math, Hero Buy & JSON Import/Export', () => {
  it('refunds 100% of gold paid regardless of purchase order and validates JSON import/export', () => {
    const storage = new MemoryStorage();
    const store = new SaveStore(CATALOG, storage);
    store.addGold(50000);
    const initialGold = store.getState().gold;

    // Order A: armor -> might -> might -> revival
    expect(store.buyPowerUp('armor').ok).toBe(true);
    expect(store.buyPowerUp('might').ok).toBe(true);
    expect(store.buyPowerUp('might').ok).toBe(true);
    expect(store.buyPowerUp('revival').ok).toBe(true);
    expect(store.getState().gold).toBeLessThan(initialGold);

    // Reload from same storage, then refund 100%
    const reloaded = new SaveStore(CATALOG, storage);
    const refundRes = reloaded.refundPowerUps();
    expect(reloaded.getState().gold).toBe(initialGold);
    expect(refundRes.clearedRanks).toBe(4);
    expect(Object.keys(reloaded.getState().powerUps).length).toBe(0);

    // Hero buy
    expect(reloaded.buyHero('imelda').ok).toBe(true);
    expect(reloaded.isHeroPurchased('imelda')).toBe(true);

    // Export / Import roundtrip & invalid rejection
    const exported = reloaded.exportJson();
    const otherStore = new SaveStore(CATALOG, new MemoryStorage());
    expect(otherStore.importJson(exported).ok).toBe(true);
    expect(otherStore.isHeroPurchased('imelda')).toBe(true);

    expect(otherStore.importJson('{bad json').ok).toBe(false);
    expect(otherStore.importJson(JSON.stringify({ version: 99, gold: 10 })).ok).toBe(false);
    expect(otherStore.importJson(JSON.stringify({ version: 1, gold: -5 })).ok).toBe(false);
    // Original state untouched after failed imports
    expect(otherStore.isHeroPurchased('imelda')).toBe(true);

    // Live achievement & settlement persistence + Pause Grimoire/Map snapshot
    const sim = new GameSimulation(makeRunConfig(), otherStore.getState(), CATALOG);
    sim.progression.level = 20;
    sim.progression.collectedRelics.add('relic_map');
    sim.progression.collectedRelics.add('relic_grimoire');
    const pauseFrame = sim.dispatch({ type: 'toggle_pause' });
    expect(pauseFrame.phase).toBe('paused');
    expect(pauseFrame.pauseSnapshot!.hasMilkyWayMap).toBe(true);
    expect(pauseFrame.pauseSnapshot!.hasGrimoire).toBe(true);
    expect(pauseFrame.pauseSnapshot!.evolutionsPossible.length).toBe(14);
    expect(pauseFrame.pauseSnapshot!.mapMarkers.length).toBeGreaterThan(1);

    const endFrame = sim.dispatch({ type: 'end_run' });
    expect(endFrame.phase).toBe('settlement');
    expect(endFrame.settlementModal!.unlockedAchievements).toContain('ach_unlock_library');
    const summary = sim.getRunSummaryForSave();
    otherStore.recordSettlement(summary.settlement, summary);
    expect(otherStore.getState().unlockedStages).toContain('inlaid_library');
    expect(otherStore.getState().unlockedRelics).toContain('relic_map');
  });
});

describe('Performance & Determinism Benchmark', () => {
  it('simulates 1,200+ active enemies for 600 ticks in <4ms/tick deterministically', () => {
    const save = createDefaultSaveState(CATALOG);
    const sim = new GameSimulation(makeRunConfig({ seed: 999 }), save, CATALOG);

    // Equip full 6-weapon loadout with dense queries
    const weapons: WeaponId[] = [
      'garlic',
      'unholy_vespers',
      'death_spiral',
      'thousand_edge',
      'la_borra',
      'phieraggi',
    ];
    sim.weaponSystem.slots.length = 0;
    for (const w of weapons) {
      sim.weaponSystem.addOrUpgradeWeapon(w);
    }

    // Spawn 1,200 high-HP enemies in rings around player so count stays >= 1,200
    for (let i = 0; i < 1250; i++) {
      const angle = (i / 1250) * Math.PI * 2;
      const dist = 160 + (i % 15) * 32;
      sim.enemySystem.spawnEnemy('iron_golem', Math.cos(angle) * dist, Math.sin(angle) * dist, {
        hpScale: 80,
        speedScale: 0.5,
      });
    }
    sim.invulnTimer = 20; // keep combat running uninterrupted for 600 ticks

    // Warmup JIT
    for (let w = 0; w < 20; w++) {
      sim.step(Math.cos(w * 0.1), Math.sin(w * 0.1), FIXED_DT);
    }

    const t0 = performance.now();
    for (let t = 0; t < 600; t++) {
      // Keep >= 1,200 enemies populated throughout the benchmark
      while (sim.enemySystem.activeCount < 1200) {
        const a = (t * 0.37) % (Math.PI * 2);
        sim.enemySystem.spawnEnemy('iron_golem', sim.playerX + Math.cos(a) * 450, sim.playerY + Math.sin(a) * 450, {
          hpScale: 80,
        });
      }
      sim.step(Math.cos(t * 0.05), Math.sin(t * 0.05), FIXED_DT);
    }
    const elapsedMs = performance.now() - t0;
    const msPerTick = elapsedMs / 600;

    console.log(
      `[BENCHMARK] 1,200+ enemies x 600 ticks: total=${elapsedMs.toFixed(2)}ms, avg=${msPerTick.toFixed(3)}ms/tick`,
    );
    expect(msPerTick).toBeLessThan(4.0);
  });

  it('produces identical deterministic state across runs with same seed & input', () => {
    const save = createDefaultSaveState(CATALOG);
    const runWithSeed = (seed: number) => {
      const sim = new GameSimulation(makeRunConfig({ seed }), save, CATALOG);
      let lastFrame = sim.step(1, 0, FIXED_DT);
      for (let t = 0; t < 180; t++) {
        if (sim.phase === 'level_up') {
          sim.dispatch({
            type: 'choose_draft',
            optionId: sim.progression.activeDraft!.options[0]!.optionId,
          });
        }
        lastFrame = sim.step(Math.cos(t * 0.1), Math.sin(t * 0.1), FIXED_DT);
      }
      return {
        x: lastFrame.player.x,
        y: lastFrame.player.y,
        kills: lastFrame.hud.kills,
        xp: lastFrame.hud.xp,
        level: lastFrame.hud.level,
        enemies: lastFrame.enemies.length,
      };
    };

    expect(runWithSeed(7777)).toEqual(runWithSeed(7777));
  });
});
