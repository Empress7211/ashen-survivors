import type { StatBlock, WeaponId } from '../../contracts/index.ts';
import type { EnemySystem } from '../EnemySystem.ts';
import type { SeededRng } from '../Rng.ts';
import { spawnPooledZone } from './pools.ts';
import { findWeaponSlot } from './stats.ts';
import type {
  WeaponCombatHooks,
  WeaponRuntimeContext,
  WeaponSlotState,
} from './types.ts';

export function applyDamageToEnemy(
  enemySystem: EnemySystem,
  index: number,
  rawDamage: number,
  slot: WeaponSlotState | undefined,
  knockX: number,
  knockY: number,
  knockForce: number,
  isCrit: boolean,
  lifesteal: number,
  fromRetaliation: boolean,
  hooks: WeaponCombatHooks,
): void {
  const res = enemySystem.damageEnemy(index, rawDamage, {
    knockX,
    knockY,
    knockForce,
  });
  if (res.dealt <= 0 || !res.enemy) return;

  if (slot) {
    slot.totalDamage += res.dealt;
  }

  if (lifesteal > 0) {
    hooks.onHealPlayer(lifesteal, slot?.weaponId);
  }

  hooks.onAudioCue({ type: 'hit', crit: isCrit, weaponId: slot?.weaponId });
  hooks.onFloatingText(
    res.enemy.x,
    res.enemy.y - res.enemy.radius,
    String(res.dealt),
    isCrit ? 'crit' : 'damage',
  );

  if (res.killed) {
    hooks.onEnemyKilled(
      res.enemy.enemyId,
      res.enemy.x,
      res.enemy.y,
      res.enemy.xpValue,
      res.enemy.xpTier,
      res.enemy.isBoss,
      res.enemy.isReaper,
      res.enemy.chestTier,
      res.enemy.canEvolveChest,
      fromRetaliation,
    );
  }
}

export function damagePropsInRadius(
  enemySystem: EnemySystem,
  x: number,
  y: number,
  radius: number,
  damage: number,
  hooks: WeaponCombatHooks,
): void {
  const props = enemySystem.props;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]!;
    if (prop.broken) continue;
    const dx = prop.x - x;
    const dy = prop.y - y;
    const rSum = radius + prop.radius;
    if (dx * dx + dy * dy <= rSum * rSum) {
      const res = enemySystem.damageProp(i, damage);
      if (res.brokenNow) {
        hooks.onPropBroken(prop.x, prop.y);
      }
    }
  }
}

export function damagePropsInRect(
  enemySystem: EnemySystem,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  damage: number,
  hooks: WeaponCombatHooks,
): void {
  const props = enemySystem.props;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i]!;
    if (prop.broken) continue;
    if (
      prop.x + prop.radius >= minX &&
      prop.x - prop.radius <= maxX &&
      prop.y + prop.radius >= minY &&
      prop.y - prop.radius <= maxY
    ) {
      const res = enemySystem.damageProp(i, damage);
      if (res.brokenNow) {
        hooks.onPropBroken(prop.x, prop.y);
      }
    }
  }
}

