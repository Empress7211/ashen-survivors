import type {
  ArcanaId,
  StatBlock,
  WeaponBaseStats,
  WeaponDef,
} from '../../contracts/index.ts';
import type { EnemySystem } from '../EnemySystem.ts';
import type { SeededRng } from '../Rng.ts';
import {
  applyDamageToEnemy,
  damagePropsInRadius,
  damagePropsInRect,
  triggerLightningStrike,
} from './combat.ts';
import { spawnPooledProjectile, spawnPooledZone } from './pools.ts';
import {
  computeWeaponEffectiveBase,
  findWeaponSlot,
  getEffectiveAmount,
  getEffectiveCrit,
  getEffectiveDamage,
} from './stats.ts';
import type {
  WeaponCombatHooks,
  WeaponRuntimeContext,
  WeaponSlotState,
} from './types.ts';

export function consumeLaurelShield(
  ctx: WeaponRuntimeContext,
  playerX: number,
  playerY: number,
  stats: StatBlock,
  arcanas: readonly ArcanaId[],
  enemySystem: EnemySystem,
  rng: SeededRng,
  hooks: WeaponCombatHooks,
): { blocked: boolean; invulnSeconds: number } {
  const slot = findWeaponSlot(ctx.slots, 'laurel');
  if (!slot || slot.laurelCharges <= 0) {
    return { blocked: false, invulnSeconds: 0 };
  }
  const wStats = computeWeaponEffectiveBase(ctx.catalog, slot);
  slot.laurelCharges -= 1;
  const invulnSeconds = wStats.duration * stats.duration;
  const radius = wStats.baseSize * wStats.area * stats.area;

  spawnPooledZone(ctx, {
    kind: 'shield_burst',
    weaponId: 'laurel',
    vfxKey: 'laurel_shield',
    x: playerX,
    y: playerY,
    radius,
    baseRadius: radius,
    maxRadius: radius,
    damage: 0,
    knockback: wStats.knockback,
    tickInterval: 99,
    tickTimer: 99,
    life: 0.35,
    maxLife: 0.35,
    rotation: 0,
    alpha: 0.9,
    creeping: false,
    critChance: 0,
    critMult: 1,
    lifestealOnCrit: 0,
  });

  const hasDivine = arcanas.includes('arcana_ix_divine_bloodline');
  const hasFireHeart = arcanas.includes('arcana_xix_heart_of_fire');
  const counterRadius = hasDivine || hasFireHeart ? radius * 1.8 : radius;
  const counterDmg =
    (hasDivine ? Math.max(20, stats.armor * 18) : 0) +
    (hasFireHeart
      ? (ctx.catalog.arcanas.arcana_xix_heart_of_fire.params.explosionDamage ?? 32)
      : 0);

  const count = enemySystem.grid.queryRadius(
    playerX,
    playerY,
    counterRadius,
    ctx.queryScratch,
  );
  for (let i = 0; i < count; i++) {
    const idx = ctx.queryScratch[i]!;
    const e = enemySystem.enemies[idx];
    if (!e || !e.alive) continue;
    if (counterDmg > 0) {
      applyDamageToEnemy(
        enemySystem,
        idx,
        counterDmg * stats.might,
        slot,
        e.x - playerX,
        e.y - playerY,
        wStats.knockback * 1.4,
        false,
        0,
        hasDivine,
        hooks,
      );
    } else {
      enemySystem.damageEnemy(idx, 1, {
        knockX: e.x - playerX,
        knockY: e.y - playerY,
        knockForce: wStats.knockback * 1.3,
      });
    }
  }

  if (hasFireHeart) {
    const fireParams = ctx.catalog.arcanas.arcana_xix_heart_of_fire.params;
    const numBolts = fireParams.retaliationCount ?? 6;
    for (let b = 0; b < numBolts; b++) {
      const theta = (b / numBolts) * Math.PI * 2 + rng.range(-0.15, 0.15);
      spawnPooledProjectile(ctx, {
        weaponId: 'laurel',
        vfxKey: 'fireball',
        behavior: 'straight',
        x: playerX,
        y: playerY,
        vx: Math.cos(theta) * 380,
        vy: Math.sin(theta) * 380,
        speed: 380,
        radius: 18,
        damage: (fireParams.explosionDamage ?? 32) * stats.might,
        knockback: 25,
        pierceLeft: 2,
        bouncesLeft: 0,
        maxLife: 0.9,
        critChance: 0,
        critMult: 1.5,
        lifestealOnCrit: 0,
        explodeOnBounce: false,
        explodeOnHit: true,
        explodeDamage: (fireParams.explosionDamage ?? 32) * stats.might,
        explodeRadius: fireParams.explosionRadius ?? 90,
      });
    }
  }

  hooks.onAudioCue({ type: 'weapon_fire', weaponId: 'laurel' });
  return { blocked: true, invulnSeconds };
}

