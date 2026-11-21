import type {
  ArcanaId,
  Catalog,
  HeroId,
  PassiveId,
  PowerUpId,
  StageId,
  StatBlock,
  StatDelta,
} from '../contracts/index.ts';

export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;

export interface StatCalculationInput {
  catalog: Catalog;
  heroId: HeroId;
  stageId: StageId;
  playerLevel: number;
  currentHp: number;
  powerUps: Partial<Record<PowerUpId, number>>;
  passives: ReadonlyMap<PassiveId, number>;
  weaponSlotCount: number;
  maxWeaponSlots?: number;
  arcanas: readonly ArcanaId[];
  hyper: boolean;
  elapsedSeconds: number;
  revivalsConsumed: number;
  divineBloodlineBonusMaxHp: number;
  soulEaterMightBonus: number;
  limitBreakStats?: StatDelta;
}

function applyDelta(stats: StatBlock, delta: StatDelta, multiplier = 1): void {
  if (delta.maxHp !== undefined) stats.maxHp += delta.maxHp * multiplier;
  if (delta.recovery !== undefined) stats.recovery += delta.recovery * multiplier;
  if (delta.armor !== undefined) stats.armor += delta.armor * multiplier;
  if (delta.moveSpeed !== undefined) stats.moveSpeed += delta.moveSpeed * multiplier;
  if (delta.might !== undefined) stats.might += delta.might * multiplier;
  if (delta.area !== undefined) stats.area += delta.area * multiplier;
  if (delta.speed !== undefined) stats.speed += delta.speed * multiplier;
  if (delta.duration !== undefined) stats.duration += delta.duration * multiplier;
  if (delta.amount !== undefined) stats.amount += delta.amount * multiplier;
  if (delta.cooldown !== undefined) stats.cooldown += delta.cooldown * multiplier;
  if (delta.luck !== undefined) stats.luck += delta.luck * multiplier;
  if (delta.growth !== undefined) stats.growth += delta.growth * multiplier;
  if (delta.greed !== undefined) stats.greed += delta.greed * multiplier;
  if (delta.curse !== undefined) stats.curse += delta.curse * multiplier;
  if (delta.magnet !== undefined) stats.magnet += delta.magnet * multiplier;
  if (delta.revivals !== undefined) stats.revivals += delta.revivals * multiplier;
  if (delta.rerolls !== undefined) stats.rerolls += delta.rerolls * multiplier;
  if (delta.skips !== undefined) stats.skips += delta.skips * multiplier;
  if (delta.banishes !== undefined) stats.banishes += delta.banishes * multiplier;
}

