import type {
  ArcanaId,
  StageCorridorBounds,
  StatBlock,
} from '../../contracts/index.ts';
import type { EnemySystem } from '../EnemySystem.ts';
import type { SeededRng } from '../Rng.ts';
import {
  applyDamageToEnemy,
  damagePropsInRadius,
  triggerLightningStrike,
  triggerSubExplosion,
} from './combat.ts';
import { findWeaponSlot } from './stats.ts';
import type { WeaponCombatHooks, WeaponRuntimeContext } from './types.ts';

export function updateOrbiters(
  ctx: WeaponRuntimeContext,
  dt: number,
  playerX: number,
  playerY: number,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  hooks: WeaponCombatHooks,
): void {
  const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');
  const orbiters = ctx.orbiters;
  let i = 0;
  while (i < orbiters.length) {
    const o = orbiters[i]!;
    o.angle += o.angularSpeed * dt;
    if (!o.permanent) {
      o.life -= dt;
      if (o.life <= 0) {
        const last = orbiters.pop()!;
        if (i < orbiters.length) orbiters[i] = last;
        continue;
      }
    }

    if (o.hitCooldowns.size > 0) {
      for (const [uid, rem] of o.hitCooldowns.entries()) {
        if (rem - dt <= 0) o.hitCooldowns.delete(uid);
        else o.hitCooldowns.set(uid, rem - dt);
      }
    }

    const ox = playerX + Math.cos(o.angle) * o.orbitRadius;
    const oy = playerY + Math.sin(o.angle) * o.orbitRadius;
    const slot = findWeaponSlot(ctx.slots, o.weaponId);

    const count = enemySystem.grid.queryRadius(
      ox,
      oy,
      o.hitRadius,
      ctx.queryScratch,
    );
    for (let eIdx = 0; eIdx < count; eIdx++) {
      const idx = ctx.queryScratch[eIdx]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive || o.hitCooldowns.has(e.uid)) continue;
      o.hitCooldowns.set(e.uid, 0.32);
      applyDamageToEnemy(
        enemySystem,
        idx,
        o.damage,
        slot,
        e.x - playerX,
        e.y - playerY,
        o.knockback,
        false,
        0,
        divineActive,
        hooks,
      );
    }
    damagePropsInRadius(enemySystem, ox, oy, o.hitRadius, o.damage, hooks);
    i++;
  }
}