export function ensurePermanentOrbiters(
  ctx: WeaponRuntimeContext,
  slot: WeaponSlotState,
  def: WeaponDef,
  wStats: WeaponBaseStats,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
): void {
  const targetCount = getEffectiveAmount(slot, wStats, stats);
  const areaScale = wStats.area * stats.area * (1 + slot.limitBreakArea);
  const orbitR = wStats.baseSize * areaScale;
  const speed = wStats.projectileSpeed * stats.speed;
  const angularSpeed = speed / Math.max(40, orbitR);
  const { damage } = getEffectiveDamage(ctx.catalog, slot, wStats, stats, arcanaSet);

  let existingCount = 0;
  let firstAngle: number | null = null;
  for (let i = 0; i < ctx.orbiters.length; i++) {
    const o = ctx.orbiters[i]!;
    if (o.weaponId === slot.weaponId && o.permanent) {
      existingCount++;
      if (firstAngle === null) firstAngle = o.angle;
    }
  }

  if (existingCount !== targetCount) {
    let write = 0;
    for (let i = 0; i < ctx.orbiters.length; i++) {
      const o = ctx.orbiters[i]!;
      if (o.weaponId !== slot.weaponId) {
        ctx.orbiters[write++] = o;
      }
    }
    ctx.orbiters.length = write;

    for (let k = 0; k < targetCount; k++) {
      ctx.orbiters.push({
        uid: ctx.allocUid(),
        weaponId: slot.weaponId,
        vfxKey: def.vfxKey,
        angle: slot.orbitalAngle + (k / targetCount) * Math.PI * 2,
        orbitRadius: orbitR,
        angularSpeed,
        hitRadius: 28 * areaScale,
        damage,
        knockback: wStats.knockback,
        life: 999,
        permanent: true,
        hitCooldowns: new Map(),
      });
    }
  } else {
    for (let i = 0; i < ctx.orbiters.length; i++) {
      const o = ctx.orbiters[i]!;
      if (o.weaponId === slot.weaponId && o.permanent) {
        o.orbitRadius = orbitR;
        o.angularSpeed = angularSpeed;
        o.hitRadius = 28 * areaScale;
        o.damage = damage;
      }
    }
    if (firstAngle !== null) {
      slot.orbitalAngle = firstAngle;
    }
  }
}

