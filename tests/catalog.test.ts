import { describe, expect, it } from 'vitest';
import {
  ARCANA_IDS,
  BASE_WEAPON_IDS,
  BOSS_ENEMY_IDS,
  ENEMY_IDS,
  EVOLVED_WEAPON_IDS,
  HERO_IDS,
  PASSIVE_IDS,
  PICKUP_IDS,
  POWERUP_IDS,
  PROP_IDS,
  REGULAR_ENEMY_IDS,
  RELIC_IDS,
  STAGE_IDS,
  WEAPON_IDS,
} from '../src/contracts/ids.ts';
import {
  CATALOG,
  getPowerUpNextCost,
  validateCatalog,
} from '../src/data/index.ts';

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

describe('Vampire Survivors Data Catalog', () => {
  it('passes runtime validateCatalog() integrity check', () => {
    expect(validateCatalog(CATALOG)).toBe(true);
    expect(Object.isFrozen(CATALOG)).toBe(true);
  });

  it('contains exact canonical IDs for every domain entity', () => {
    expect(Object.keys(CATALOG.heroes).sort()).toEqual([...HERO_IDS].sort());
    expect(Object.keys(CATALOG.weapons).sort()).toEqual([...WEAPON_IDS].sort());
    expect(Object.keys(CATALOG.passives).sort()).toEqual([...PASSIVE_IDS].sort());
    expect(Object.keys(CATALOG.arcanas).sort()).toEqual([...ARCANA_IDS].sort());
    expect(Object.keys(CATALOG.powerUps).sort()).toEqual([...POWERUP_IDS].sort());
    expect(Object.keys(CATALOG.enemies).sort()).toEqual([...ENEMY_IDS].sort());
    expect(Object.keys(CATALOG.stages).sort()).toEqual([...STAGE_IDS].sort());
    expect(Object.keys(CATALOG.relics).sort()).toEqual([...RELIC_IDS].sort());
    expect(Object.keys(CATALOG.pickups).sort()).toEqual([...PICKUP_IDS].sort());
    expect(Object.keys(CATALOG.props).sort()).toEqual([...PROP_IDS].sort());
  });

  it('verifies all 16 heroes have valid weapons, Chinese localization, and authentic scalings', () => {
    expect(HERO_IDS).toHaveLength(16);
    for (const heroId of HERO_IDS) {
      const hero = CATALOG.heroes[heroId];
      expect(containsChinese(hero.name)).toBe(true);
      expect(containsChinese(hero.title)).toBe(true);
      expect(containsChinese(hero.lore)).toBe(true);
      expect(hero.englishName.length).toBeGreaterThan(2);
      expect(CATALOG.weapons[hero.startingWeapon]).toBeDefined();
      expect(hero.baseStats.maxHp).toBeGreaterThan(0);
      expect(hero.baseStats.moveSpeed).toBeGreaterThan(0);
    }

    expect(CATALOG.heroes.antonio.unlockedByDefault).toBe(true);
    expect(CATALOG.heroes.antonio.cost).toBe(0);
    expect(CATALOG.heroes.red_death.startingWeapon).toBe('death_spiral');
    expect(CATALOG.heroes.porta.temporaryBonuses?.[0].valuesByLevel[1]).toBe(-0.9);
    expect(CATALOG.heroes.clerici.temporaryBonuses?.[0].valuesByLevel[1]).toBe(4.0);
  });

  it('verifies all 20 base weapons (Lv1-Lv8) and 14 evolved/union recipes', () => {
    expect(BASE_WEAPON_IDS).toHaveLength(20);
    expect(EVOLVED_WEAPON_IDS).toHaveLength(14);
    expect(CATALOG.evolutions).toHaveLength(14);

    for (const id of BASE_WEAPON_IDS) {
      const w = CATALOG.weapons[id];
      expect(w.isEvolved).toBe(false);
      expect(w.maxLevel).toBe(8);
      expect(w.levels).toHaveLength(8);
      expect(containsChinese(w.name)).toBe(true);
      for (const lvl of w.levels) {
        expect(containsChinese(lvl.description)).toBe(true);
      }
    }

    for (const id of EVOLVED_WEAPON_IDS) {
      const w = CATALOG.weapons[id];
      expect(w.isEvolved).toBe(true);
      expect(w.evolutionRecipe).toBeDefined();
      expect(containsChinese(w.name)).toBe(true);
    }

    const recipeMap = new Map(CATALOG.evolutions.map((r) => [r.evolvedId, r]));
    expect(recipeMap.get('bloody_tear')).toMatchObject({
      baseWeapon: 'whip',
      requiredPassive: 'hollow_heart',
      consumesPartnerWeapon: false,
      consumesPassive: false,
    });
    expect(recipeMap.get('vandalier')).toMatchObject({
      baseWeapon: 'peachone',
      partnerWeapon: 'ebony_wings',
      consumesPartnerWeapon: true,
      consumesPassive: false,
    });
    expect(recipeMap.get('phieraggi')).toMatchObject({
      baseWeapon: 'phiera',
      partnerWeapon: 'eight_sparrow',
      requiredPassive: 'tiragisu',
      consumesPartnerWeapon: true,
      consumesPassive: true,
    });
  });

  it('verifies all 16 passives, 12 arcanas, and 19 powerups + cost scaling formula', () => {
    expect(PASSIVE_IDS).toHaveLength(16);
    for (const id of PASSIVE_IDS) {
      const p = CATALOG.passives[id];
      expect(containsChinese(p.name)).toBe(true);
      expect(p.levelDescriptions).toHaveLength(p.maxLevel);
      expect(p.rarity).toBeGreaterThan(0);
    }
    expect(CATALOG.passives.tiragisu.maxLevel).toBe(2);
    expect(CATALOG.passives.duplicator.maxLevel).toBe(2);

    expect(ARCANA_IDS).toHaveLength(12);
    for (const id of ARCANA_IDS) {
      const a = CATALOG.arcanas[id];
      expect(a.roman.length).toBeGreaterThan(0);
      expect(containsChinese(a.name)).toBe(true);
      expect(Object.keys(a.params).length).toBeGreaterThan(0);
    }

    expect(POWERUP_IDS).toHaveLength(19);
    expect(getPowerUpNextCost('might', 0, 0)).toBe(200);
    expect(getPowerUpNextCost('might', 1, 1)).toBe(440);
    expect(getPowerUpNextCost('might', 5, 5)).toBe(0);
  });

  it('verifies all 28 enemies (18 regular + 10 bosses/reapers)', () => {
    expect(ENEMY_IDS).toHaveLength(28);
    for (const id of ENEMY_IDS) {
      const e = CATALOG.enemies[id];
      expect(containsChinese(e.name)).toBe(true);
      expect(containsChinese(e.lore)).toBe(true);
      expect(Number.isNaN(e.maxHp)).toBe(false);
      expect(Number.isNaN(e.speed)).toBe(false);
    }
    for (const bossId of BOSS_ENEMY_IDS) {
      expect(CATALOG.enemies[bossId].isBoss).toBe(true);
    }
    expect(CATALOG.enemies.reaper_red_death.isReaper).toBe(true);
    expect(CATALOG.enemies.reaper_stalker.isReaper).toBe(true);
  });

  it('verifies all 5 stages have 00:00-30:00 waves, 5/10/15/20/25 bosses, 30:00 reaper, corridor bounds, and relics', () => {
    expect(STAGE_IDS).toHaveLength(5);
    expect(CATALOG.stages.inlaid_library.corridorBounds).toEqual({ minY: -360, maxY: 360 });
    expect(CATALOG.stages.gallo_tower.corridorBounds).toEqual({ minX: -380, maxX: 380 });
    expect(CATALOG.stages.mad_forest.corridorBounds).toBeUndefined();

    const placedRelics = new Set<string>();
    for (const stageId of STAGE_IDS) {
      const s = CATALOG.stages[stageId];
      expect(s.durationSeconds).toBe(1800);
      expect(s.reaperTimeSeconds).toBe(1800);
      expect(s.reaperEnemyId).toBe('reaper_red_death');
      expect(s.waves).toHaveLength(30);
      expect(s.bossEvents.map((b) => b.timeSeconds)).toEqual([300, 600, 900, 1200, 1500]);
      expect(s.bossEvents[0].canEvolveChest).toBe(false);
      expect(s.bossEvents[1].canEvolveChest).toBe(true);
      expect(s.swarmEvents.length).toBeGreaterThanOrEqual(4);

      for (const gp of s.groundPickups) {
        if (gp.kind === 'relic') {
          placedRelics.add(gp.itemId);
        }
      }
    }

    expect([...placedRelics].sort()).toEqual([...RELIC_IDS].sort());
  });

  it('verifies 40+ achievements cover all locked heroes, stages, hyper stages, evolutions, and relics', () => {
    expect(CATALOG.achievements.length).toBeGreaterThanOrEqual(40);

    const rewardedHeroes = new Set<string>();
    const rewardedStages = new Set<string>();
    const rewardedHyper = new Set<string>();
    const rewardedArcanas = new Set<string>();

    for (const ach of CATALOG.achievements) {
      expect(containsChinese(ach.name)).toBe(true);
      expect(containsChinese(ach.description)).toBe(true);
      if (ach.reward.hero) rewardedHeroes.add(ach.reward.hero);
      if (ach.reward.stage) rewardedStages.add(ach.reward.stage);
      if (ach.reward.hyperStage) rewardedHyper.add(ach.reward.hyperStage);
      if (ach.reward.arcana) rewardedArcanas.add(ach.reward.arcana);
    }

    for (const heroId of HERO_IDS) {
      if (!CATALOG.heroes[heroId].unlockedByDefault) {
        expect(rewardedHeroes.has(heroId)).toBe(true);
      }
    }
    for (const stageId of STAGE_IDS) {
      if (!CATALOG.stages[stageId].unlockedByDefault) {
        expect(rewardedStages.has(stageId)).toBe(true);
      }
      expect(rewardedHyper.has(stageId)).toBe(true);
    }
    for (const arcanaId of ARCANA_IDS) {
      if (!CATALOG.arcanas[arcanaId].unlockedByDefault) {
        expect(rewardedArcanas.has(arcanaId)).toBe(true);
      }
    }
  });

  it('verifies passive-evolution symmetry, stage enemy coverage, and negative validateCatalog checks', () => {
    // Passive -> Evolution symmetry
    for (const recipe of CATALOG.evolutions) {
      if (recipe.requiredPassive) {
        const passive = CATALOG.passives[recipe.requiredPassive];
        expect(passive.evolvesWeapons).toContain(recipe.baseWeapon);
        expect(passive.evolvesWeapons).toContain(recipe.evolvedId);
      }
    }

    // All 18 regular enemies appear in at least one stage wave
    const spawnedRegulars = new Set<string>();
    for (const stageId of STAGE_IDS) {
      for (const wave of CATALOG.stages[stageId].waves) {
        for (const eId of wave.enemies) {
          spawnedRegulars.add(eId);
        }
      }
    }
    for (const regId of REGULAR_ENEMY_IDS) {
      expect(spawnedRegulars.has(regId)).toBe(true);
    }

    // Cumulative weapon cooldown stays strictly positive across all levels
    for (const weaponId of WEAPON_IDS) {
      const weapon = CATALOG.weapons[weaponId];
      let cd = weapon.baseStats.cooldown;
      for (const lvl of weapon.levels) {
        cd += lvl.cooldown ?? 0;
        expect(cd).toBeGreaterThan(0);
      }
    }

    // Negative check: validateCatalog rejects NaN stats
    const broken = {
      ...CATALOG,
      heroes: {
        ...CATALOG.heroes,
        antonio: {
          ...CATALOG.heroes.antonio,
          baseStats: { ...CATALOG.heroes.antonio.baseStats, maxHp: Number.NaN },
        },
      },
    };
    expect(() => validateCatalog(broken)).toThrow(/non-finite/i);
  });
});
