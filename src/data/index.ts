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
  RELIC_IDS,
  STAGE_IDS,
  WEAPON_IDS,
} from '../contracts/ids.ts';
import type {
  EnemyId,
  PassiveId,
  PickupId,
  RelicId,
  StageId,
  WeaponId,
} from '../contracts/ids.ts';
import type { Catalog } from '../contracts/types.ts';
import { ACHIEVEMENTS } from './achievements.ts';
import { ARCANAS } from './arcanas.ts';
import { ENEMIES } from './enemies.ts';
import { HEROES } from './heroes.ts';
import { PICKUPS, PROPS, RELICS } from './items.ts';
import { PASSIVES } from './passives.ts';
import { POWERUPS, getPowerUpNextCost } from './powerups.ts';
import { STAGES } from './stages.ts';
import { EVOLUTIONS, WEAPONS } from './weapons.ts';

export {
  ACHIEVEMENTS,
  ARCANAS,
  ENEMIES,
  EVOLUTIONS,
  HEROES,
  PASSIVES,
  PICKUPS,
  POWERUPS,
  PROPS,
  RELICS,
  STAGES,
  WEAPONS,
  getPowerUpNextCost,
};

function deepFreeze<T>(obj: T): T {
  if (obj !== null && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const value of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export const CATALOG: Catalog = deepFreeze({
  heroes: HEROES,
  weapons: WEAPONS,
  passives: PASSIVES,
  arcanas: ARCANAS,
  powerUps: POWERUPS,
  enemies: ENEMIES,
  stages: STAGES,
  relics: RELICS,
  pickups: PICKUPS,
  props: PROPS,
  evolutions: EVOLUTIONS,
  achievements: ACHIEVEMENTS,
});

function assertFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid non-finite number at ${path}: ${String(value)}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertFiniteNumbers(value[i], `${path}[${i}]`);
    }
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertFiniteNumbers(v, `${path}.${k}`);
    }
  }
}

function assertExactIdSet(
  record: Record<string, unknown>,
  expectedIds: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(record);
  const actualSet = new Set(actualKeys);
  const expectedSet = new Set(expectedIds);

  for (const id of expectedIds) {
    if (!actualSet.has(id)) {
      throw new Error(`Catalog ${label} missing canonical ID "${id}"`);
    }
  }
  for (const id of actualKeys) {
    if (!expectedSet.has(id)) {
      throw new Error(`Catalog ${label} contains unexpected ID "${id}"`);
    }
  }
}