export function triggerWeapon(
  ctx: WeaponRuntimeContext,
  slot: WeaponSlotState,
  def: WeaponDef,
  wStats: WeaponBaseStats,
  playerX: number,
  playerY: number,
  facingX: number,
  facingY: number,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
  hooks: WeaponCombatHooks,
): void {
  const id = slot.weaponId;
  const areaScale = wStats.area * stats.area * (1 + slot.limitBreakArea);
  const amount = getEffectiveAmount(slot, wStats, stats);
  const { damage, divineApplies } = getEffectiveDamage(
    ctx.catalog,
    slot,
    wStats,
    stats,
    arcanaSet,
  );
  const { critChance, critMult } = getEffectiveCrit(
    ctx.catalog,
    slot,
    wStats,
    stats,
    arcanaSet,
  );
  const speed = wStats.projectileSpeed * stats.speed;
  const duration = wStats.duration * stats.duration;

  hooks.onAudioCue({ type: 'weapon_fire', weaponId: id });

  // --- MELEE: WHIP / BLOODY TEAR ---
  if (id === 'whip' || id === 'bloody_tear') {
    const slashW = wStats.baseSize * areaScale;
    const slashH = 48 * areaScale;
    const baseDir = facingX >= 0 ? 1 : -1;
    for (let k = 0; k < amount; k++) {
      const dir = k % 2 === 0 ? baseDir : -baseDir;
      const yOffset = -Math.floor(k / 2) * 34;
      const cx = playerX + dir * (slashW * 0.55);
      const cy = playerY + yOffset;
      ctx.whipSlashToggle++;

      const minX = cx - slashW * 0.5;
      const maxX = cx + slashW * 0.5;
      const minY = cy - slashH * 0.5;
      const maxY = cy + slashH * 0.5;

      const count = enemySystem.grid.queryRect(
        minX,
        minY,
        maxX,
        maxY,
        ctx.queryScratch,
      );
      for (let eIdx = 0; eIdx < count; eIdx++) {
        const idx = ctx.queryScratch[eIdx]!;
        const isCrit = rng.chance(critChance);
        const dmg = isCrit ? damage * critMult : damage;
        applyDamageToEnemy(
          enemySystem,
          idx,
          dmg,
          slot,
          dir,
          0,
          wStats.knockback,
          isCrit,
          isCrit ? (wStats.lifestealOnCrit ?? 0) : 0,
          divineApplies,
          hooks,
        );
      }
      damagePropsInRect(enemySystem, minX, minY, maxX, maxY, damage, hooks);

      spawnPooledZone(ctx, {
        kind: 'slash',
        weaponId: id,
        vfxKey: def.vfxKey,
        x: cx,
        y: cy,
        radius: slashW * 0.5,
        baseRadius: slashW * 0.5,
        maxRadius: slashW * 0.5,
        damage: 0,
        knockback: 0,
        tickInterval: 99,
        tickTimer: 99,
        life: 0.22,
        maxLife: 0.22,
        rotation: 0,
        alpha: 0.95,
        flipX: dir < 0,
        creeping: false,
        critChance: 0,
        critMult: 1,
        lifestealOnCrit: 0,
      });
    }
    return;
  }

  // --- AURA: GARLIC / SOUL EATER ---
  if (id === 'garlic' || id === 'soul_eater') {
    const radius = wStats.baseSize * areaScale;
    const count = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      radius,
      ctx.queryScratch,
    );
    let healedAny = false;
    for (let i = 0; i < count; i++) {
      const idx = ctx.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      enemySystem.applyGarlicDebuff(idx, 1.5);
      applyDamageToEnemy(
        enemySystem,
        idx,
        damage,
        slot,
        e.x - playerX,
        e.y - playerY,
        wStats.knockback,
        false,
        0,
        divineApplies,
        hooks,
      );
      if (id === 'soul_eater' && !healedAny) {
        healedAny = true;
        hooks.onHealPlayer(wStats.lifestealOnCrit ?? 1, 'soul_eater');
      }
    }
    damagePropsInRadius(enemySystem, playerX, playerY, radius, damage, hooks);

    const auraLife = Math.min(0.45, Math.max(0.2, wStats.cooldown * stats.cooldown));
    spawnPooledZone(ctx, {
      kind: 'aura',
      weaponId: id,
      vfxKey: def.vfxKey,
      x: playerX,
      y: playerY,
      radius,
      baseRadius: radius,
      maxRadius: radius,
      damage: 0,
      knockback: 0,
      tickInterval: 99,
      tickTimer: 99,
      life: auraLife,
      maxLife: auraLife,
      rotation: 0,
      alpha: 0.55,
      creeping: false,
      critChance: 0,
      critMult: 1,
      lifestealOnCrit: 0,
    });
    return;
  }

  // --- ORBIT: KING BIBLE ---
  if (id === 'king_bible') {
    const orbitR = wStats.baseSize * areaScale;
    const angularSpeed = speed / Math.max(40, orbitR);
    for (let k = 0; k < amount; k++) {
      ctx.orbiters.push({
        uid: ctx.allocUid(),
        weaponId: id,
        vfxKey: def.vfxKey,
        angle: slot.orbitalAngle + (k / amount) * Math.PI * 2,
        orbitRadius: orbitR,
        angularSpeed,
        hitRadius: 24 * areaScale,
        damage,
        knockback: wStats.knockback,
        life: duration,
        permanent: false,
        hitCooldowns: new Map(),
      });
    }
    return;
  }

  // --- SCREEN: PENTAGRAM / GORGEOUS MOON ---
  if (id === 'pentagram' || id === 'gorgeous_moon') {
    const wipeRadius = wStats.baseSize * Math.max(1, areaScale);
    const count = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      wipeRadius,
      ctx.queryScratch,
    );
    for (let i = 0; i < count; i++) {
      const idx = ctx.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive || e.isBoss || e.isReaper) continue;
      applyDamageToEnemy(
        enemySystem,
        idx,
        Math.max(damage, e.hp + 1),
        slot,
        0,
        0,
        0,
        false,
        0,
        false,
        hooks,
      );
    }
    damagePropsInRadius(enemySystem, playerX, playerY, wipeRadius, 999, hooks);

    let eraseChance = 0;
    if (id === 'pentagram') {
      const eraseByLevel = [0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.1, 0.02];
      const rawErase = eraseByLevel[Math.min(7, slot.level - 1)] ?? 0.65;
      eraseChance = rawErase / Math.max(1, stats.luck);
    }
    hooks.onPentagramTriggered(eraseChance, id === 'gorgeous_moon');
    hooks.onScreenEffect(
      { color: id === 'gorgeous_moon' ? 0x67b8ff : 0xdf2a5c, alpha: 0.45 },
      10,
    );

    spawnPooledZone(ctx, {
      kind: 'pentagram',
      weaponId: id,
      vfxKey: def.vfxKey,
      x: playerX,
      y: playerY,
      radius: 360 * areaScale,
      baseRadius: 360 * areaScale,
      maxRadius: 360 * areaScale,
      damage: 0,
      knockback: 0,
      tickInterval: 99,
      tickTimer: 99,
      life: 0.85,
      maxLife: 0.85,
      rotation: 0,
      alpha: 0.9,
      creeping: false,
      critChance: 0,
      critMult: 1,
      lifestealOnCrit: 0,
    });
    return;
  }

  // --- RADIAL FREEZE: CLOCK LANCET ---
  if (id === 'clock_lancet') {
    const angle = (slot.clockStep / 12) * Math.PI * 2 - Math.PI * 0.5;
    slot.clockStep = (slot.clockStep + 1) % 12;
    const beamLen = wStats.baseSize * areaScale;
    const x2 = playerX + Math.cos(angle) * beamLen;
    const y2 = playerY + Math.sin(angle) * beamLen;

    const count = enemySystem.grid.queryLine(
      playerX,
      playerY,
      x2,
      y2,
      24 * areaScale,
      ctx.queryScratch,
    );
    let frozeAny = false;
    for (let i = 0; i < count; i++) {
      const idx = ctx.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      if (enemySystem.freezeEnemy(idx, duration)) {
        frozeAny = true;
        if (arcanaSet.has('arcana_xii_out_of_bounds')) {
          hooks.onFreezeTriggered(e.x, e.y);
        }
      }
    }
    if (!frozeAny && arcanaSet.has('arcana_xii_out_of_bounds') && count > 0) {
      hooks.onFreezeTriggered(x2, y2);
    }

    spawnPooledZone(ctx, {
      kind: 'clock_hand',
      weaponId: id,
      vfxKey: def.vfxKey,
      x: playerX,
      y: playerY,
      endX: x2,
      endY: y2,
      radius: beamLen,
      baseRadius: beamLen,
      maxRadius: beamLen,
      damage: 0,
      knockback: 0,
      tickInterval: 99,
      tickTimer: 99,
      life: 0.35,
      maxLife: 0.35,
      rotation: angle,
      alpha: 0.92,
      creeping: false,
      critChance: 0,
      critMult: 1,
      lifestealOnCrit: 0,
    });
    return;
  }

  // --- LIGHTNING: LIGHTNING RING / THUNDER LOOP ---
  if (id === 'lightning_ring' || id === 'thunder_loop') {
    const strikeRadius = wStats.baseSize * areaScale;
    const candidates = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      640,
      ctx.queryScratch,
    );
    for (let k = 0; k < amount; k++) {
      let tx = playerX + rng.range(-480, 480);
      let ty = playerY + rng.range(-280, 280);
      if (candidates > 0) {
        const pickedIdx = ctx.queryScratch[rng.int(0, candidates - 1)]!;
        const target = enemySystem.enemies[pickedIdx];
        if (target && target.alive) {
          tx = target.x;
          ty = target.y;
        }
      }
      triggerLightningStrike(
        ctx,
        tx,
        ty,
        strikeRadius,
        damage,
        wStats.knockback,
        critChance,
        critMult,
        slot,
        def.vfxKey,
        id === 'thunder_loop',
        enemySystem,
        rng,
        hooks,
      );
    }
    return;
  }

  // --- ZONE: SANTA WATER / LA BORRA ---
  if (id === 'santa_water' || id === 'la_borra') {
    const poolRadius = wStats.baseSize * areaScale;
    const isBorra = id === 'la_borra';
    const poolVfx = isBorra ? 'borra_pool' : 'water_pool';
    const candidates = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      420,
      ctx.queryScratch,
    );
    for (let k = 0; k < amount; k++) {
      let tx = playerX + rng.range(-280, 280);
      let ty = playerY + rng.range(-200, 200);
      if (candidates > 0 && k < candidates) {
        const pickedIdx = ctx.queryScratch[rng.int(0, candidates - 1)]!;
        const e = enemySystem.enemies[pickedIdx];
        if (e && e.alive) {
          tx = e.x + rng.range(-30, 30);
          ty = e.y + rng.range(-30, 30);
        }
      }
      spawnPooledZone(ctx, {
        kind: 'pool',
        weaponId: id,
        vfxKey: poolVfx,
        x: tx,
        y: ty,
        radius: poolRadius,
        baseRadius: poolRadius,
        maxRadius: isBorra ? poolRadius * 1.55 : poolRadius,
        damage,
        knockback: wStats.knockback,
        tickInterval: wStats.poolInterval ?? 0.45,
        tickTimer: 0.05,
        life: duration,
        maxLife: duration,
        rotation: 0,
        alpha: 0.85,
        creeping: isBorra,
        critChance,
        critMult,
        lifestealOnCrit: 0,
      });
    }
    return;
  }

  // --- BOMBARD ZONE: PEACHONE / EBONY WINGS / VANDALIER ---
  if (id === 'peachone' || id === 'ebony_wings' || id === 'vandalier') {
    const dirSign = id === 'ebony_wings' ? -1 : 1;
    slot.orbitalAngle += dirSign * 0.65;
    const blastRadius = wStats.baseSize * areaScale;
    const ringDist = 200 * Math.max(0.85, areaScale * 0.75);

    const sectors = id === 'vandalier' ? [0, Math.PI] : [0];
    const perSector = Math.max(1, Math.ceil(amount / sectors.length));
    for (let sIdx = 0; sIdx < sectors.length; sIdx++) {
      const centerAngle = slot.orbitalAngle + sectors[sIdx]!;
      for (let k = 0; k < perSector; k++) {
        const theta = centerAngle + rng.range(-0.55, 0.55);
        const dist = ringDist * rng.range(0.65, 1.35);
        const bx = playerX + Math.cos(theta) * dist;
        const by = playerY + Math.sin(theta) * dist;
        const isCrit = rng.chance(critChance);
        const dmg = isCrit ? damage * critMult : damage;

        const hitCount = enemySystem.grid.queryRadius(
          bx,
          by,
          blastRadius,
          ctx.queryScratch,
        );
        for (let eIdx = 0; eIdx < hitCount; eIdx++) {
          const idx = ctx.queryScratch[eIdx]!;
          const e = enemySystem.enemies[idx];
          if (!e || !e.alive) continue;
          applyDamageToEnemy(
            enemySystem,
            idx,
            dmg,
            slot,
            e.x - bx,
            e.y - by,
            wStats.knockback,
            isCrit,
            0,
            false,
            hooks,
          );
        }
        damagePropsInRadius(enemySystem, bx, by, blastRadius, dmg, hooks);

        spawnPooledZone(ctx, {
          kind: 'explosion',
          weaponId: id,
          vfxKey: id === 'vandalier' ? 'vandalier_beam' : 'explosion_ring',
          x: bx,
          y: by,
          radius: blastRadius,
          baseRadius: blastRadius,
          maxRadius: blastRadius,
          damage: 0,
          knockback: 0,
          tickInterval: 99,
          tickTimer: 99,
          life: 0.34,
          maxLife: 0.34,
          rotation: rng.range(0, Math.PI * 2),
          alpha: 0.88,
          tint:
            id === 'ebony_wings'
              ? 0x9b5de5
              : id === 'peachone'
                ? 0xfff3b0
                : 0xff66cc,
          creeping: false,
          critChance: 0,
          critMult: 1,
          lifestealOnCrit: 0,
        });
      }
    }
    return;
  }

  // --- BEAM: PHIERAGGI (360 rotating piercing lasers) ---
  if (id === 'phieraggi') {
    const beamLen = wStats.baseSize * areaScale;
    const beamWidth = 22 * areaScale;
    const beamCount = Math.max(4, amount);
    for (let k = 0; k < beamCount; k++) {
      ctx.beams.push({
        uid: ctx.allocUid(),
        weaponId: 'phieraggi',
        vfxKey: def.vfxKey,
        angle: slot.orbitalAngle + (k / beamCount) * Math.PI * 2,
        spinRate: 1.85,
        length: beamLen,
        width: beamWidth,
        damage,
        knockback: wStats.knockback,
        life: duration,
        maxLife: duration,
        tickTimer: 0,
        critChance,
        critMult,
        explodeOnHit: arcanaSet.has('arcana_xix_heart_of_fire'),
        color: k % 2 === 0 ? 0xff4b6e : 0x56ccf2,
      });
    }
    slot.orbitalAngle += 0.4;
    return;
  }

  // --- RADIAL DEATH SPIRAL (9-way piercing) ---
  if (id === 'death_spiral') {
    const baseAngle = slot.orbitalAngle;
    slot.orbitalAngle += 0.25;
    const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
    const ironParams = ctx.catalog.arcanas.arcana_vii_iron_blue.params;
    for (let k = 0; k < amount; k++) {
      const theta = baseAngle + (k / amount) * Math.PI * 2;
      spawnPooledProjectile(ctx, {
        weaponId: id,
        vfxKey: def.vfxKey,
        behavior: 'straight',
        x: playerX,
        y: playerY,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        speed,
        radius: wStats.baseSize * areaScale * 0.55,
        damage,
        knockback: wStats.knockback,
        pierceLeft: wStats.pierce + (ironBlue ? (ironParams.extraPierce ?? 2) : 0),
        bouncesLeft: ironBlue ? (ironParams.extraBounces ?? 3) : 0,
        maxLife: duration,
        spinRate: 8,
        critChance,
        critMult,
        lifestealOnCrit: 0,
        explodeOnBounce: false,
        explodeOnHit: false,
        explodeDamage: 0,
        explodeRadius: 0,
      });
    }
    return;
  }

  // --- X-DIAGONAL BULLETS: PHIERA / EIGHT SPARROW ---
  if (id === 'phiera' || id === 'eight_sparrow') {
    const offset = id === 'phiera' ? 0 : 0.14;
    const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
    const ironParams = ctx.catalog.arcanas.arcana_vii_iron_blue.params;
    const fireHeart = arcanaSet.has('arcana_xix_heart_of_fire') && id === 'phiera';
    const fireParams = ctx.catalog.arcanas.arcana_xix_heart_of_fire.params;

    for (let k = 0; k < amount; k++) {
      const quadrant = k % 4;
      const theta = Math.PI * (0.25 + quadrant * 0.5) + offset + Math.floor(k / 4) * 0.08;
      spawnPooledProjectile(ctx, {
        weaponId: id,
        vfxKey: def.vfxKey,
        behavior: 'straight',
        x: playerX,
        y: playerY,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        speed,
        radius: wStats.baseSize * areaScale,
        damage,
        knockback: wStats.knockback,
        pierceLeft: wStats.pierce + (ironBlue ? (ironParams.extraPierce ?? 2) : 0),
        bouncesLeft: ironBlue ? (ironParams.extraBounces ?? 3) : 0,
        maxLife: duration,
        critChance,
        critMult,
        lifestealOnCrit: 0,
        explodeOnBounce: false,
        explodeOnHit: fireHeart,
        explodeDamage: fireHeart ? (fireParams.explosionDamage ?? 32) * stats.might : 0,
        explodeRadius: fireHeart ? (fireParams.explosionRadius ?? 90) * stats.area : 0,
      });
    }
    return;
  }

  // --- VOLLEY PROJECTILES (Magic Wand, Holy Wand, Knife, Thousand Edge) ---
  if (
    id === 'magic_wand' ||
    id === 'holy_wand' ||
    id === 'knife' ||
    id === 'thousand_edge'
  ) {
    fireVolleyShot(
      ctx,
      slot,
      def,
      wStats,
      playerX,
      playerY,
      facingX,
      facingY,
      stats,
      arcanaSet,
      enemySystem,
      rng,
    );
    if (amount > 1) {
      slot.burstQueue = amount - 1;
      slot.burstTimer = id === 'knife' || id === 'thousand_edge' ? 0.045 : 0.07;
    }
    return;
  }

  // --- OTHER PROJECTILES ---
  for (let k = 0; k < amount; k++) {
    spawnSingleStandardProjectile(
      ctx,
      slot,
      def,
      wStats,
      k,
      amount,
      playerX,
      playerY,
      facingX,
      facingY,
      stats,
      arcanaSet,
      enemySystem,
      rng,
    );
  }
}

