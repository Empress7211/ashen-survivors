import type {
  ActiveProjectile,
  ActiveZone,
  SpawnProjectileOptions,
  SpawnZoneOptions,
  WeaponRuntimeContext,
} from './types.ts';

/**
 * Reusable object pool for active projectiles to eliminate per-shot allocations and Map churn.
 */
export class ProjectilePool {
  private readonly free: ActiveProjectile[] = [];
  totalAllocated = 0;
  totalReused = 0;
  totalReleased = 0;

  get freeCount(): number {
    return this.free.length;
  }

  acquire(): ActiveProjectile {
    const recycled = this.free.pop();
    if (recycled) {
      recycled.hitCooldowns.clear();
      recycled.lastHitTick = 0;
      recycled.boomerangReversed = false;
      recycled.spinRate = 0;
      recycled.alpha = 1;
      this.totalReused += 1;
      return recycled;
    }
    this.totalAllocated += 1;
    return {
      uid: 0,
      weaponId: 'whip',
      vfxKey: '',
      behavior: 'straight',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speed: 0,
      radius: 0,
      damage: 0,
      knockback: 0,
      pierceLeft: 0,
      bouncesLeft: 0,
      life: 0,
      maxLife: 0,
      rotation: 0,
      spinRate: 0,
      scale: 1,
      alpha: 1,
      critChance: 0,
      critMult: 1,
      lifestealOnCrit: 0,
      explodeOnBounce: false,
      explodeOnHit: false,
      explodeDamage: 0,
      explodeRadius: 0,
      boomerangReturnTime: 0.6,
      boomerangReversed: false,
      hitCooldowns: new Map<number, number>(),
      lastHitTick: 0,
    };
  }

  release(projectile: ActiveProjectile): void {
    projectile.hitCooldowns.clear();
    this.free.push(projectile);
    this.totalReleased += 1;
  }
}

/**
 * Reusable object pool for active combat/VFX zones to eliminate per-cast allocations and Map churn.
 */
export class ZonePool {
  private readonly free: ActiveZone[] = [];
  totalAllocated = 0;
  totalReused = 0;
  totalReleased = 0;

  get freeCount(): number {
    return this.free.length;
  }

  acquire(): ActiveZone {
    const recycled = this.free.pop();
    if (recycled) {
      recycled.hitCooldowns.clear();
      recycled.weaponId = undefined;
      recycled.endX = undefined;
      recycled.endY = undefined;
      recycled.flipX = undefined;
      recycled.tint = undefined;
      recycled.secondPulsePending = undefined;
      this.totalReused += 1;
      return recycled;
    }
    this.totalAllocated += 1;
    return {
      uid: 0,
      kind: 'pool',
      weaponId: undefined,
      vfxKey: '',
      x: 0,
      y: 0,
      endX: undefined,
      endY: undefined,
      radius: 0,
      baseRadius: 0,
      maxRadius: 0,
      damage: 0,
      knockback: 0,
      tickInterval: 99,
      tickTimer: 99,
      life: 0,
      maxLife: 0,
      rotation: 0,
      alpha: 1,
      flipX: undefined,
      tint: undefined,
      creeping: false,
      critChance: 0,
      critMult: 1,
      lifestealOnCrit: 0,
      secondPulsePending: undefined,
      hitCooldowns: new Map<number, number>(),
    };
  }

  release(zone: ActiveZone): void {
    zone.hitCooldowns.clear();
    zone.weaponId = undefined;
    zone.endX = undefined;
    zone.endY = undefined;
    zone.flipX = undefined;
    zone.tint = undefined;
    zone.secondPulsePending = undefined;
    this.free.push(zone);
    this.totalReleased += 1;
  }
}

/** Acquire and populate a pooled ActiveProjectile into ctx.projectiles. */
export function spawnPooledProjectile(
  ctx: WeaponRuntimeContext,
  opts: SpawnProjectileOptions,
): ActiveProjectile {
  const p = ctx.projectilePool.acquire();
  p.uid = ctx.allocUid();
  p.weaponId = opts.weaponId;
  p.vfxKey = opts.vfxKey;
  p.behavior = opts.behavior;
  p.x = opts.x;
  p.y = opts.y;
  p.vx = opts.vx;
  p.vy = opts.vy;
  p.speed = opts.speed;
  p.radius = opts.radius;
  p.damage = opts.damage;
  p.knockback = opts.knockback;
  p.pierceLeft = opts.pierceLeft;
  p.bouncesLeft = opts.bouncesLeft;
  p.life = opts.maxLife;
  p.maxLife = opts.maxLife;
  p.rotation = Math.atan2(opts.vy, opts.vx);
  p.spinRate = opts.spinRate ?? 0;
  p.scale = Math.max(0.75, opts.radius / 22);
  p.alpha = 1;
  p.critChance = opts.critChance;
  p.critMult = opts.critMult;
  p.lifestealOnCrit = opts.lifestealOnCrit;
  p.explodeOnBounce = opts.explodeOnBounce;
  p.explodeOnHit = opts.explodeOnHit;
  p.explodeDamage = opts.explodeDamage;
  p.explodeRadius = opts.explodeRadius;
  p.boomerangReturnTime = opts.boomerangReturnTime ?? 0.6;
  p.boomerangReversed = false;
  p.lastHitTick = 0;
  ctx.projectiles.push(p);
  return p;
}

/** Acquire and populate a pooled ActiveZone into ctx.zones. */
export function spawnPooledZone(
  ctx: WeaponRuntimeContext,
  opts: SpawnZoneOptions,
): ActiveZone {
  const z = ctx.zonePool.acquire();
  z.uid = ctx.allocUid();
  z.kind = opts.kind;
  z.weaponId = opts.weaponId;
  z.vfxKey = opts.vfxKey;
  z.x = opts.x;
  z.y = opts.y;
  z.endX = opts.endX;
  z.endY = opts.endY;
  z.radius = opts.radius;
  z.baseRadius = opts.baseRadius;
  z.maxRadius = opts.maxRadius;
  z.damage = opts.damage;
  z.knockback = opts.knockback;
  z.tickInterval = opts.tickInterval;
  z.tickTimer = opts.tickTimer;
  z.life = opts.life;
  z.maxLife = opts.maxLife;
  z.rotation = opts.rotation;
  z.alpha = opts.alpha;
  z.flipX = opts.flipX;
  z.tint = opts.tint;
  z.creeping = opts.creeping;
  z.critChance = opts.critChance;
  z.critMult = opts.critMult;
  z.lifestealOnCrit = opts.lifestealOnCrit;
  z.secondPulsePending = opts.secondPulsePending;
  ctx.zones.push(z);
  return z;
}