export function updateProjectiles(
  ctx: WeaponRuntimeContext,
  dt: number,
  playerX: number,
  playerY: number,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
  corridorBounds: StageCorridorBounds | undefined,
  hooks: WeaponCombatHooks,
): void {
  const viewHalfW = 630;
  const viewHalfH = 355;
  const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');
  const divineAffected =
    ctx.catalog.arcanas.arcana_ix_divine_bloodline.affectedWeapons;

  const projectiles = ctx.projectiles;
  let i = 0;
  while (i < projectiles.length) {
    const p = projectiles[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      const last = projectiles.pop()!;
      if (i < projectiles.length) projectiles[i] = last;
      ctx.projectilePool.release(p);
      continue;
    }

    if (p.hitCooldowns.size > 0) {
      for (const [uid, rem] of p.hitCooldowns.entries()) {
        if (rem - dt <= 0) p.hitCooldowns.delete(uid);
        else p.hitCooldowns.set(uid, rem - dt);
      }
    }

    if (p.behavior === 'axe_arc') {
      p.vy += 840 * dt;
    } else if (p.behavior === 'boomerang') {
      const age = p.maxLife - p.life;
      if (!p.boomerangReversed && age >= p.boomerangReturnTime) {
        p.boomerangReversed = true;
        p.hitCooldowns.clear();
      }
      if (p.boomerangReversed) {
        const decel = (p.speed / Math.max(0.25, p.boomerangReturnTime)) * 2.2;
        const speedNow = Math.hypot(p.vx, p.vy);
        const dirX = speedNow > 1e-3 ? p.vx / speedNow : 1;
        const dirY = speedNow > 1e-3 ? p.vy / speedNow : 0;
        p.vx -= dirX * decel * dt;
        p.vy -= dirY * decel * dt;
        if (age > p.boomerangReturnTime + 0.15 && speedNow < 60) {
          const toPX = playerX - p.x;
          const toPY = playerY - p.y;
          const d = Math.hypot(toPX, toPY);
          if (d > 1e-3) {
            p.vx = (toPX / d) * p.speed * 1.15;
            p.vy = (toPY / d) * p.speed * 1.15;
          }
        }
      }
    } else if (p.behavior === 'homing' && p.weaponId === 'holy_wand') {
      const nearestIdx = enemySystem.grid.queryNearest(p.x, p.y, 260);
      if (nearestIdx !== -1) {
        const target = enemySystem.enemies[nearestIdx]!;
        const tx = target.x - p.x;
        const ty = target.y - p.y;
        const d = Math.hypot(tx, ty);
        if (d > 1e-4) {
          const desiredVx = (tx / d) * p.speed;
          const desiredVy = (ty / d) * p.speed;
          p.vx += (desiredVx - p.vx) * Math.min(1, dt * 6);
          p.vy += (desiredVy - p.vy) * Math.min(1, dt * 6);
        }
      }
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.spinRate !== 0) {
      p.rotation += p.spinRate * dt;
    } else {
      p.rotation = Math.atan2(p.vy, p.vx);
    }

    // Screen/corridor bounce checks
    let bounced = false;
    const minX = Math.max(playerX - viewHalfW, corridorBounds?.minX ?? -Infinity);
    const maxX = Math.min(playerX + viewHalfW, corridorBounds?.maxX ?? Infinity);
    const minY = Math.max(playerY - viewHalfH, corridorBounds?.minY ?? -Infinity);
    const maxY = Math.min(playerY + viewHalfH, corridorBounds?.maxY ?? Infinity);

    if (p.bouncesLeft > 0) {
      if (p.x <= minX && p.vx < 0) {
        p.x = minX;
        p.vx = Math.abs(p.vx);
        bounced = true;
      } else if (p.x >= maxX && p.vx > 0) {
        p.x = maxX;
        p.vx = -Math.abs(p.vx);
        bounced = true;
      }
      if (p.y <= minY && p.vy < 0) {
        p.y = minY;
        p.vy = Math.abs(p.vy);
        bounced = true;
      } else if (p.y >= maxY && p.vy > 0) {
        p.y = maxY;
        p.vy = -Math.abs(p.vy);
        bounced = true;
      }
      if (bounced) {
        p.bouncesLeft -= 1;
        if (p.explodeOnBounce) {
          triggerSubExplosion(
            ctx,
            p.x,
            p.y,
            p.explodeRadius,
            p.explodeDamage,
            p.weaponId,
            enemySystem,
            hooks,
          );
        }
      }
    }

    const slot = findWeaponSlot(ctx.slots, p.weaponId);

    // Enemy collision
    const count = enemySystem.grid.queryRadius(
      p.x,
      p.y,
      p.radius,
      ctx.queryScratch,
    );
    let consumed = false;
    const divineBonus = divineActive && divineAffected.includes(p.weaponId);

    for (let eIdx = 0; eIdx < count; eIdx++) {
      const idx = ctx.queryScratch[eIdx]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive || p.hitCooldowns.has(e.uid)) continue;

      p.hitCooldowns.set(e.uid, p.pierceLeft > 10 ? 0.22 : 0.45);
      const isCrit = rng.chance(p.critChance);
      const dmg = isCrit ? p.damage * p.critMult : p.damage;

      applyDamageToEnemy(
        enemySystem,
        idx,
        dmg,
        slot,
        p.vx,
        p.vy,
        p.knockback,
        isCrit,
        isCrit ? p.lifestealOnCrit : 0,
        divineBonus,
        hooks,
      );

      if (p.explodeOnHit) {
        const triggerBlast = p.behavior !== 'cherry' || rng.chance(p.critChance);
        if (triggerBlast) {
          triggerSubExplosion(
            ctx,
            e.x,
            e.y,
            p.explodeRadius,
            p.explodeDamage,
            p.weaponId,
            enemySystem,
            hooks,
          );
        }
      }

      // Bone / Bounce-on-enemy behavior
      if ((p.behavior === 'bone' || p.behavior === 'cherry') && p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        const hitUid = e.uid;
        const nextIdx = enemySystem.grid.queryNearest(
          p.x,
          p.y,
          340,
          (cand) => {
            const ce = enemySystem.enemies[cand];
            return Boolean(ce && ce.alive && ce.uid !== hitUid);
          },
        );
        if (nextIdx !== -1) {
          const nt = enemySystem.enemies[nextIdx]!;
          const dx = nt.x - p.x;
          const dy = nt.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx = (dx / d) * p.speed;
          p.vy = (dy / d) * p.speed;
        } else {
          p.vx = -p.vx + rng.range(-60, 60);
          p.vy = -p.vy + rng.range(-60, 60);
        }
      }

      p.pierceLeft -= 1;
      if (p.pierceLeft <= 0) {
        if (p.bouncesLeft > 0) {
          p.bouncesLeft -= 1;
          p.pierceLeft = 1;
          p.vx = -p.vx;
          p.vy = -p.vy;
        } else {
          consumed = true;
          break;
        }
      }
    }

    if (!consumed) {
      damagePropsInRadius(enemySystem, p.x, p.y, p.radius, p.damage, hooks);
    }

    if (consumed) {
      const last = projectiles.pop()!;
      if (i < projectiles.length) projectiles[i] = last;
      ctx.projectilePool.release(p);
    } else {
      i++;
    }
  }
}