export function calculatePlayerStats(input: StatCalculationInput): StatBlock {
  const {
    catalog,
    heroId,
    stageId,
    playerLevel,
    currentHp,
    powerUps,
    passives,
    weaponSlotCount,
    maxWeaponSlots = MAX_WEAPON_SLOTS,
    arcanas,
    hyper,
    elapsedSeconds,
    revivalsConsumed,
    divineBloodlineBonusMaxHp,
    soulEaterMightBonus,
    limitBreakStats,
  } = input;

  const hero = catalog.heroes[heroId];
  const stage = catalog.stages[stageId];
  const stats: StatBlock = { ...hero.baseStats };

  // 1. Hero permanent level scalings
  for (const scaling of hero.levelScalings) {
    if (playerLevel >= scaling.startLevel) {
      const rawTriggers =
        1 + Math.floor((playerLevel - scaling.startLevel) / scaling.everyLevels);
      const triggers =
        scaling.maxTriggers !== undefined
          ? Math.min(rawTriggers, scaling.maxTriggers)
          : rawTriggers;
      stats[scaling.stat] += triggers * scaling.delta;
    }
  }

  // 2. Hero temporary level-indexed bonuses (e.g. Porta Lv1-4 cooldown, Clerici Lv1-5 area)
  if (hero.temporaryBonuses) {
    for (const temp of hero.temporaryBonuses) {
      const val = temp.valuesByLevel[playerLevel];
      if (val !== undefined) {
        stats[temp.stat] += val;
      }
    }
  }

  // 3. Shop PowerUps
  for (const [id, rawRank] of Object.entries(powerUps) as [PowerUpId, number | undefined][]) {
    if (!rawRank || rawRank <= 0) continue;
    const def = catalog.powerUps[id];
    const rank = Math.min(def.maxRank, Math.floor(rawRank));
    if (rank > 0) {
      applyDelta(stats, def.statDeltaPerRank, rank);
    }
  }

  // 4. Held Passives
  for (const [id, rawLevel] of passives.entries()) {
    if (rawLevel <= 0) continue;
    const def = catalog.passives[id];
    const level = Math.min(def.maxLevel, Math.floor(rawLevel));
    if (level > 0) {
      applyDelta(stats, def.perLevelDelta, level);
    }
  }

  // 5. Stage & Hyper modifiers
  stats.greed *= stage.baseModifiers.gold;
  stats.growth *= stage.baseModifiers.xp;
  stats.luck += stage.baseModifiers.luck - 1;
  if (hyper) {
    stats.moveSpeed += stage.hyperModifiers.moveSpeedBonus;
    stats.greed *= stage.hyperModifiers.goldMultiplier;
    stats.growth *= stage.hyperModifiers.xpMultiplier;
    stats.luck += stage.hyperModifiers.luckBonus;
  }

  // 6. Soul Eater & Limit Break & Divine Bloodline permanent maxHp accumulation
  stats.might += Math.max(0, soulEaterMightBonus);
  stats.maxHp += Math.max(0, divineBloodlineBonusMaxHp);
  if (limitBreakStats) {
    applyDelta(stats, limitBreakStats, 1);
  }

  // 7. Arcana modifiers
  const arcanaSet = new Set(arcanas);

  if (arcanaSet.has('arcana_iv_awake')) {
    const p = catalog.arcanas.arcana_iv_awake.params;
    stats.revivals += p.bonusRevivals ?? 3;
    if (revivalsConsumed > 0) {
      const hpPct = p.reviveMaxHpPct ?? 0.1;
      const armorGain = p.reviveArmor ?? 1;
      const statPct = p.reviveStatPct ?? 0.05;
      stats.maxHp *= 1 + revivalsConsumed * hpPct;
      stats.armor += revivalsConsumed * armorGain;
      stats.might += revivalsConsumed * statPct;
      stats.area += revivalsConsumed * statPct;
      stats.duration += revivalsConsumed * statPct;
      stats.speed += revivalsConsumed * statPct;
    }
  }

  if (arcanaSet.has('arcana_ix_divine_bloodline')) {
    const p = catalog.arcanas.arcana_ix_divine_bloodline.params;
    const missingHp = Math.max(0, stats.maxHp - currentHp);
    stats.might += missingHp * (p.missingHpMightPerPoint ?? 0.005);
  }

  if (arcanaSet.has('arcana_xvii_lost_painting')) {
    const p = catalog.arcanas.arcana_xvii_lost_painting.params;
    const cycle = Math.max(1, p.cycleSeconds ?? 10);
    const minB = p.minDurationBonus ?? -0.5;
    const maxB = p.maxDurationBonus ?? 2.0;
    const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedSeconds) / cycle);
    stats.duration += minB + (maxB - minB) * wave;
  }

  if (arcanaSet.has('arcana_xviii_boogaloo')) {
    const p = catalog.arcanas.arcana_xviii_boogaloo.params;
    const cycle = Math.max(1, p.cycleSeconds ?? 10);
    const baseB = p.baseAreaBonus ?? 0.25;
    const minW = p.minAreaWave ?? -0.25;
    const maxW = p.maxAreaWave ?? 0.5;
    const wave = 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedSeconds) / cycle);
    stats.area += baseB + minW + (maxW - minW) * wave;
  }

  if (arcanaSet.has('arcana_xx_silent_sanctuary')) {
    const p = catalog.arcanas.arcana_xx_silent_sanctuary.params;
    stats.rerolls += p.bonusRerolls ?? 3;
    stats.skips += p.bonusSkips ?? 3;
    stats.banishes += p.bonusBanishes ?? 3;
    const emptySlots = Math.max(0, maxWeaponSlots - weaponSlotCount);
    stats.might += emptySlots * (p.mightPerEmptySlot ?? 0.2);
    stats.cooldown += emptySlots * (p.cooldownPerEmptySlot ?? -0.08);
  }

  // 8. Clamp safety floors
  stats.maxHp = Math.max(1, Math.round(stats.maxHp));
  stats.recovery = Math.max(0, stats.recovery);
  stats.armor = Math.max(0, stats.armor);
  stats.moveSpeed = Math.max(0.2, stats.moveSpeed);
  stats.might = Math.max(0.1, stats.might);
  stats.area = Math.max(0.2, stats.area);
  stats.speed = Math.max(0.2, stats.speed);
  stats.duration = Math.max(0.2, stats.duration);
  stats.cooldown = Math.max(0.05, stats.cooldown);
  stats.luck = Math.max(0.1, stats.luck);
  stats.growth = Math.max(0.1, stats.growth);
  stats.greed = Math.max(0.1, stats.greed);
  stats.curse = Math.max(0.5, stats.curse);
  stats.magnet = Math.max(0.2, stats.magnet);
  stats.amount = Math.max(0, Math.floor(stats.amount));
  stats.revivals = Math.max(0, Math.floor(stats.revivals));
  stats.rerolls = Math.max(0, Math.floor(stats.rerolls));
  stats.skips = Math.max(0, Math.floor(stats.skips));
  stats.banishes = Math.max(0, Math.floor(stats.banishes));

  return stats;
}
