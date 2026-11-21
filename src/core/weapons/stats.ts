import type {
  ArcanaId,
  Catalog,
  StatBlock,
  WeaponBaseStats,
  WeaponId,
} from '../../contracts/index.ts';
import { NO_PLAYER_AMOUNT_WEAPONS, type WeaponSlotState } from './types.ts';

/** Linear slot lookup avoiding closure allocation in tight per-projectile loops. */
export function findWeaponSlot(
  slots: readonly WeaponSlotState[],
  weaponId: WeaponId,
): WeaponSlotState | undefined {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i]!;
    if (s.weaponId === weaponId) return s;
  }
  return undefined;
}

/** Computes a weapon slot's effective base stats after applying level-up deltas. */
export function computeWeaponEffectiveBase(
  catalog: Catalog,
  slot: WeaponSlotState,
): WeaponBaseStats {
  const def = catalog.weapons[slot.weaponId];
  const b: WeaponBaseStats = { ...def.baseStats };
  const limit = Math.min(slot.level, def.levels.length);
  for (let i = 0; i < limit; i++) {
    const d = def.levels[i]!;
    if (d.damage !== undefined) b.damage += d.damage;
    if (d.cooldown !== undefined) b.cooldown += d.cooldown;
    if (d.area !== undefined) b.area += d.area;
    if (d.speed !== undefined) b.projectileSpeed *= 1 + d.speed;
    if (d.duration !== undefined) b.duration += d.duration;
    if (d.amount !== undefined) b.amount += d.amount;
    if (d.pierce !== undefined) b.pierce += d.pierce;
    if (d.hitLimit !== undefined) b.hitLimit += d.hitLimit;
    if (d.knockback !== undefined) b.knockback += d.knockback;
    if (d.critChance !== undefined) b.critChance += d.critChance;
    if (d.critMultiplier !== undefined) b.critMultiplier += d.critMultiplier;
  }
  b.cooldown = Math.max(0.05, b.cooldown);
  return b;
}

export function getEffectiveAmount(
  slot: WeaponSlotState,
  wStats: WeaponBaseStats,
  stats: StatBlock,
): number {
  if (NO_PLAYER_AMOUNT_WEAPONS.has(slot.weaponId)) {
    return Math.max(1, wStats.amount);
  }
  return Math.max(1, wStats.amount + stats.amount + slot.limitBreakAmount);
}

export function getEffectiveDamage(
  catalog: Catalog,
  slot: WeaponSlotState,
  wStats: WeaponBaseStats,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
): { damage: number; divineApplies: boolean } {
  let baseDmg = wStats.damage;
  let divineApplies = false;
  if (arcanaSet.has('arcana_ix_divine_bloodline')) {
    const def = catalog.arcanas.arcana_ix_divine_bloodline;
    if (def.affectedWeapons.includes(slot.weaponId)) {
      divineApplies = true;
      baseDmg += stats.armor * (def.params.armorDamageScale ?? 1.0) * 4;
    }
  }
  let mult = stats.might * (1 + slot.limitBreakMight);
  if (slot.weaponId === 'phieraggi') {
    mult *= 1 + 0.2 * stats.revivals;
  }
  return { damage: baseDmg * mult, divineApplies };
}

export function getEffectiveCrit(
  catalog: Catalog,
  slot: WeaponSlotState,
  wStats: WeaponBaseStats,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
): { critChance: number; critMult: number } {
  let critChance = wStats.critChance;
  let critMult = wStats.critMultiplier;
  if (critChance > 0) {
    critChance *= stats.luck;
  }
  if (arcanaSet.has('arcana_xvi_slash')) {
    const def = catalog.arcanas.arcana_xvi_slash;
    if (def.affectedWeapons.includes(slot.weaponId)) {
      critChance += def.params.critChanceBonus ?? 0.25;
      critMult += def.params.critMultiplierBonus ?? 1.0;
    }
  }
  return {
    critChance: Math.min(1, Math.max(0, critChance)),
    critMult: Math.max(1, critMult),
  };
}