export function updateZones(
  ctx: WeaponRuntimeContext,
  dt: number,
  playerX: number,
  playerY: number,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
  hooks: WeaponCombatHooks,
): void {
  const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');
  const divineAffected =
    ctx.catalog.arcanas.arcana_ix_divine_bloodline.affectedWeapons;
  const zones = ctx.zones;
  let i = 0;
  while (i < zones.length) {
    const z = zones[i]!;
    z.life -= dt;
    if (z.life <= 0) {
      const hasSecondPulse = Boolean(z.secondPulsePending && z.weaponId);
      const zx = z.x;
      const zy = z.y;
      const zRadius = z.radius;
      const zDamage = z.damage;
      const zKnock = z.knockback;
      const zCritChance = z.critChance;
      const zCritMult = z.critMult;
      const zWeaponId = z.weaponId;

      const last = zones.pop()!;
      if (i < zones.length) zones[i] = last;
      ctx.zonePool.release(z);

      if (hasSecondPulse && zWeaponId) {
        const slot = findWeaponSlot(ctx.slots, zWeaponId);
        triggerLightningStrike(
          ctx,
          zx,
          zy,
          zRadius * 1.25,
          zDamage * 0.85,
          zKnock,
          zCritChance,
          zCritMult,
          slot,
          'lightning_bolt',
          false,
          enemySystem,
          rng,
          hooks,
        );
      }
      continue;
    }

    if (z.kind === 'aura') {
      z.x = playerX;
      z.y = playerY;
    }

    if (z.creeping && z.maxLife > 0) {
      const progress = 1 - z.life / z.maxLife;
      z.radius = z.baseRadius + (z.maxRadius - z.baseRadius) * progress;
      const dx = playerX - z.x;
      const dy = playerY - z.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 36) {
        const creepSpeed = 72;
        z.x += (dx / dist) * creepSpeed * dt;
        z.y += (dy / dist) * creepSpeed * dt;
      }
    }

    if (z.damage > 0 && z.tickInterval < 50) {
      z.tickTimer -= dt;
      if (z.tickTimer <= 0) {
        z.tickTimer += z.tickInterval;
        const slot = z.weaponId ? findWeaponSlot(ctx.slots, z.weaponId) : undefined;
        const count = enemySystem.grid.queryRadius(
          z.x,
          z.y,
          z.radius,
          ctx.queryScratch,
        );
        const divineBonus =
          divineActive && Boolean(z.weaponId && divineAffected.includes(z.weaponId));
        for (let eIdx = 0; eIdx < count; eIdx++) {
          const idx = ctx.queryScratch[eIdx]!;
          applyDamageToEnemy(
            enemySystem,
            idx,
            z.damage,
            slot,
            0,
            0,
            z.knockback,
            false,
            0,
            divineBonus,
            hooks,
          );
        }
        damagePropsInRadius(enemySystem, z.x, z.y, z.radius, z.damage, hooks);
      }
    }
    i++;
  }
}

export function updateBeams(
  ctx: WeaponRuntimeContext,
  dt: number,
  playerX: number,
  playerY: number,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
  hooks: WeaponCombatHooks,
): void {
  const fireHeart = arcanaSet.has('arcana_xix_heart_of_fire');
  const beams = ctx.beams;
  let i = 0;
  while (i < beams.length) {
    const b = beams[i]!;
    b.life -= dt;
    if (b.life <= 0) {
      const last = beams.pop()!;
      if (i < beams.length) beams[i] = last;
      continue;
    }
    b.angle += b.spinRate * dt;
    b.tickTimer -= dt;
    if (b.tickTimer <= 0) {
      b.tickTimer = 0.14;
      const x2 = playerX + Math.cos(b.angle) * b.length;
      const y2 = playerY + Math.sin(b.angle) * b.length;
      const slot = findWeaponSlot(ctx.slots, b.weaponId);

      const count = enemySystem.grid.queryLine(
        playerX,
        playerY,
        x2,
        y2,
        b.width * 0.65,
        ctx.queryScratch,
      );
      for (let eIdx = 0; eIdx < count; eIdx++) {
        const idx = ctx.queryScratch[eIdx]!;
        const e = enemySystem.enemies[idx];
        if (!e || !e.alive) continue;
        const isCrit = rng.chance(b.critChance);
        const dmg = isCrit ? b.damage * b.critMult : b.damage;
        applyDamageToEnemy(
          enemySystem,
          idx,
          dmg,
          slot,
          Math.cos(b.angle),
          Math.sin(b.angle),
          b.knockback,
          isCrit,
          0,
          false,
          hooks,
        );
        if (b.explodeOnHit && fireHeart && eIdx < 2) {
          const fp = ctx.catalog.arcanas.arcana_xix_heart_of_fire.params;
          triggerSubExplosion(
            ctx,
            e.x,
            e.y,
            (fp.explosionRadius ?? 90) * stats.area,
            (fp.explosionDamage ?? 32) * stats.might * 0.5,
            b.weaponId,
            enemySystem,
            hooks,
          );
        }
      }
    }
    i++;
  }
}