export function fireVolleyShot(
  ctx: WeaponRuntimeContext,
  slot: WeaponSlotState,
  def: WeaponDef,
  wStats: WeaponBaseStats,
  playerX: number,
  playerY: number,
  facingX: number,
  facingY: number,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
): void {
  const id = slot.weaponId;
  const areaScale = wStats.area * stats.area * (1 + slot.limitBreakArea);
  const { damage } = getEffectiveDamage(ctx.catalog, slot, wStats, stats, arcanaSet);
  const { critChance, critMult } = getEffectiveCrit(
    ctx.catalog,
    slot,
    wStats,
    stats,
    arcanaSet,
  );
  const speed = wStats.projectileSpeed * stats.speed;
  const duration = wStats.duration * stats.duration;

  if (id === 'magic_wand' || id === 'holy_wand') {
    let dirX = facingX;
    let dirY = facingY;
    const nearestIdx = enemySystem.grid.queryNearest(playerX, playerY, 720);
    if (nearestIdx !== -1) {
      const target = enemySystem.enemies[nearestIdx]!;
      const dx = target.x - playerX;
      const dy = target.y - playerY;
      const len = Math.hypot(dx, dy);
      if (len > 1e-4) {
        dirX = dx / len;
        dirY = dy / len;
      }
    }
    const waltz = arcanaSet.has('arcana_xi_waltz_pearls');
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: 'homing',
      x: playerX,
      y: playerY,
      vx: dirX * speed,
      vy: dirY * speed,
      speed,
      radius: wStats.baseSize * areaScale,
      damage,
      knockback: wStats.knockback,
      pierceLeft: wStats.pierce,
      bouncesLeft: waltz
        ? (ctx.catalog.arcanas.arcana_xi_waltz_pearls.params.extraBounces ?? 3)
        : 0,
      maxLife: duration,
      critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: false,
      explodeOnHit: false,
      explodeDamage: 0,
      explodeRadius: 0,
    });
    return;
  }

  // Knife / Thousand Edge
  const fLen = Math.hypot(facingX, facingY);
  const nx = fLen > 1e-4 ? facingX / fLen : 1;
  const ny = fLen > 1e-4 ? facingY / fLen : 0;
  const perpX = -ny;
  const perpY = nx;
  const jitter = rng.range(-10, 10);
  const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
  const ironParams = ctx.catalog.arcanas.arcana_vii_iron_blue.params;

  spawnPooledProjectile(ctx, {
    weaponId: id,
    vfxKey: def.vfxKey,
    behavior: 'straight',
    x: playerX + perpX * jitter,
    y: playerY + perpY * jitter,
    vx: nx * speed,
    vy: ny * speed,
    speed,
    radius: wStats.baseSize * areaScale,
    damage,
    knockback: wStats.knockback,
    pierceLeft: wStats.pierce + (ironBlue ? (ironParams.extraPierce ?? 2) : 0),
    bouncesLeft: ironBlue ? (ironParams.extraBounces ?? 3) : 0,
    maxLife: duration,
    critChance,
    critMult,
    lifestealOnCrit: 0,
    explodeOnBounce: false,
    explodeOnHit: false,
    explodeDamage: 0,
    explodeRadius: 0,
  });
}

