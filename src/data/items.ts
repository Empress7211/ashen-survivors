import type { PickupId, PropId, RelicId } from '../contracts/ids.ts';
import type { PickupDef, PropDef, RelicDef } from '../contracts/types.ts';

export const RELICS: Readonly<Record<RelicId, RelicDef>> = {
  relic_grimoire: {
    id: 'relic_grimoire',
    name: '魔导书',
    englishName: 'Grim Grimoire',
    description: '揭开武器的终极合成秘密——在暂停界面实时显示超武进化配方与就绪状态。',
    stageId: 'inlaid_library',
  },

  relic_map: {
    id: 'relic_map',
    name: '银河系地图',
    englishName: 'Milky Way Map',
    description: '唤醒时空方位感知，在暂停界面显示关卡小地图及地面隐藏被动与遗物坐标。',
    stageId: 'dairy_plant',
  },

  relic_ars_gouda: {
    id: 'relic_ars_gouda',
    name: '奥秘干酪',
    englishName: 'Ars Gouda',
    description: '记载夜魔异兽的古老秘卷，解锁怪物图鉴并实时记录每一种敌人的讨伐统计。',
    stageId: 'mad_forest',
  },

  relic_randomazzo: {
    id: 'relic_randomazzo',
    name: '随机塔罗牌',
    englishName: 'Randomazzo',
    description: '解锁秘法牌（Arcana）系统与战场 11:00 / 21:00 秘法宝箱的抽取资格。',
    stageId: 'gallo_tower',
  },

  relic_yellow_sign: {
    id: 'relic_yellow_sign',
    name: '黄衣之印',
    englishName: 'Yellow Sign',
    description: '赋予双目洞穿帷幕的灵视，令隐藏圣物显形并解锁更高阶的无尽共鸣之力。',
    stageId: 'cappella_magna',
  },
};

export const PICKUPS: Readonly<Record<PickupId, PickupDef>> = {
  xp_blue: {
    id: 'xp_blue',
    name: '蓝经验石',
    englishName: 'Blue XP Gem',
    description: '微弱但纯净的魔力碎片，提供 1 点基础经验值。',
    xpValue: 1,
  },

  xp_green: {
    id: 'xp_green',
    name: '绿经验石',
    englishName: 'Green XP Gem',
    description: '凝实的魔力结晶，提供 5 点基础经验值。',
    xpValue: 5,
  },

  xp_red: {
    id: 'xp_red',
    name: '红经验石',
    englishName: 'Red XP Gem',
    description: '高纯度猩红晶石，提供 25 点基础经验值。',
    xpValue: 25,
  },

  xp_gold: {
    id: 'xp_gold',
    name: '耀金晶石',
    englishName: 'Gold XP Gem',
    description: '聚合海量溢散灵能而成的璀璨金晶，提供 150 点经验值。',
    xpValue: 150,
  },

  coin: {
    id: 'coin',
    name: '金币',
    englishName: 'Gold Coin',
    description: '在暗夜猎场中寻得的古旧金币，可累计用于强化与招募。',
    goldValue: 1,
  },

  gold_bag: {
    id: 'gold_bag',
    name: '钱袋',
    englishName: 'Coin Bag',
    description: '鼓囊的皮革钱袋，内含 10 枚金币。',
    goldValue: 10,
  },

  rich_gold_bag: {
    id: 'rich_gold_bag',
    name: '丰饶金袋',
    englishName: 'Rich Coin Bag',
    description: '沉甸甸的奢华金袋，拾取后立即获得 100 枚金币。',
    goldValue: 100,
  },

  roast_chicken: {
    id: 'roast_chicken',
    name: '烤鸡',
    englishName: 'Floor Chicken',
    description: '藏在烛台与火盆中的神秘热食，立即恢复 30 点生命值。',
    healValue: 30,
  },

  vacuum_orb: {
    id: 'vacuum_orb',
    name: '吸铁宝球',
    englishName: 'Vacuum',
    description: '引发全屏魔力共鸣，将当前地图上所有经验晶石瞬间吸向自身。',
  },

  rosary: {
    id: 'rosary',
    name: '圣洁念珠',
    englishName: 'Rosary',
    description: '迸发净化白光，瞬间消灭视野范围内所有非首领级普通敌人。',
  },

  orologion: {
    id: 'orologion',
    name: '时光怀表',
    englishName: 'Orologion',
    description: '凝滞战局时间之流，使除死神以外的所有敌人冻结 10 秒。',
    freezeSeconds: 10,
  },

  chest_bronze: {
    id: 'chest_bronze',
    name: '青铜宝箱',
    englishName: 'Bronze Treasure Chest',
    description: '由前期首领守护的青铜宝箱，开启必定升级一件已持装备并附带金币。',
  },

  chest_silver: {
    id: 'chest_silver',
    name: '白银宝箱',
    englishName: 'Silver Treasure Chest',
    description: '在 10 分钟后出现的白银宝箱，可触发超武进化与多连惊喜奖励。',
  },

  chest_gold: {
    id: 'chest_gold',
    name: '黄金宝箱',
    englishName: 'Gold Treasure Chest',
    description: '后期强敌掉落的黄金宝箱，高概率开出 3 连甚至 5 连超武豪华大奖。',
  },

  chest_arcana: {
    id: 'chest_arcana',
    name: '秘法宝箱',
    englishName: 'Arcana Chest',
    description: '蕴含古老塔罗秘法的神秘宝箱，开启后可直接抽取一张秘法牌。',
  },
};

export const PROPS: Readonly<Record<PropId, PropDef>> = {
  brazier: {
    id: 'brazier',
    name: '灰烬火盆',
    englishName: 'Brazier',
    maxHp: 1,
    radius: 18,
  },

  candelabra: {
    id: 'candelabra',
    name: '哥特烛台',
    englishName: 'Candelabra',
    maxHp: 1,
    radius: 18,
  },

  streetlamp: {
    id: 'streetlamp',
    name: '旧铸铁路灯',
    englishName: 'Streetlamp',
    maxHp: 2,
    radius: 20,
  },

  dead_tree: {
    id: 'dead_tree',
    name: '枯萎古树',
    englishName: 'Dead Tree',
    maxHp: 2,
    radius: 24,
  },

  gravestone: {
    id: 'gravestone',
    name: '苔蚀墓碑',
    englishName: 'Gravestone',
    maxHp: 2,
    radius: 20,
  },

  bookshelf: {
    id: 'bookshelf',
    name: '藏书黑柜',
    englishName: 'Bookshelf',
    maxHp: 3,
    radius: 24,
  },

  minecart: {
    id: 'minecart',
    name: '锈蚀矿车',
    englishName: 'Minecart',
    maxHp: 3,
    radius: 24,
  },

  stone_pillar: {
    id: 'stone_pillar',
    name: '黑曜石柱',
    englishName: 'Stone Pillar',
    maxHp: 3,
    radius: 22,
  },

  stained_pedestal: {
    id: 'stained_pedestal',
    name: '祭坛残座',
    englishName: 'Stained Pedestal',
    maxHp: 2,
    radius: 20,
  },
};
