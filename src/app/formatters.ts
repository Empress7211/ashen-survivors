import type {
  AchievementUnlockReward,
  Catalog,
  CatalogIconId,
  DraftOption,
  PassiveId,
  PassiveSlotSnapshot,
  StageId,
  StatBlock,
  WeaponId,
  WeaponSlotSnapshot,
} from '../contracts/index.ts';

export function iconUrl(id: CatalogIconId | string): string {
  return `/assets/icons/${id}.png`;
}

export function stageBgUrl(stageId: StageId): string {
  return `/assets/stages/${stageId}.jpg`;
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatInt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export interface StatDisplayItem {
  key: keyof StatBlock;
  label: string;
  valueText: string;
}

function pctFromMultiplier(mult: number): string {
  const pct = Math.round(mult * 100);
  return `${pct}%`;
}

function signedPctFromDelta(delta: number): string {
  const pct = Math.round(delta * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}

export function formatStatDisplayList(stats: StatBlock): StatDisplayItem[] {
  return [
    { key: 'maxHp', label: '最大生命', valueText: `${Math.round(stats.maxHp)}` },
    { key: 'recovery', label: '生命恢复', valueText: `${stats.recovery.toFixed(1)}/秒` },
    { key: 'armor', label: '护甲', valueText: `${Math.round(stats.armor)}` },
    { key: 'moveSpeed', label: '移动速度', valueText: pctFromMultiplier(stats.moveSpeed) },
    { key: 'might', label: '力量倍率', valueText: pctFromMultiplier(stats.might) },
    { key: 'area', label: '攻击范围', valueText: pctFromMultiplier(stats.area) },
    { key: 'speed', label: '弹道速度', valueText: pctFromMultiplier(stats.speed) },
    { key: 'duration', label: '持续时间', valueText: pctFromMultiplier(stats.duration) },
    { key: 'amount', label: '额外投射', valueText: `+${Math.round(stats.amount)}` },
    { key: 'cooldown', label: '冷却间隔', valueText: pctFromMultiplier(stats.cooldown) },
    { key: 'luck', label: '幸运', valueText: pctFromMultiplier(stats.luck) },
    { key: 'growth', label: '经验成长', valueText: pctFromMultiplier(stats.growth) },
    { key: 'greed', label: '金币贪婪', valueText: pctFromMultiplier(stats.greed) },
    { key: 'curse', label: '诅咒强度', valueText: pctFromMultiplier(stats.curse) },
    { key: 'magnet', label: '拾取磁力', valueText: pctFromMultiplier(stats.magnet) },
    { key: 'revivals', label: '复活次数', valueText: `${Math.round(stats.revivals)}` },
    { key: 'rerolls', label: '重随次数', valueText: `${Math.round(stats.rerolls)}` },
    { key: 'skips', label: '跳过次数', valueText: `${Math.round(stats.skips)}` },
    { key: 'banishes', label: '放逐次数', valueText: `${Math.round(stats.banishes)}` },
  ];
}

export function formatModifierDelta(mult: number): string {
  return signedPctFromDelta(mult - 1);
}

export interface SynergyBadgeInfo {
  partnerId: WeaponId | PassiveId;
  partnerName: string;
  evolvedId: WeaponId;
  evolvedName: string;
  partnerOwned: boolean;
}

/**
 * Resolves Evolution / Union partner badge information for a draft option.
 */
export function resolveDraftSynergy(
  opt: DraftOption,
  heldWeapons: readonly WeaponSlotSnapshot[],
  heldPassives: readonly PassiveSlotSnapshot[],
  catalog: Catalog,
): SynergyBadgeInfo | null {
  const weaponIds = new Set(heldWeapons.map((w) => w.weaponId));
  const passiveIds = new Set(heldPassives.map((p) => p.passiveId));

  if (opt.kind === 'weapon') {
    const wId = opt.itemId as WeaponId;
    for (const recipe of catalog.evolutions) {
      if (recipe.baseWeapon === wId) {
        const partnerId = recipe.partnerWeapon ?? recipe.requiredPassive;
        if (!partnerId) continue;
        const partnerOwned = recipe.partnerWeapon
          ? weaponIds.has(recipe.partnerWeapon)
          : passiveIds.has(recipe.requiredPassive!);
        const partnerName = recipe.partnerWeapon
          ? catalog.weapons[recipe.partnerWeapon].name
          : catalog.passives[recipe.requiredPassive!].name;
        return {
          partnerId,
          partnerName,
          evolvedId: recipe.evolvedId,
          evolvedName: catalog.weapons[recipe.evolvedId].name,
          partnerOwned,
        };
      }
      if (recipe.partnerWeapon === wId) {
        const partnerOwned = weaponIds.has(recipe.baseWeapon);
        return {
          partnerId: recipe.baseWeapon,
          partnerName: catalog.weapons[recipe.baseWeapon].name,
          evolvedId: recipe.evolvedId,
          evolvedName: catalog.weapons[recipe.evolvedId].name,
          partnerOwned,
        };
      }
    }
  }

  if (opt.kind === 'passive') {
    const pId = opt.itemId as PassiveId;
    // Prefer a recipe whose base weapon the player already holds
    const matching = catalog.evolutions.filter((r) => r.requiredPassive === pId);
    if (matching.length === 0) return null;
    const heldMatch = matching.find((r) => weaponIds.has(r.baseWeapon)) ?? matching[0]!;
    return {
      partnerId: heldMatch.baseWeapon,
      partnerName: catalog.weapons[heldMatch.baseWeapon].name,
      evolvedId: heldMatch.evolvedId,
      evolvedName: catalog.weapons[heldMatch.evolvedId].name,
      partnerOwned: weaponIds.has(heldMatch.baseWeapon),
    };
  }

  return null;
}

export function formatAchievementRewardTags(
  reward: AchievementUnlockReward,
  catalog: Catalog,
): string[] {
  const tags: string[] = [];
  if (reward.gold && reward.gold > 0) tags.push(`+${reward.gold} 金币`);
  if (reward.hero) tags.push(`英雄：${catalog.heroes[reward.hero].name}`);
  if (reward.stage) tags.push(`关卡：${catalog.stages[reward.stage].name}`);
  if (reward.hyperStage) tags.push(`Hyper：${catalog.stages[reward.hyperStage].name}`);
  if (reward.weapon) tags.push(`武器：${catalog.weapons[reward.weapon].name}`);
  if (reward.passive) tags.push(`被动：${catalog.passives[reward.passive].name}`);
  if (reward.arcana) {
    const a = catalog.arcanas[reward.arcana];
    tags.push(`秘法：${a.roman} ${a.name}`);
  }
  if (reward.relic) tags.push(`圣物：${catalog.relics[reward.relic].name}`);
  return tags;
}