export function triggerLightningStrike(
  ctx: WeaponRuntimeContext,
  x: number,
  y: number,
  radius: number,
  damage: number,
  knockback: number,
  critChance: number,
  critMult: number,
  slot: WeaponSlotState | undefined,
  vfxKey: string,
  doublePulse: boolean,
  enemySystem: EnemySystem,
  rng: SeededRng,
  hooks: WeaponCombatHooks,
): void {
  const count = enemySystem.grid.queryRadius(x, y, radius, ctx.queryScratch);
  for (let i = 0; i < count; i++) {
    const idx = ctx.queryScratch[i]!;
    const e = enemySystem.enemies[idx];
    if (!e || !e.alive) continue;
    const isCrit = rng.chance(critChance);
    const dmg = isCrit ? damage * critMult : damage;
    applyDamageToEnemy(
      enemySystem,
      idx,
      dmg,
      slot,
      e.x - x,
      e.y - y,
      knockback,
      isCrit,
      0,
      false,
      hooks,
    );
  }
  damagePropsInRadius(enemySystem, x, y, radius, damage, hooks);

  spawnPooledZone(ctx, {
    kind: 'lightning',
    weaponId: slot?.weaponId,
    vfxKey,
    x,
    y,
    radius,
    baseRadius: radius,
    maxRadius: radius,
    damage: doublePulse ? damage : 0,
    knockback,
    tickInterval: 99,
    tickTimer: 99,
    life: 0.24,
    maxLife: 0.24,
    rotation: 0,
    alpha: 0.95,
    creeping: false,
    critChance,
    critMult,
    lifestealOnCrit: 0,
    secondPulsePending: doublePulse,
  });
}

export function triggerSubExplosion(
  ctx: WeaponRuntimeContext,
  x: number,
  y: number,
  radius: number,
  damage: number,
  weaponId: WeaponId,
  enemySystem: EnemySystem,
  hooks: WeaponCombatHooks,
): void {
  const slot = findWeaponSlot(ctx.slots, weaponId);
  const count = enemySystem.grid.queryRadius(x, y, radius, ctx.queryScratch);
  for (let i = 0; i < count; i++) {
    const idx = ctx.queryScratch[i]!;
    const e = enemySystem.enemies[idx];
    if (!e || !e.alive) continue;
    applyDamageToEnemy(
      enemySystem,
      idx,
      damage,
      slot,
      e.x - x,
      e.y - y,
      24,
      false,
      0,
      false,
      hooks,
    );
  }
  damagePropsInRadius(enemySystem, x, y, radius, damage, hooks);
  spawnPooledZone(ctx, {
    kind: 'explosion',
    weaponId,
    vfxKey: 'explosion_ring',
    x,
    y,
    radius,
    baseRadius: radius,
    maxRadius: radius,
    damage: 0,
    knockback: 0,
    tickInterval: 99,
    tickTimer: 99,
    life: 0.28,
    maxLife: 0.28,
    rotation: 0,
    alpha: 0.85,
    creeping: false,
    critChance: 0,
    critMult: 1,
    lifestealOnCrit: 0,
  });
}

export function triggerFrostExplosion(
  ctx: WeaponRuntimeContext,
  x: number,
  y: number,
  stats: StatBlock,
  enemySystem: EnemySystem,
  hooks: WeaponCombatHooks,
): void {
  const p = ctx.catalog.arcanas.arcana_xii_out_of_bounds.params;
  const radius = (p.freezeExplosionRadius ?? 120) * stats.area;
  const dmg = (p.freezeExplosionDamage ?? 45) * stats.might;
  const slot = findWeaponSlot(ctx.slots, 'clock_lancet');
  const count = enemySystem.grid.queryRadius(x, y, radius, ctx.queryScratch);
  for (let i = 0; i < count; i++) {
    const idx = ctx.queryScratch[i]!;
    const e = enemySystem.enemies[idx];
    if (!e || !e.alive) continue;
    applyDamageToEnemy(
      enemySystem,
      idx,
      dmg,
      slot,
      e.x - x,
      e.y - y,
      20,
      false,
      0,
      false,
      hooks,
    );
  }
  spawnPooledZone(ctx, {
    kind: 'explosion',
    weaponId: 'clock_lancet',
    vfxKey: 'explosion_ring',
    x,
    y,
    radius,
    baseRadius: radius,
    maxRadius: radius,
    damage: 0,
    knockback: 0,
    tickInterval: 99,
    tickTimer: 99,
    life: 0.3,
    maxLife: 0.3,
    rotation: 0,
    alpha: 0.85,
    tint: 0x74e7ff,
    creeping: false,
    critChance: 0,
    critMult: 1,
    lifestealOnCrit: 0,
  });
}
