import type { PowerUpId } from '../contracts/ids.ts';
import type { PowerUpDef } from '../contracts/types.ts';

export const POWERUPS: Readonly<Record<PowerUpId, PowerUpDef>> = {
  might: {
    id: 'might',
    name: '力量',
    englishName: 'Might',
    description: '每级永久提升 +5% 所有武器造成的基础伤害。',
    maxRank: 5,
    baseCost: 200,
    statDeltaPerRank: { might: 0.05 },
  },

  armor: {
    id: 'armor',
    name: '护甲',
    englishName: 'Armor',
    description: '每级减少 1 点来自敌人的碰撞与弹幕伤害。',
    maxRank: 3,
    baseCost: 600,
    statDeltaPerRank: { armor: 1 },
  },

  max_health: {
    id: 'max_health',
    name: '最大生命',
    englishName: 'Max Health',
    description: '每级永久提高 +20 点基础最大生命值。',
    maxRank: 3,
    baseCost: 200,
    statDeltaPerRank: { maxHp: 20 },
  },

  recovery: {
    id: 'recovery',
    name: '生命恢复',
    englishName: 'Recovery',
    description: '每级每秒额外恢复 0.1 点生命值。',
    maxRank: 5,
    baseCost: 200,
    statDeltaPerRank: { recovery: 0.1 },
  },

  cooldown: {
    id: 'cooldown',
    name: '冷却缩减',
    englishName: 'Cooldown',
    description: '每级缩短 -2.5% 所有武器的攻击间隔。',
    maxRank: 2,
    baseCost: 900,
    statDeltaPerRank: { cooldown: -0.025 },
  },

  area: {
    id: 'area',
    name: '攻击范围',
    englishName: 'Area',
    description: '每级扩大 +5% 武器与爆炸的判定范围。',
    maxRank: 2,
    baseCost: 300,
    statDeltaPerRank: { area: 0.05 },
  },

  speed: {
    id: 'speed',
    name: '弹道速度',
    englishName: 'Speed',
    description: '每级提高 +10% 投射物与法术飞行速度。',
    maxRank: 2,
    baseCost: 300,
    statDeltaPerRank: { speed: 0.1 },
  },

  duration: {
    id: 'duration',
    name: '持续时间',
    englishName: 'Duration',
    description: '每级延长 +15% 武器与领域效果的持续时长。',
    maxRank: 2,
    baseCost: 300,
    statDeltaPerRank: { duration: 0.15 },
  },

  amount: {
    id: 'amount',
    name: '投射物数量',
    englishName: 'Amount',
    description: '所有武器每次发射额外 +1 枚投射物或攻击次数。',
    maxRank: 1,
    baseCost: 5000,
    statDeltaPerRank: { amount: 1 },
  },

  move_speed: {
    id: 'move_speed',
    name: '移动速度',
    englishName: 'MoveSpeed',
    description: '每级提高 +5% 角色移动速度。',
    maxRank: 2,
    baseCost: 300,
    statDeltaPerRank: { moveSpeed: 0.05 },
  },

  magnet: {
    id: 'magnet',
    name: '拾取范围',
    englishName: 'Magnet',
    description: '每级扩大 +25% 经验宝石与战利品的吸引半径。',
    maxRank: 2,
    baseCost: 300,
    statDeltaPerRank: { magnet: 0.25 },
  },

  luck: {
    id: 'luck',
    name: '幸运',
    englishName: 'Luck',
    description: '每级提高 +10% 幸运值，增加暴击与宝箱多连抽几率。',
    maxRank: 3,
    baseCost: 600,
    statDeltaPerRank: { luck: 0.1 },
  },

  growth: {
    id: 'growth',
    name: '成长',
    englishName: 'Growth',
    description: '每级提高 +3% 从经验宝石中获取的经验值。',
    maxRank: 5,
    baseCost: 900,
    statDeltaPerRank: { growth: 0.03 },
  },

  greed: {
    id: 'greed',
    name: '贪婪',
    englishName: 'Greed',
    description: '每级增加 +10% 战局内外获取的金币倍率。',
    maxRank: 5,
    baseCost: 200,
    statDeltaPerRank: { greed: 0.1 },
  },

  curse: {
    id: 'curse',
    name: '诅咒',
    englishName: 'Curse',
    description: '每级提高 +10% 敌人速度、生命值、刷新速度与同屏数量。',
    maxRank: 5,
    baseCost: 1666,
    statDeltaPerRank: { curse: 0.1 },
  },

  revival: {
    id: 'revival',
    name: '复活',
    englishName: 'Revival',
    description: '在致命一击后以 50% 生命值并伴随震退冲击波重新站起（每局 +1 次）。',
    maxRank: 1,
    baseCost: 10000,
    statDeltaPerRank: { revivals: 1 },
  },

  reroll: {
    id: 'reroll',
    name: '重随',
    englishName: 'Reroll',
    description: '每级提供 +1 次升级选牌重随机会。',
    maxRank: 4,
    baseCost: 1000,
    statDeltaPerRank: { rerolls: 1 },
    isUtility: true,
  },

  skip: {
    id: 'skip',
    name: '跳过',
    englishName: 'Skip',
    description: '每级提供 +1 次跳过升级选牌并返还经验值的机会。',
    maxRank: 4,
    baseCost: 500,
    statDeltaPerRank: { skips: 1 },
    isUtility: true,
  },

  banish: {
    id: 'banish',
    name: '放逐',
    englishName: 'Banish',
    description: '每级提供 +1 次将指定装备永久移出当局选牌池的放逐机会。',
    maxRank: 4,
    baseCost: 1000,
    statDeltaPerRank: { banishes: 1 },
    isUtility: true,
  },
};

/**
 * Canonical Vampire Survivors PowerUp cost scaling formula:
 * baseCost * (currentRank + 1) * (1 + 0.1 * totalPurchasedRanks)
 */
export function getPowerUpNextCost(
  id: PowerUpId,
  currentRank: number,
  totalPurchasedRanks = 0,
): number {
  const def = POWERUPS[id];
  if (currentRank >= def.maxRank) {
    return 0;
  }
  const safeRank = Math.max(0, Math.floor(currentRank));
  const safeTotal = Math.max(0, Math.floor(totalPurchasedRanks));
  return Math.floor(def.baseCost * (safeRank + 1) * (1 + 0.1 * safeTotal));
}
