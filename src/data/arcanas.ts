import type { ArcanaId } from '../contracts/ids.ts';
import type { ArcanaDef } from '../contracts/types.ts';

export const ARCANAS: Readonly<Record<ArcanaId, ArcanaDef>> = {
  arcana_iv_awake: {
    id: 'arcana_iv_awake',
    roman: 'IV',
    name: '苏醒',
    englishName: 'Awake',
    description:
      '立即提供 +3 次复活。每次消耗复活重生时，永久获得 +10% 最大生命、+1 护甲以及 +5% 力量/范围/持续/速度。',
    affectedWeapons: [],
    affectedPassives: ['tiragisu'],
    params: {
      bonusRevivals: 3,
      reviveMaxHpPct: 0.1,
      reviveArmor: 1,
      reviveStatPct: 0.05,
    },
    unlockedByDefault: true,
  },

  arcana_vi_sarabande: {
    id: 'arcana_vi_sarabande',
    roman: 'VI',
    name: '治愈萨拉班德',
    englishName: 'Sarabande of Healing',
    description:
      '所有治疗与生命恢复效果翻倍；每次恢复生命时，在周围释放等额治疗量的圣光冲击波伤害敌人。',
    affectedWeapons: ['bloody_tear', 'soul_eater'],
    affectedPassives: ['pummarola'],
    params: {
      healMultiplier: 2.0,
      healDamageMultiplier: 1.0,
      burstRadius: 150,
    },
    unlockedByDefault: true,
  },

  arcana_vii_iron_blue: {
    id: 'arcana_vii_iron_blue',
    roman: 'VII',
    name: '铁蓝意志',
    englishName: 'Iron Blue Will',
    description:
      '列表内的实体弹道武器在命中障碍物或极限次数时可额外反弹最多 3 次，且基础穿透 +2。',
    affectedWeapons: [
      'knife',
      'thousand_edge',
      'axe',
      'death_spiral',
      'phiera',
      'eight_sparrow',
      'bone',
    ],
    affectedPassives: [],
    params: {
      extraBounces: 3,
      extraPierce: 2,
    },
    unlockedByDefault: true,
  },

  arcana_viii_mad_groove: {
    id: 'arcana_viii_mad_groove',
    roman: 'VIII',
    name: '疯狂律动',
    englishName: 'Mad Groove',
    description:
      '每过 2 分钟，将全地图上的常规地面道具、宝箱、烤鸡与未拾取经验晶石直接拉至脚下。',
    affectedWeapons: [],
    affectedPassives: ['attract_orb'],
    params: {
      pullIntervalSeconds: 120,
    },
    unlockedByDefault: false,
  },

  arcana_ix_divine_bloodline: {
    id: 'arcana_ix_divine_bloodline',
    roman: 'IX',
    name: '神圣血脉',
    englishName: 'Divine Bloodline',
    description:
      '护甲值会同步增强列表内近战/守御武器的反击伤害；每损失 1 点生命提高 +0.5% 力量，反击击杀可提升最大生命上限。',
    affectedWeapons: [
      'whip',
      'bloody_tear',
      'cross',
      'heaven_sword',
      'king_bible',
      'unholy_vespers',
      'garlic',
      'soul_eater',
      'santa_water',
      'la_borra',
    ],
    affectedPassives: ['armor', 'hollow_heart'],
    params: {
      armorDamageScale: 1.0,
      missingHpMightPerPoint: 0.005,
      maxHpPerRetaliationKill: 0.5,
    },
    unlockedByDefault: false,
  },

  arcana_xi_waltz_pearls: {
    id: 'arcana_xi_waltz_pearls',
    roman: 'XI',
    name: '珍珠圆舞曲',
    englishName: 'Waltz of Pearls',
    description:
      '列表中魔法、圣光与火焰弹道武器获得最多 3 次视野边缘与目标反弹能力。',
    affectedWeapons: [
      'magic_wand',
      'holy_wand',
      'fire_wand',
      'hellfire',
      'cross',
      'heaven_sword',
    ],
    affectedPassives: [],
    params: {
      extraBounces: 3,
    },
    unlockedByDefault: false,
  },

  arcana_xii_out_of_bounds: {
    id: 'arcana_xii_out_of_bounds',
    roman: 'XII',
    name: '超越界限',
    englishName: 'Out of Bounds',
    description:
      '冻结敌人时将触发范围寒霜爆裂伤害，并提升战场中「时光怀表」的掉落概率。',
    affectedWeapons: ['clock_lancet', 'eight_sparrow'],
    affectedPassives: [],
    params: {
      freezeExplosionDamage: 45,
      freezeExplosionRadius: 120,
      orologionChanceBonus: 0.08,
    },
    unlockedByDefault: false,
  },

  arcana_xvi_slash: {
    id: 'arcana_xvi_slash',
    roman: 'XVI',
    name: '斩击狂潮',
    englishName: 'Slash',
    description:
      '赋予列表中所有锋刃与近战武器暴击能力（+25% 暴击率），并将暴击伤害倍率额外提高 +100%。',
    affectedWeapons: [
      'whip',
      'bloody_tear',
      'knife',
      'thousand_edge',
      'axe',
      'death_spiral',
      'heaven_sword',
    ],
    affectedPassives: ['clover'],
    params: {
      critChanceBonus: 0.25,
      critMultiplierBonus: 1.0,
    },
    unlockedByDefault: false,
  },

  arcana_xvii_lost_painting: {
    id: 'arcana_xvii_lost_painting',
    roman: 'XVII',
    name: '失落画卷',
    englishName: 'Lost & Found Painting',
    description:
      '总持续时间在 -50% 与 +200% 之间按 10 秒周期律动，在波峰期间大幅延长法阵与投射物留存时间。',
    affectedWeapons: [],
    affectedPassives: ['spellbinder'],
    params: {
      minDurationBonus: -0.5,
      maxDurationBonus: 2.0,
      cycleSeconds: 10,
    },
    unlockedByDefault: false,
  },

  arcana_xviii_boogaloo: {
    id: 'arcana_xviii_boogaloo',
    roman: 'XVIII',
    name: '幻象布加洛',
    englishName: 'Boogaloo of Illusions',
    description:
      '基础攻击范围永久 +25%，且额外在 -25% 与 +50% 之间按 10 秒正弦波潮汐膨胀收缩。',
    affectedWeapons: [],
    affectedPassives: ['candelabrador'],
    params: {
      baseAreaBonus: 0.25,
      minAreaWave: -0.25,
      maxAreaWave: 0.5,
      cycleSeconds: 10,
    },
    unlockedByDefault: false,
  },

  arcana_xix_heart_of_fire: {
    id: 'arcana_xix_heart_of_fire',
    roman: 'XIX',
    name: '烈焰之心',
    englishName: 'Heart of Fire',
    description:
      '火焰系武器命中敌人时触发炽热爆炸溅射；角色受到伤害时将向四周喷射烈焰火球反击。',
    affectedWeapons: ['fire_wand', 'hellfire', 'phiera', 'cherry_bomb'],
    affectedPassives: [],
    params: {
      explosionDamage: 32,
      explosionRadius: 90,
      retaliationCount: 6,
    },
    unlockedByDefault: true,
  },

  arcana_xx_silent_sanctuary: {
    id: 'arcana_xx_silent_sanctuary',
    roman: 'XX',
    name: '静谧圣殿',
    englishName: 'Silent Old Sanctuary',
    description:
      '立刻获得 +3 次重随/跳过/放逐。每存在一个空闲武器栏位，额外获得 +20% 力量与 -8% 冷却时间。',
    affectedWeapons: [],
    affectedPassives: ['empty_tome', 'spinach'],
    params: {
      mightPerEmptySlot: 0.2,
      cooldownPerEmptySlot: -0.08,
      bonusRerolls: 3,
      bonusSkips: 3,
      bonusBanishes: 3,
    },
    unlockedByDefault: true,
  },
};