export function validateCatalog(catalog: Catalog = CATALOG): true {
  assertFiniteNumbers(catalog, 'CATALOG');

  assertExactIdSet(catalog.heroes, HERO_IDS, 'heroes');
  assertExactIdSet(catalog.weapons, WEAPON_IDS, 'weapons');
  assertExactIdSet(catalog.passives, PASSIVE_IDS, 'passives');
  assertExactIdSet(catalog.arcanas, ARCANA_IDS, 'arcanas');
  assertExactIdSet(catalog.powerUps, POWERUP_IDS, 'powerUps');
  assertExactIdSet(catalog.enemies, ENEMY_IDS, 'enemies');
  assertExactIdSet(catalog.stages, STAGE_IDS, 'stages');
  assertExactIdSet(catalog.relics, RELIC_IDS, 'relics');
  assertExactIdSet(catalog.pickups, PICKUP_IDS, 'pickups');
  assertExactIdSet(catalog.props, PROP_IDS, 'props');

  // Heroes validation
  for (const heroId of HERO_IDS) {
    const hero = catalog.heroes[heroId];
    if (!hero.name || !hero.englishName || !hero.title || !hero.lore) {
      throw new Error(`Hero "${heroId}" is missing localized text fields`);
    }
    if (!catalog.weapons[hero.startingWeapon]) {
      throw new Error(`Hero "${heroId}" references unknown startingWeapon "${hero.startingWeapon}"`);
    }
    if (hero.baseStats.maxHp <= 0 || hero.baseStats.moveSpeed <= 0 || hero.baseStats.cooldown <= 0) {
      throw new Error(`Hero "${heroId}" has non-positive core baseStats`);
    }
  }

  // Weapons validation
  const baseWeaponSet = new Set<string>(BASE_WEAPON_IDS);
  const evolvedWeaponSet = new Set<string>(EVOLVED_WEAPON_IDS);

  for (const weaponId of WEAPON_IDS) {
    const weapon = catalog.weapons[weaponId];
    if (!weapon.name || !weapon.englishName || !weapon.description) {
      throw new Error(`Weapon "${weaponId}" is missing localized text fields`);
    }
    if (baseWeaponSet.has(weaponId)) {
      if (weapon.isEvolved) {
        throw new Error(`Base weapon "${weaponId}" must have isEvolved=false`);
      }
      if (weapon.maxLevel !== 8) {
        throw new Error(`Base weapon "${weaponId}" must have maxLevel=8`);
      }
    }
    if (evolvedWeaponSet.has(weaponId)) {
      if (!weapon.isEvolved) {
        throw new Error(`Evolved weapon "${weaponId}" must have isEvolved=true`);
      }
      if (!weapon.evolutionRecipe) {
        throw new Error(`Evolved weapon "${weaponId}" is missing evolutionRecipe`);
      }
    }
    if (weapon.levels.length !== weapon.maxLevel) {
      throw new Error(
        `Weapon "${weaponId}" levels length (${weapon.levels.length}) !== maxLevel (${weapon.maxLevel})`,
      );
    }

    let cumulativeCooldown = weapon.baseStats.cooldown;
    for (let i = 0; i < weapon.levels.length; i++) {
      const delta = weapon.levels[i];
      if (delta.level !== i + 1) {
        throw new Error(`Weapon "${weaponId}" level entry ${i} has level=${delta.level}`);
      }
      if (!delta.description) {
        throw new Error(`Weapon "${weaponId}" Lv${delta.level} is missing description`);
      }
      if (delta.cooldown !== undefined) {
        cumulativeCooldown += delta.cooldown;
      }
      if (cumulativeCooldown <= 0) {
        throw new Error(
          `Weapon "${weaponId}" Lv${delta.level} cooldown became non-positive (${cumulativeCooldown})`,
        );
      }
    }
  }

  // Evolutions validation
  if (catalog.evolutions.length !== EVOLVED_WEAPON_IDS.length) {
    throw new Error(
      `Expected ${EVOLVED_WEAPON_IDS.length} evolution recipes, got ${catalog.evolutions.length}`,
    );
  }
  const seenEvolved = new Set<string>();
  for (const recipe of catalog.evolutions) {
    if (seenEvolved.has(recipe.evolvedId)) {
      throw new Error(`Duplicate evolution recipe for "${recipe.evolvedId}"`);
    }
    seenEvolved.add(recipe.evolvedId);

    const evolvedDef = catalog.weapons[recipe.evolvedId];
    if (!evolvedDef || !evolvedDef.isEvolved) {
      throw new Error(`Evolution recipe targets invalid evolvedId "${recipe.evolvedId}"`);
    }
    const baseDef = catalog.weapons[recipe.baseWeapon];
    if (!baseDef || baseDef.isEvolved) {
      throw new Error(`Evolution "${recipe.evolvedId}" has invalid baseWeapon "${recipe.baseWeapon}"`);
    }
    if (recipe.partnerWeapon) {
      const partnerDef = catalog.weapons[recipe.partnerWeapon];
      if (!partnerDef || partnerDef.isEvolved || recipe.partnerWeapon === recipe.baseWeapon) {
        throw new Error(
          `Evolution "${recipe.evolvedId}" has invalid partnerWeapon "${recipe.partnerWeapon}"`,
        );
      }
    }
    if (recipe.requiredPassive && !catalog.passives[recipe.requiredPassive]) {
      throw new Error(
        `Evolution "${recipe.evolvedId}" references unknown passive "${recipe.requiredPassive}"`,
      );
    }
    if (!recipe.partnerWeapon && !recipe.requiredPassive) {
      throw new Error(`Evolution "${recipe.evolvedId}" requires either partnerWeapon or requiredPassive`);
    }
  }

  // Passives validation
  for (const passiveId of PASSIVE_IDS) {
    const passive = catalog.passives[passiveId];
    if (passive.levelDescriptions.length !== passive.maxLevel) {
      throw new Error(
        `Passive "${passiveId}" levelDescriptions length (${passive.levelDescriptions.length}) !== maxLevel (${passive.maxLevel})`,
      );
    }
    for (const wId of passive.evolvesWeapons) {
      if (!catalog.weapons[wId]) {
        throw new Error(`Passive "${passiveId}" references unknown weapon "${wId}"`);
      }
    }
  }

  // Arcanas validation
  for (const arcanaId of ARCANA_IDS) {
    const arcana = catalog.arcanas[arcanaId];
    for (const wId of arcana.affectedWeapons) {
      if (!catalog.weapons[wId]) {
        throw new Error(`Arcana "${arcanaId}" references unknown weapon "${wId}"`);
      }
    }
    for (const pId of arcana.affectedPassives) {
      if (!catalog.passives[pId]) {
        throw new Error(`Arcana "${arcanaId}" references unknown passive "${pId}"`);
      }
    }
  }

  // PowerUps validation
  for (const powerUpId of POWERUP_IDS) {
    const p = catalog.powerUps[powerUpId];
    if (p.maxRank <= 0 || p.baseCost <= 0) {
      throw new Error(`PowerUp "${powerUpId}" must have positive maxRank and baseCost`);
    }
  }

  // Enemies validation
  const bossSet = new Set<string>(BOSS_ENEMY_IDS);
  for (const enemyId of ENEMY_IDS) {
    const enemy = catalog.enemies[enemyId];
    if (enemy.maxHp <= 0 || enemy.radius <= 0 || enemy.spriteScale <= 0) {
      throw new Error(`Enemy "${enemyId}" has invalid dimensions/HP`);
    }
    if (bossSet.has(enemyId) && !enemy.isBoss) {
      throw new Error(`Boss enemy "${enemyId}" must have isBoss=true`);
    }
    if (enemy.bossChestTier && !catalog.pickups[enemy.bossChestTier]) {
      throw new Error(`Enemy "${enemyId}" references unknown bossChestTier "${enemy.bossChestTier}"`);
    }
  }

  // Stages validation
  for (const stageId of STAGE_IDS) {
    const stage = catalog.stages[stageId];
    if (!catalog.enemies[stage.reaperEnemyId]) {
      throw new Error(`Stage "${stageId}" references unknown reaper "${stage.reaperEnemyId}"`);
    }
    for (const propId of stage.allowedProps) {
      if (!catalog.props[propId]) {
        throw new Error(`Stage "${stageId}" references unknown prop "${propId}"`);
      }
    }
    const coveredMinutes = new Set<number>();
    for (const wave of stage.waves) {
      coveredMinutes.add(wave.minute);
      if (wave.enemies.length === 0) {
        throw new Error(`Stage "${stageId}" minute ${wave.minute} has empty enemies list`);
      }
      if (wave.spawnInterval <= 0 || wave.minimumCount <= 0) {
        throw new Error(`Stage "${stageId}" minute ${wave.minute} has invalid spawn params`);
      }
      for (const eId of wave.enemies) {
        if (!catalog.enemies[eId]) {
          throw new Error(`Stage "${stageId}" wave references unknown enemy "${eId}"`);
        }
      }
    }
    for (let m = 0; m < 30; m++) {
      if (!coveredMinutes.has(m)) {
        throw new Error(`Stage "${stageId}" is missing wave entry for minute ${m}`);
      }
    }
    for (const boss of stage.bossEvents) {
      if (!catalog.enemies[boss.enemyId]) {
        throw new Error(`Stage "${stageId}" bossEvent references unknown enemy "${boss.enemyId}"`);
      }
    }
    for (const swarm of stage.swarmEvents) {
      if (!catalog.enemies[swarm.enemyId]) {
        throw new Error(`Stage "${stageId}" swarmEvent references unknown enemy "${swarm.enemyId}"`);
      }
    }
    const pickupIds = new Set<string>();
    for (const gp of stage.groundPickups) {
      if (pickupIds.has(gp.id)) {
        throw new Error(`Stage "${stageId}" has duplicate groundPickup id "${gp.id}"`);
      }
      pickupIds.add(gp.id);
      if (gp.kind === 'passive' && !catalog.passives[gp.itemId as PassiveId]) {
        throw new Error(`Stage "${stageId}" groundPickup "${gp.id}" unknown passive "${gp.itemId}"`);
      }
      if (gp.kind === 'relic' && !catalog.relics[gp.itemId as RelicId]) {
        throw new Error(`Stage "${stageId}" groundPickup "${gp.id}" unknown relic "${gp.itemId}"`);
      }
      if (gp.kind === 'pickup' && !catalog.pickups[gp.itemId as PickupId]) {
        throw new Error(`Stage "${stageId}" groundPickup "${gp.id}" unknown pickup "${gp.itemId}"`);
      }
      if (gp.requiresRelic && !catalog.relics[gp.requiresRelic]) {
        throw new Error(
          `Stage "${stageId}" groundPickup "${gp.id}" unknown requiresRelic "${gp.requiresRelic}"`,
        );
      }
    }
  }

  // Relics validation
  for (const relicId of RELIC_IDS) {
    const relic = catalog.relics[relicId];
    if (relic.stageId && !catalog.stages[relic.stageId]) {
      throw new Error(`Relic "${relicId}" references unknown stage "${relic.stageId}"`);
    }
  }

  // Achievements validation
  if (catalog.achievements.length < 40) {
    throw new Error(`Expected >= 40 achievements, found ${catalog.achievements.length}`);
  }
  const achIds = new Set<string>();
  for (const ach of catalog.achievements) {
    if (achIds.has(ach.id)) {
      throw new Error(`Duplicate achievement id "${ach.id}"`);
    }
    achIds.add(ach.id);
    if (ach.condition.stageId && !catalog.stages[ach.condition.stageId]) {
      throw new Error(`Achievement "${ach.id}" unknown stageId "${ach.condition.stageId}"`);
    }
    if (ach.condition.heroId && !catalog.heroes[ach.condition.heroId]) {
      throw new Error(`Achievement "${ach.id}" unknown heroId "${ach.condition.heroId}"`);
    }
    if (ach.condition.type === 'evolve_weapon' && ach.condition.targetId) {
      if (!catalog.weapons[ach.condition.targetId as WeaponId]?.isEvolved) {
        throw new Error(`Achievement "${ach.id}" unknown evolved weapon "${ach.condition.targetId}"`);
      }
    }
    if (ach.condition.type === 'max_weapon_level' && ach.condition.targetId) {
      if (!catalog.weapons[ach.condition.targetId as WeaponId]) {
        throw new Error(`Achievement "${ach.id}" unknown weapon "${ach.condition.targetId}"`);
      }
    }
    if (ach.condition.type === 'defeat_boss' && ach.condition.targetId) {
      if (!catalog.enemies[ach.condition.targetId as EnemyId]) {
        throw new Error(`Achievement "${ach.id}" unknown boss "${ach.condition.targetId}"`);
      }
    }
    if (ach.condition.type === 'collect_relic' && ach.condition.targetId) {
      if (!catalog.relics[ach.condition.targetId as RelicId]) {
        throw new Error(`Achievement "${ach.id}" unknown relic "${ach.condition.targetId}"`);
      }
    }
    if (ach.reward.hero && !catalog.heroes[ach.reward.hero]) {
      throw new Error(`Achievement "${ach.id}" reward unknown hero "${ach.reward.hero}"`);
    }
    if (ach.reward.stage && !catalog.stages[ach.reward.stage]) {
      throw new Error(`Achievement "${ach.id}" reward unknown stage "${ach.reward.stage}"`);
    }
    if (ach.reward.hyperStage && !catalog.stages[ach.reward.hyperStage]) {
      throw new Error(`Achievement "${ach.id}" reward unknown hyperStage "${ach.reward.hyperStage}"`);
    }
    if (ach.reward.weapon && !catalog.weapons[ach.reward.weapon]) {
      throw new Error(`Achievement "${ach.id}" reward unknown weapon "${ach.reward.weapon}"`);
    }
    if (ach.reward.passive && !catalog.passives[ach.reward.passive]) {
      throw new Error(`Achievement "${ach.id}" reward unknown passive "${ach.reward.passive}"`);
    }
    if (ach.reward.arcana && !catalog.arcanas[ach.reward.arcana]) {
      throw new Error(`Achievement "${ach.id}" reward unknown arcana "${ach.reward.arcana}"`);
    }
    if (ach.reward.relic && !catalog.relics[ach.reward.relic]) {
      throw new Error(`Achievement "${ach.id}" reward unknown relic "${ach.reward.relic}"`);
    }
  }

  return true;
}

export function isValidStageId(id: string): id is StageId {
  return id in STAGES;
}