function spawnSingleStandardProjectile(
  ctx: WeaponRuntimeContext,
  slot: WeaponSlotState,
  def: WeaponDef,
  wStats: WeaponBaseStats,
  index: number,
  total: number,
  playerX: number,
  playerY: number,
  facingX: number,
  facingY: number,
  stats: StatBlock,
  arcanaSet: Set<ArcanaId>,
  enemySystem: EnemySystem,
  rng: SeededRng,
): void {
  const id = slot.weaponId;
  const areaScale = wStats.area * stats.area * (1 + slot.limitBreakArea);
  const { damage } = getEffectiveDamage(ctx.catalog, slot, wStats, stats, arcanaSet);
  const { critChance, critMult } = getEffectiveCrit(
    ctx.catalog,
    slot,
    wStats,
    stats,
    arcanaSet,
  );
  const speed = wStats.projectileSpeed * stats.speed;
  const duration = wStats.duration * stats.duration;

  const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
  const ironParams = ctx.catalog.arcanas.arcana_vii_iron_blue.params;
  const waltz = arcanaSet.has('arcana_xi_waltz_pearls');
  const waltzParams = ctx.catalog.arcanas.arcana_xi_waltz_pearls.params;
  const fireHeart = arcanaSet.has('arcana_xix_heart_of_fire');
  const fireParams = ctx.catalog.arcanas.arcana_xix_heart_of_fire.params;

  if (id === 'axe') {
    const spreadSign = index % 2 === 0 ? 1 : -1;
    const vx = spreadSign * rng.range(70, 175) * stats.speed;
    const vy = -speed * rng.range(1.05, 1.25);
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: 'axe_arc',
      x: playerX,
      y: playerY,
      vx,
      vy,
      speed,
      radius: wStats.baseSize * areaScale * 0.6,
      damage,
      knockback: wStats.knockback,
      pierceLeft: wStats.pierce + (ironBlue ? (ironParams.extraPierce ?? 2) : 0),
      bouncesLeft: ironBlue ? (ironParams.extraBounces ?? 3) : 0,
      maxLife: duration,
      spinRate: 10 * spreadSign,
      critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: false,
      explodeOnHit: false,
      explodeDamage: 0,
      explodeRadius: 0,
    });
    return;
  }

  if (id === 'cross' || id === 'heaven_sword') {
    let angle = Math.atan2(facingY, facingX);
    const nearestIdx = enemySystem.grid.queryNearest(playerX, playerY, 620);
    if (nearestIdx !== -1) {
      const target = enemySystem.enemies[nearestIdx]!;
      angle = Math.atan2(target.y - playerY, target.x - playerX);
    }
    angle += (index - (total - 1) * 0.5) * 0.35;
    const bounces =
      waltz && ctx.catalog.arcanas.arcana_xi_waltz_pearls.affectedWeapons.includes(id)
        ? (waltzParams.extraBounces ?? 3)
        : 0;
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: 'boomerang',
      x: playerX,
      y: playerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      radius: wStats.baseSize * areaScale * 0.65,
      damage,
      knockback: wStats.knockback,
      pierceLeft: wStats.pierce,
      bouncesLeft: bounces,
      maxLife: duration,
      spinRate: 12,
      critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: false,
      explodeOnHit: false,
      explodeDamage: 0,
      explodeRadius: 0,
      boomerangReturnTime: duration * 0.34,
    });
    return;
  }

  if (id === 'fire_wand' || id === 'hellfire') {
    const candidates = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      560,
      ctx.queryScratch,
    );
    let baseAngle = rng.range(0, Math.PI * 2);
    if (candidates > 0) {
      const t = enemySystem.enemies[ctx.queryScratch[rng.int(0, candidates - 1)]!]!;
      baseAngle = Math.atan2(t.y - playerY, t.x - playerX);
    }
    const angle = baseAngle + (index - (total - 1) * 0.5) * 0.22;
    const heartApplies =
      fireHeart &&
      ctx.catalog.arcanas.arcana_xix_heart_of_fire.affectedWeapons.includes(id);
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: 'straight',
      x: playerX,
      y: playerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      radius: wStats.baseSize * areaScale * 0.6,
      damage,
      knockback: wStats.knockback,
      pierceLeft: wStats.pierce,
      bouncesLeft: waltz ? (waltzParams.extraBounces ?? 3) : 0,
      maxLife: duration,
      critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: false,
      explodeOnHit: heartApplies,
      explodeDamage: heartApplies ? (fireParams.explosionDamage ?? 32) * stats.might : 0,
      explodeRadius: heartApplies ? (fireParams.explosionRadius ?? 90) * stats.area : 0,
    });
    return;
  }

  if (id === 'runetracer' || id === 'no_future') {
    const angle = rng.range(0, Math.PI * 2);
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: 'runetracer',
      x: playerX,
      y: playerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      radius: wStats.baseSize * areaScale * 0.7,
      damage,
      knockback: wStats.knockback,
      pierceLeft: 999,
      bouncesLeft: 99,
      maxLife: duration,
      critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: id === 'no_future',
      explodeOnHit: false,
      explodeDamage: id === 'no_future' ? damage * 1.1 : 0,
      explodeRadius: id === 'no_future' ? 92 * areaScale : 0,
    });
    return;
  }

  if (id === 'bone' || id === 'cherry_bomb') {
    const candidates = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      480,
      ctx.queryScratch,
    );
    let angle = rng.range(0, Math.PI * 2);
    if (candidates > 0) {
      const t = enemySystem.enemies[ctx.queryScratch[rng.int(0, candidates - 1)]!]!;
      angle = Math.atan2(t.y - playerY, t.x - playerX);
    }
    const isCherry = id === 'cherry_bomb';
    const heartApplies =
      isCherry &&
      fireHeart &&
      ctx.catalog.arcanas.arcana_xix_heart_of_fire.affectedWeapons.includes(id);
    spawnPooledProjectile(ctx, {
      weaponId: id,
      vfxKey: def.vfxKey,
      behavior: isCherry ? 'cherry' : 'bone',
      x: playerX,
      y: playerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      speed,
      radius: wStats.baseSize * areaScale * 0.65,
      damage,
      knockback: wStats.knockback,
      pierceLeft:
        wStats.pierce + (ironBlue && !isCherry ? (ironParams.extraPierce ?? 2) : 0),
      bouncesLeft:
        wStats.pierce + (ironBlue && !isCherry ? (ironParams.extraBounces ?? 3) : 0),
      maxLife: duration,
      spinRate: 9,
      critChance: isCherry ? Math.min(0.95, critChance * stats.luck) : critChance,
      critMult,
      lifestealOnCrit: 0,
      explodeOnBounce: isCherry,
      explodeOnHit: isCherry || heartApplies,
      explodeDamage: isCherry
        ? damage * 1.25
        : heartApplies
          ? (fireParams.explosionDamage ?? 32) * stats.might
          : 0,
      explodeRadius: isCherry ? 72 * areaScale : 90 * stats.area,
    });
  }
}
