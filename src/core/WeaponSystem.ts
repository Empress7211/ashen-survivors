import type {
  ArcanaId,
  AudioCue,
  Catalog,
  RenderBeamState,
  RenderProjectileState,
  RenderZoneState,
  StageCorridorBounds,
  StatBlock,
  WeaponBaseStats,
  WeaponDamageSummary,
  WeaponDef,
  WeaponId,
  WeaponSlotSnapshot,
} from '../contracts/index.ts';
import type { EnemySystem } from './EnemySystem.ts';
import type { SeededRng } from './Rng.ts';

export interface WeaponSlotState {
  weaponId: WeaponId;
  level: number;
  maxLevel: number;
  isEvolved: boolean;
  limitBreakLevel: number;
  limitBreakMight: number;
  limitBreakArea: number;
  limitBreakCooldown: number;
  limitBreakAmount: number;
  cooldownTimer: number;
  burstQueue: number;
  burstTimer: number;
  burstAngleOffset: number;
  clockStep: number;
  orbitalAngle: number;
  laurelCharges: number;
  laurelRechargeTimer: number;
  totalDamage: number;
  activeSeconds: number;
}

interface ActiveProjectile {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  behavior:
    | 'straight'
    | 'homing'
    | 'axe_arc'
    | 'boomerang'
    | 'runetracer'
    | 'bone'
    | 'cherry';
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  radius: number;
  damage: number;
  knockback: number;
  pierceLeft: number;
  bouncesLeft: number;
  life: number;
  maxLife: number;
  rotation: number;
  spinRate: number;
  scale: number;
  alpha: number;
  critChance: number;
  critMult: number;
  lifestealOnCrit: number;
  explodeOnBounce: boolean;
  explodeOnHit: boolean;
  explodeDamage: number;
  explodeRadius: number;
  boomerangReturnTime: number;
  boomerangReversed: boolean;
  hitCooldowns: Map<number, number>;
  lastHitTick: number;
}

interface ActiveZone {
  uid: number;
  kind: RenderZoneState['kind'];
  weaponId?: WeaponId;
  vfxKey: string;
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  radius: number;
  baseRadius: number;
  maxRadius: number;
  damage: number;
  knockback: number;
  tickInterval: number;
  tickTimer: number;
  life: number;
  maxLife: number;
  rotation: number;
  alpha: number;
  flipX?: boolean;
  tint?: number;
  creeping: boolean;
  critChance: number;
  critMult: number;
  lifestealOnCrit: number;
  secondPulsePending?: boolean;
  hitCooldowns: Map<number, number>;
}

interface ActiveBeam {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  angle: number;
  spinRate: number;
  length: number;
  width: number;
  damage: number;
  knockback: number;
  life: number;
  maxLife: number;
  tickTimer: number;
  critChance: number;
  critMult: number;
  explodeOnHit: boolean;
  color: number;
}

interface ActiveOrbiter {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  angle: number;
  orbitRadius: number;
  angularSpeed: number;
  hitRadius: number;
  damage: number;
  knockback: number;
  life: number;
  permanent: boolean;
  hitCooldowns: Map<number, number>;
}

export interface WeaponCombatHooks {
  onAudioCue(cue: AudioCue): void;
  onHealPlayer(amount: number, sourceWeapon?: WeaponId): void;
  onFloatingText(
    x: number,
    y: number,
    text: string,
    kind: 'damage' | 'crit' | 'heal' | 'xp' | 'gold' | 'status',
  ): void;
  onEnemyKilled(
    enemyId: import('../contracts/ids.ts').EnemyId,
    x: number,
    y: number,
    xpValue: number,
    xpTier: 'xp_blue' | 'xp_green' | 'xp_red' | 'xp_gold',
    isBoss: boolean,
    isReaper: boolean,
    chestTier?: import('../contracts/ids.ts').ChestTier,
    canEvolveChest?: boolean,
    fromRetaliation?: boolean,
  ): void;
  onPropBroken(x: number, y: number): void;
  onPentagramTriggered(eraseChance: number, vacuumAndRain: boolean): void;
  onFreezeTriggered(x: number, y: number): void;
  onScreenEffect(flash: { color: number; alpha: number } | null, shake: number): void;
}

const NO_PLAYER_AMOUNT_WEAPONS = new Set<WeaponId>([
  'garlic',
  'soul_eater',
  'pentagram',
  'gorgeous_moon',
  'clock_lancet',
  'laurel',
]);

export class WeaponSystem {
  readonly catalog: Catalog;
  readonly slots: WeaponSlotState[] = [];
  readonly damageHistory = new Map<WeaponId, WeaponDamageSummary>();

  private projectiles: ActiveProjectile[] = [];
  private zones: ActiveZone[] = [];
  private beams: ActiveBeam[] = [];
  private orbiters: ActiveOrbiter[] = [];
  private nextUid = 1;
  private readonly queryScratch: number[] = [];
  private whipSlashToggle = 0;

  constructor(catalog: Catalog) {
    this.catalog = catalog;
  }

  addOrUpgradeWeapon(weaponId: WeaponId): WeaponSlotState | null {
    const existing = this.slots.find((s) => s.weaponId === weaponId);
    const def = this.catalog.weapons[weaponId];
    if (existing) {
      if (existing.level < existing.maxLevel) {
        existing.level++;
        if (weaponId === 'laurel') {
          const stats = this.computeWeaponEffectiveBase(existing);
          existing.laurelCharges = Math.max(existing.laurelCharges, stats.amount);
        }
      }
      this.syncDamageHistory(existing);
      return existing;
    }

    const slot: WeaponSlotState = {
      weaponId,
      level: 1,
      maxLevel: def.maxLevel,
      isEvolved: def.isEvolved,
      limitBreakLevel: 0,
      limitBreakMight: 0,
      limitBreakArea: 0,
      limitBreakCooldown: 0,
      limitBreakAmount: 0,
      cooldownTimer: 0.05,
      burstQueue: 0,
      burstTimer: 0,
      burstAngleOffset: 0,
      clockStep: 0,
      orbitalAngle: 0,
      laurelCharges: weaponId === 'laurel' ? def.baseStats.amount : 0,
      laurelRechargeTimer: 0,
      totalDamage: 0,
      activeSeconds: 0,
    };
    this.slots.push(slot);
    this.syncDamageHistory(slot);
    return slot;
  }

  applyLimitBreak(
    weaponId: WeaponId,
    stat: 'might' | 'area' | 'cooldown' | 'amount',
  ): boolean {
    const slot = this.slots.find((s) => s.weaponId === weaponId);
    if (!slot) return false;
    slot.limitBreakLevel += 1;
    if (stat === 'might') slot.limitBreakMight += 0.15;
    else if (stat === 'area') slot.limitBreakArea += 0.08;
    else if (stat === 'cooldown') slot.limitBreakCooldown += 0.025;
    else if (stat === 'amount') slot.limitBreakAmount += 1;
    return true;
  }

  evolveWeapon(
    baseWeaponId: WeaponId,
    evolvedWeaponId: WeaponId,
    partnerWeaponId?: WeaponId,
  ): boolean {
    const idx = this.slots.findIndex((s) => s.weaponId === baseWeaponId);
    if (idx === -1) return false;
    const baseSlot = this.slots[idx]!;
    this.syncDamageHistory(baseSlot);

    // Clear old orbiters belonging to replaced weapons
    this.orbiters = this.orbiters.filter(
      (o) => o.weaponId !== baseWeaponId && o.weaponId !== partnerWeaponId,
    );

    if (partnerWeaponId) {
      const pIdx = this.slots.findIndex((s) => s.weaponId === partnerWeaponId);
      if (pIdx !== -1 && pIdx !== idx) {
        this.syncDamageHistory(this.slots[pIdx]!);
        this.slots.splice(pIdx, 1);
      }
    }

    const newIdx = this.slots.findIndex((s) => s.weaponId === baseWeaponId);
    if (newIdx === -1) return false;

    const evolvedDef = this.catalog.weapons[evolvedWeaponId];
    this.slots[newIdx] = {
      weaponId: evolvedWeaponId,
      level: 1,
      maxLevel: evolvedDef.maxLevel,
      isEvolved: true,
      limitBreakLevel: 0,
      limitBreakMight: 0,
      limitBreakArea: 0,
      limitBreakCooldown: 0,
      limitBreakAmount: 0,
      cooldownTimer: 0.05,
      burstQueue: 0,
      burstTimer: 0,
      burstAngleOffset: 0,
      clockStep: 0,
      orbitalAngle: 0,
      laurelCharges: 0,
      laurelRechargeTimer: 0,
      totalDamage: 0,
      activeSeconds: 0,
    };
    this.syncDamageHistory(this.slots[newIdx]!);
    return true;
  }

  getSlotSnapshots(): WeaponSlotSnapshot[] {
    return this.slots.map((s) => ({
      weaponId: s.weaponId,
      level: s.level,
      maxLevel: s.maxLevel,
      isEvolved: s.isEvolved,
      limitBreakLevel: s.limitBreakLevel,
    }));
  }

  getLaurelCharges(): number {
    const slot = this.slots.find((s) => s.weaponId === 'laurel');
    return slot ? slot.laurelCharges : 0;
  }

  tryConsumeLaurelShield(
    playerX: number,
    playerY: number,
    stats: StatBlock,
    arcanas: readonly ArcanaId[],
    enemySystem: EnemySystem,
    rng: SeededRng,
    hooks: WeaponCombatHooks,
  ): { blocked: boolean; invulnSeconds: number } {
    const slot = this.slots.find((s) => s.weaponId === 'laurel');
    if (!slot || slot.laurelCharges <= 0) {
      return { blocked: false, invulnSeconds: 0 };
    }
    const wStats = this.computeWeaponEffectiveBase(slot);
    slot.laurelCharges -= 1;
    const invulnSeconds = wStats.duration * stats.duration;
    const radius = wStats.baseSize * wStats.area * stats.area;

    // Visual shield burst
    this.zones.push({
      uid: this.nextUid++,
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
      hitCooldowns: new Map(),
    });

    // Arcana IX Divine Bloodline / Arcana XIX Heart of Fire countershock on shield pop
    const hasDivine = arcanas.includes('arcana_ix_divine_bloodline');
    const hasFireHeart = arcanas.includes('arcana_xix_heart_of_fire');
    const counterRadius = hasDivine || hasFireHeart ? radius * 1.8 : radius;
    const counterDmg =
      (hasDivine ? Math.max(20, stats.armor * 18) : 0) +
      (hasFireHeart ? (this.catalog.arcanas.arcana_xix_heart_of_fire.params.explosionDamage ?? 32) : 0);

    const count = enemySystem.grid.queryRadius(
      playerX,
      playerY,
      counterRadius,
      this.queryScratch,
    );
    for (let i = 0; i < count; i++) {
      const idx = this.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      if (counterDmg > 0) {
        this.applyDamageToEnemy(
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
      const fireParams = this.catalog.arcanas.arcana_xix_heart_of_fire.params;
      const numBolts = fireParams.retaliationCount ?? 6;
      for (let b = 0; b < numBolts; b++) {
        const theta = (b / numBolts) * Math.PI * 2 + rng.range(-0.15, 0.15);
        this.spawnProjectile({
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

  getGarlicRenderRadius(stats: StatBlock): { radius: number; soulEaterActive: boolean } {
    const soul = this.slots.find((s) => s.weaponId === 'soul_eater');
    if (soul) {
      const ws = this.computeWeaponEffectiveBase(soul);
      return {
        radius: ws.baseSize * ws.area * stats.area * (1 + soul.limitBreakArea),
        soulEaterActive: true,
      };
    }
    const garlic = this.slots.find((s) => s.weaponId === 'garlic');
    if (garlic) {
      const ws = this.computeWeaponEffectiveBase(garlic);
      return {
        radius: ws.baseSize * ws.area * stats.area * (1 + garlic.limitBreakArea),
        soulEaterActive: false,
      };
    }
    return { radius: 0, soulEaterActive: false };
  }

  update(
    dt: number,
    playerX: number,
    playerY: number,
    facingX: number,
    facingY: number,
    stats: StatBlock,
    arcanas: readonly ArcanaId[],
    enemySystem: EnemySystem,
    rng: SeededRng,
    corridorBounds: StageCorridorBounds | undefined,
    hooks: WeaponCombatHooks,
  ): void {
    const arcanaSet = new Set(arcanas);

    // 1. Update slot timers & fire weapons
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      slot.activeSeconds += dt;
      const def = this.catalog.weapons[slot.weaponId];
      const wStats = this.computeWeaponEffectiveBase(slot);

      if (slot.weaponId === 'laurel') {
        const maxCharges = wStats.amount;
        if (slot.laurelCharges < maxCharges) {
          const cd = Math.max(0.5, wStats.cooldown * stats.cooldown);
          slot.laurelRechargeTimer += dt;
          if (slot.laurelRechargeTimer >= cd) {
            slot.laurelRechargeTimer -= cd;
            slot.laurelCharges++;
          }
        } else {
          slot.laurelRechargeTimer = 0;
        }
        continue;
      }

      if (slot.weaponId === 'unholy_vespers') {
        this.ensurePermanentOrbiters(
          slot,
          def,
          wStats,
          playerX,
          playerY,
          stats,
          arcanaSet,
        );
        continue;
      }

      // Sequential volley burst queue (knife / magic_wand / phiera / eight_sparrow)
      if (slot.burstQueue > 0) {
        slot.burstTimer -= dt;
        if (slot.burstTimer <= 0) {
          slot.burstQueue -= 1;
          slot.burstTimer = slot.weaponId === 'knife' || slot.weaponId === 'thousand_edge' ? 0.045 : 0.07;
          this.fireVolleyShot(
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
        }
      }

      slot.cooldownTimer -= dt;
      if (slot.cooldownTimer <= 0) {
        const cdScale = Math.max(0.25, 1 - slot.limitBreakCooldown);
        const effCooldown = Math.max(0.05, wStats.cooldown * cdScale * stats.cooldown);
        slot.cooldownTimer = effCooldown;

        this.triggerWeapon(
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
          hooks,
        );
      }
    }

    // 2. Update Orbiters (King Bible / Unholy Vespers)
    this.updateOrbiters(dt, playerX, playerY, stats, arcanaSet, enemySystem, rng, hooks);

    // 3. Update Projectiles
    this.updateProjectiles(
      dt,
      playerX,
      playerY,
      stats,
      arcanaSet,
      enemySystem,
      rng,
      corridorBounds,
      hooks,
    );

    // 4. Update Zones
    this.updateZones(
      dt,
      playerX,
      playerY,
      stats,
      arcanaSet,
      enemySystem,
      rng,
      hooks,
    );

    // 5. Update Beams (Phieraggi)
    this.updateBeams(dt, playerX, playerY, stats, arcanaSet, enemySystem, rng, hooks);
  }

  getWeaponBreakdown(): WeaponDamageSummary[] {
    for (const s of this.slots) {
      this.syncDamageHistory(s);
    }
    return Array.from(this.damageHistory.values()).sort(
      (a, b) => b.totalDamage - a.totalDamage,
    );
  }

  getRenderProjectiles(): RenderProjectileState[] {
    return this.projectiles.map((p) => ({
      uid: p.uid,
      weaponId: p.weaponId,
      vfxKey: p.vfxKey,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      rotation: p.rotation,
      scale: p.scale,
      alpha: p.alpha,
    }));
  }

  getRenderZones(): RenderZoneState[] {
    const out: RenderZoneState[] = [];
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i]!;
      out.push({
        uid: z.uid,
        kind: z.kind,
        weaponId: z.weaponId,
        vfxKey: z.vfxKey,
        x: z.x,
        y: z.y,
        endX: z.endX,
        endY: z.endY,
        radius: z.radius,
        rotation: z.rotation,
        progress: z.maxLife > 0 ? 1 - z.life / z.maxLife : 1,
        alpha: z.alpha,
        flipX: z.flipX,
        tint: z.tint,
      });
    }
    // Include orbiters as renderable projectiles so renderer renders Bible/Vespers tomes cleanly!
    return out;
  }

  getRenderProjectilesAndOrbiters(playerX: number, playerY: number): RenderProjectileState[] {
    const out = this.getRenderProjectiles();
    for (let i = 0; i < this.orbiters.length; i++) {
      const o = this.orbiters[i]!;
      out.push({
        uid: o.uid,
        weaponId: o.weaponId,
        vfxKey: o.vfxKey,
        x: playerX + Math.cos(o.angle) * o.orbitRadius,
        y: playerY + Math.sin(o.angle) * o.orbitRadius,
        vx: 0,
        vy: 0,
        rotation: o.angle + Math.PI * 0.5,
        scale: Math.max(0.85, o.hitRadius / 22),
        alpha: 1,
      });
    }
    return out;
  }

  getRenderBeams(playerX: number, playerY: number): RenderBeamState[] {
    return this.beams.map((b) => ({
      uid: b.uid,
      weaponId: b.weaponId,
      vfxKey: b.vfxKey,
      x1: playerX,
      y1: playerY,
      x2: playerX + Math.cos(b.angle) * b.length,
      y2: playerY + Math.sin(b.angle) * b.length,
      width: b.width,
      alpha: Math.min(1, b.life * 4),
      color: b.color,
    }));
  }

  private syncDamageHistory(slot: WeaponSlotState): void {
    const def = this.catalog.weapons[slot.weaponId];
    const activeSec = Math.max(0.01, slot.activeSeconds);
    this.damageHistory.set(slot.weaponId, {
      weaponId: slot.weaponId,
      name: def.name,
      level: slot.level,
      isEvolved: slot.isEvolved,
      totalDamage: Math.round(slot.totalDamage),
      dps: Math.round(slot.totalDamage / activeSec),
      activeSeconds: Number(slot.activeSeconds.toFixed(1)),
    });
  }

  private computeWeaponEffectiveBase(slot: WeaponSlotState): WeaponBaseStats {
    const def = this.catalog.weapons[slot.weaponId];
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

  private getEffectiveAmount(slot: WeaponSlotState, wStats: WeaponBaseStats, stats: StatBlock): number {
    if (NO_PLAYER_AMOUNT_WEAPONS.has(slot.weaponId)) {
      return Math.max(1, wStats.amount);
    }
    return Math.max(1, wStats.amount + stats.amount + slot.limitBreakAmount);
  }

  private getEffectiveDamage(
    slot: WeaponSlotState,
    wStats: WeaponBaseStats,
    stats: StatBlock,
    arcanaSet: Set<ArcanaId>,
  ): { damage: number; divineApplies: boolean } {
    let baseDmg = wStats.damage;
    let divineApplies = false;
    if (arcanaSet.has('arcana_ix_divine_bloodline')) {
      const def = this.catalog.arcanas.arcana_ix_divine_bloodline;
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

  private getEffectiveCrit(
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
      const def = this.catalog.arcanas.arcana_xvi_slash;
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

  private triggerWeapon(
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
    const amount = this.getEffectiveAmount(slot, wStats, stats);
    const { damage, divineApplies } = this.getEffectiveDamage(
      slot,
      wStats,
      stats,
      arcanaSet,
    );
    const { critChance, critMult } = this.getEffectiveCrit(
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
        this.whipSlashToggle++;

        const minX = cx - slashW * 0.5;
        const maxX = cx + slashW * 0.5;
        const minY = cy - slashH * 0.5;
        const maxY = cy + slashH * 0.5;

        const count = enemySystem.grid.queryRect(
          minX,
          minY,
          maxX,
          maxY,
          this.queryScratch,
        );
        for (let eIdx = 0; eIdx < count; eIdx++) {
          const idx = this.queryScratch[eIdx]!;
          const isCrit = rng.chance(critChance);
          const dmg = isCrit ? damage * critMult : damage;
          this.applyDamageToEnemy(
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
        this.damagePropsInRect(enemySystem, minX, minY, maxX, maxY, damage, hooks);

        this.zones.push({
          uid: this.nextUid++,
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
          hitCooldowns: new Map(),
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
        this.queryScratch,
      );
      let healedAny = false;
      for (let i = 0; i < count; i++) {
        const idx = this.queryScratch[i]!;
        const e = enemySystem.enemies[idx];
        if (!e || !e.alive) continue;
        enemySystem.applyGarlicDebuff(idx, 1.5);
        this.applyDamageToEnemy(
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
      this.damagePropsInRadius(enemySystem, playerX, playerY, radius, damage, hooks);

      this.zones.push({
        uid: this.nextUid++,
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
        life: Math.min(0.45, Math.max(0.2, wStats.cooldown * stats.cooldown)),
        maxLife: Math.min(0.45, Math.max(0.2, wStats.cooldown * stats.cooldown)),
        rotation: 0,
        alpha: 0.55,
        creeping: false,
        critChance: 0,
        critMult: 1,
        lifestealOnCrit: 0,
        hitCooldowns: new Map(),
      });
      return;
    }

    // --- ORBIT: KING BIBLE ---
    if (id === 'king_bible') {
      const orbitR = wStats.baseSize * areaScale;
      const angularSpeed = speed / Math.max(40, orbitR);
      for (let k = 0; k < amount; k++) {
        this.orbiters.push({
          uid: this.nextUid++,
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
        this.queryScratch,
      );
      for (let i = 0; i < count; i++) {
        const idx = this.queryScratch[i]!;
        const e = enemySystem.enemies[idx];
        if (!e || !e.alive || e.isBoss || e.isReaper) continue;
        this.applyDamageToEnemy(
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
      this.damagePropsInRadius(enemySystem, playerX, playerY, wipeRadius, 999, hooks);

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

      this.zones.push({
        uid: this.nextUid++,
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
        hitCooldowns: new Map(),
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
        this.queryScratch,
      );
      let frozeAny = false;
      for (let i = 0; i < count; i++) {
        const idx = this.queryScratch[i]!;
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

      this.zones.push({
        uid: this.nextUid++,
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
        hitCooldowns: new Map(),
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
        this.queryScratch,
      );
      for (let k = 0; k < amount; k++) {
        let tx = playerX + rng.range(-480, 480);
        let ty = playerY + rng.range(-280, 280);
        if (candidates > 0) {
          const pickedIdx = this.queryScratch[rng.int(0, candidates - 1)]!;
          const target = enemySystem.enemies[pickedIdx];
          if (target && target.alive) {
            tx = target.x;
            ty = target.y;
          }
        }
        this.triggerLightningStrike(
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
        this.queryScratch,
      );
      for (let k = 0; k < amount; k++) {
        let tx = playerX + rng.range(-280, 280);
        let ty = playerY + rng.range(-200, 200);
        if (candidates > 0 && k < candidates) {
          const pickedIdx = this.queryScratch[rng.int(0, candidates - 1)]!;
          const e = enemySystem.enemies[pickedIdx];
          if (e && e.alive) {
            tx = e.x + rng.range(-30, 30);
            ty = e.y + rng.range(-30, 30);
          }
        }
        this.zones.push({
          uid: this.nextUid++,
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
          hitCooldowns: new Map(),
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
      for (const sOffset of sectors) {
        const centerAngle = slot.orbitalAngle + sOffset;
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
            this.queryScratch,
          );
          for (let eIdx = 0; eIdx < hitCount; eIdx++) {
            const idx = this.queryScratch[eIdx]!;
            const e = enemySystem.enemies[idx];
            if (!e || !e.alive) continue;
            this.applyDamageToEnemy(
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
          this.damagePropsInRadius(enemySystem, bx, by, blastRadius, dmg, hooks);

          this.zones.push({
            uid: this.nextUid++,
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
            tint: id === 'ebony_wings' ? 0x9b5de5 : id === 'peachone' ? 0xfff3b0 : 0xff66cc,
            creeping: false,
            critChance: 0,
            critMult: 1,
            lifestealOnCrit: 0,
            hitCooldowns: new Map(),
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
        this.beams.push({
          uid: this.nextUid++,
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
      const ironParams = this.catalog.arcanas.arcana_vii_iron_blue.params;
      for (let k = 0; k < amount; k++) {
        const theta = baseAngle + (k / amount) * Math.PI * 2;
        this.spawnProjectile({
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
      const baseAngles =
        id === 'phiera'
          ? [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]
          : [Math.PI * 0.25 + 0.14, Math.PI * 0.75 + 0.14, Math.PI * 1.25 + 0.14, Math.PI * 1.75 + 0.14];
      const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
      const ironParams = this.catalog.arcanas.arcana_vii_iron_blue.params;
      const fireHeart = arcanaSet.has('arcana_xix_heart_of_fire') && id === 'phiera';
      const fireParams = this.catalog.arcanas.arcana_xix_heart_of_fire.params;

      for (let k = 0; k < amount; k++) {
        const theta = baseAngles[k % 4]! + Math.floor(k / 4) * 0.08;
        this.spawnProjectile({
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
      this.fireVolleyShot(
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

    // --- OTHER PROJECTILES (Axe, Cross, Heaven Sword, Fire Wand, Hellfire, Runetracer, No Future, Bone, Cherry Bomb) ---
    for (let k = 0; k < amount; k++) {
      this.spawnSingleStandardProjectile(
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

  private fireVolleyShot(
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
    const { damage } = this.getEffectiveDamage(slot, wStats, stats, arcanaSet);
    const { critChance, critMult } = this.getEffectiveCrit(
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
      this.spawnProjectile({
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
        bouncesLeft: waltz ? (this.catalog.arcanas.arcana_xi_waltz_pearls.params.extraBounces ?? 3) : 0,
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
    const ironParams = this.catalog.arcanas.arcana_vii_iron_blue.params;

    this.spawnProjectile({
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

  private spawnSingleStandardProjectile(
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
    const { damage } = this.getEffectiveDamage(slot, wStats, stats, arcanaSet);
    const { critChance, critMult } = this.getEffectiveCrit(
      slot,
      wStats,
      stats,
      arcanaSet,
    );
    const speed = wStats.projectileSpeed * stats.speed;
    const duration = wStats.duration * stats.duration;

    const ironBlue = arcanaSet.has('arcana_vii_iron_blue');
    const ironParams = this.catalog.arcanas.arcana_vii_iron_blue.params;
    const waltz = arcanaSet.has('arcana_xi_waltz_pearls');
    const waltzParams = this.catalog.arcanas.arcana_xi_waltz_pearls.params;
    const fireHeart = arcanaSet.has('arcana_xix_heart_of_fire');
    const fireParams = this.catalog.arcanas.arcana_xix_heart_of_fire.params;

    if (id === 'axe') {
      const spreadSign = index % 2 === 0 ? 1 : -1;
      const vx = spreadSign * rng.range(70, 175) * stats.speed;
      const vy = -speed * rng.range(1.05, 1.25);
      this.spawnProjectile({
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
        waltz && this.catalog.arcanas.arcana_xi_waltz_pearls.affectedWeapons.includes(id)
          ? (waltzParams.extraBounces ?? 3)
          : 0;
      this.spawnProjectile({
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
        this.queryScratch,
      );
      let baseAngle = rng.range(0, Math.PI * 2);
      if (candidates > 0) {
        const t = enemySystem.enemies[this.queryScratch[rng.int(0, candidates - 1)]!]!;
        baseAngle = Math.atan2(t.y - playerY, t.x - playerX);
      }
      const angle = baseAngle + (index - (total - 1) * 0.5) * 0.22;
      const heartApplies =
        fireHeart &&
        this.catalog.arcanas.arcana_xix_heart_of_fire.affectedWeapons.includes(id);
      this.spawnProjectile({
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
      this.spawnProjectile({
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
        this.queryScratch,
      );
      let angle = rng.range(0, Math.PI * 2);
      if (candidates > 0) {
        const t = enemySystem.enemies[this.queryScratch[rng.int(0, candidates - 1)]!]!;
        angle = Math.atan2(t.y - playerY, t.x - playerX);
      }
      const isCherry = id === 'cherry_bomb';
      const heartApplies =
        isCherry &&
        fireHeart &&
        this.catalog.arcanas.arcana_xix_heart_of_fire.affectedWeapons.includes(id);
      this.spawnProjectile({
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
        pierceLeft: wStats.pierce + (ironBlue && !isCherry ? (ironParams.extraPierce ?? 2) : 0),
        bouncesLeft: wStats.pierce + (ironBlue && !isCherry ? (ironParams.extraBounces ?? 3) : 0),
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

  private spawnProjectile(opts: {
    weaponId: WeaponId;
    vfxKey: string;
    behavior: ActiveProjectile['behavior'];
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    radius: number;
    damage: number;
    knockback: number;
    pierceLeft: number;
    bouncesLeft: number;
    maxLife: number;
    spinRate?: number;
    critChance: number;
    critMult: number;
    lifestealOnCrit: number;
    explodeOnBounce: boolean;
    explodeOnHit: boolean;
    explodeDamage: number;
    explodeRadius: number;
    boomerangReturnTime?: number;
  }): void {
    this.projectiles.push({
      uid: this.nextUid++,
      weaponId: opts.weaponId,
      vfxKey: opts.vfxKey,
      behavior: opts.behavior,
      x: opts.x,
      y: opts.y,
      vx: opts.vx,
      vy: opts.vy,
      speed: opts.speed,
      radius: opts.radius,
      damage: opts.damage,
      knockback: opts.knockback,
      pierceLeft: opts.pierceLeft,
      bouncesLeft: opts.bouncesLeft,
      life: opts.maxLife,
      maxLife: opts.maxLife,
      rotation: Math.atan2(opts.vy, opts.vx),
      spinRate: opts.spinRate ?? 0,
      scale: Math.max(0.75, opts.radius / 22),
      alpha: 1,
      critChance: opts.critChance,
      critMult: opts.critMult,
      lifestealOnCrit: opts.lifestealOnCrit,
      explodeOnBounce: opts.explodeOnBounce,
      explodeOnHit: opts.explodeOnHit,
      explodeDamage: opts.explodeDamage,
      explodeRadius: opts.explodeRadius,
      boomerangReturnTime: opts.boomerangReturnTime ?? 0.6,
      boomerangReversed: false,
      hitCooldowns: new Map(),
      lastHitTick: 0,
    });
  }

  private ensurePermanentOrbiters(
    slot: WeaponSlotState,
    def: WeaponDef,
    wStats: WeaponBaseStats,
    playerX: number,
    playerY: number,
    stats: StatBlock,
    arcanaSet: Set<ArcanaId>,
  ): void {
    const targetCount = this.getEffectiveAmount(slot, wStats, stats);
    const areaScale = wStats.area * stats.area * (1 + slot.limitBreakArea);
    const orbitR = wStats.baseSize * areaScale;
    const speed = wStats.projectileSpeed * stats.speed;
    const angularSpeed = speed / Math.max(40, orbitR);
    const { damage } = this.getEffectiveDamage(slot, wStats, stats, arcanaSet);

    const existing = this.orbiters.filter(
      (o) => o.weaponId === slot.weaponId && o.permanent,
    );
    if (existing.length !== targetCount) {
      this.orbiters = this.orbiters.filter((o) => o.weaponId !== slot.weaponId);
      for (let k = 0; k < targetCount; k++) {
        this.orbiters.push({
          uid: this.nextUid++,
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
      for (let k = 0; k < existing.length; k++) {
        const o = existing[k]!;
        o.orbitRadius = orbitR;
        o.angularSpeed = angularSpeed;
        o.hitRadius = 28 * areaScale;
        o.damage = damage;
      }
      if (existing[0]) {
        slot.orbitalAngle = existing[0].angle;
      }
    }
    void playerX;
    void playerY;
  }

  private updateOrbiters(
    dt: number,
    playerX: number,
    playerY: number,
    stats: StatBlock,
    arcanaSet: Set<ArcanaId>,
    enemySystem: EnemySystem,
    rng: SeededRng,
    hooks: WeaponCombatHooks,
  ): void {
    const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');
    let i = 0;
    while (i < this.orbiters.length) {
      const o = this.orbiters[i]!;
      o.angle += o.angularSpeed * dt;
      if (!o.permanent) {
        o.life -= dt;
        if (o.life <= 0) {
          this.orbiters.splice(i, 1);
          continue;
        }
      }

      // Tick hit cooldowns
      for (const [uid, rem] of o.hitCooldowns.entries()) {
        if (rem - dt <= 0) o.hitCooldowns.delete(uid);
        else o.hitCooldowns.set(uid, rem - dt);
      }

      const ox = playerX + Math.cos(o.angle) * o.orbitRadius;
      const oy = playerY + Math.sin(o.angle) * o.orbitRadius;
      const slot = this.slots.find((s) => s.weaponId === o.weaponId);

      const count = enemySystem.grid.queryRadius(
        ox,
        oy,
        o.hitRadius,
        this.queryScratch,
      );
      for (let eIdx = 0; eIdx < count; eIdx++) {
        const idx = this.queryScratch[eIdx]!;
        const e = enemySystem.enemies[idx];
        if (!e || !e.alive || o.hitCooldowns.has(e.uid)) continue;
        o.hitCooldowns.set(e.uid, 0.32);
        this.applyDamageToEnemy(
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
      this.damagePropsInRadius(enemySystem, ox, oy, o.hitRadius, o.damage, hooks);
      i++;
    }
    void stats;
    void rng;
  }

  private updateProjectiles(
    dt: number,
    playerX: number,
    playerY: number,
    stats: StatBlock,
    arcanaSet: Set<ArcanaId>,
    enemySystem: EnemySystem,
    rng: SeededRng,
    corridorBounds: StageCorridorBounds | undefined,
    hooks: WeaponCombatHooks,
  ): void {
    const viewHalfW = 630;
    const viewHalfH = 355;
    const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');

    let i = 0;
    while (i < this.projectiles.length) {
      const p = this.projectiles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.projectiles.splice(i, 1);
        continue;
      }

      for (const [uid, rem] of p.hitCooldowns.entries()) {
        if (rem - dt <= 0) p.hitCooldowns.delete(uid);
        else p.hitCooldowns.set(uid, rem - dt);
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
          // Push opposite to original launch direction
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
      const minX = Math.max(
        playerX - viewHalfW,
        corridorBounds?.minX ?? -Infinity,
      );
      const maxX = Math.min(
        playerX + viewHalfW,
        corridorBounds?.maxX ?? Infinity,
      );
      const minY = Math.max(
        playerY - viewHalfH,
        corridorBounds?.minY ?? -Infinity,
      );
      const maxY = Math.min(
        playerY + viewHalfH,
        corridorBounds?.maxY ?? Infinity,
      );

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
            this.triggerSubExplosion(
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

      const slot = this.slots.find((s) => s.weaponId === p.weaponId);

      // Enemy collision
      const count = enemySystem.grid.queryRadius(
        p.x,
        p.y,
        p.radius,
        this.queryScratch,
      );
      let consumed = false;
      for (let eIdx = 0; eIdx < count; eIdx++) {
        const idx = this.queryScratch[eIdx]!;
        const e = enemySystem.enemies[idx];
        if (!e || !e.alive || p.hitCooldowns.has(e.uid)) continue;

        p.hitCooldowns.set(e.uid, p.pierceLeft > 10 ? 0.22 : 0.45);
        const isCrit = rng.chance(p.critChance);
        const dmg = isCrit ? p.damage * p.critMult : p.damage;

        this.applyDamageToEnemy(
          enemySystem,
          idx,
          dmg,
          slot,
          p.vx,
          p.vy,
          p.knockback,
          isCrit,
          isCrit ? p.lifestealOnCrit : 0,
          divineActive &&
            this.catalog.arcanas.arcana_ix_divine_bloodline.affectedWeapons.includes(
              p.weaponId,
            ),
          hooks,
        );

        if (p.explodeOnHit) {
          const triggerBlast =
            p.behavior !== 'cherry' || rng.chance(p.critChance);
          if (triggerBlast) {
            this.triggerSubExplosion(
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
          const nextIdx = enemySystem.grid.queryNearest(
            p.x,
            p.y,
            340,
            (cand) => {
              const ce = enemySystem.enemies[cand];
              return Boolean(ce && ce.alive && ce.uid !== e.uid);
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
        this.damagePropsInRadius(enemySystem, p.x, p.y, p.radius, p.damage, hooks);
      }

      if (consumed) {
        this.projectiles.splice(i, 1);
      } else {
        i++;
      }
    }
    void stats;
  }

  private updateZones(
    dt: number,
    playerX: number,
    playerY: number,
    stats: StatBlock,
    arcanaSet: Set<ArcanaId>,
    enemySystem: EnemySystem,
    rng: SeededRng,
    hooks: WeaponCombatHooks,
  ): void {
    const divineActive = arcanaSet.has('arcana_ix_divine_bloodline');
    let i = 0;
    while (i < this.zones.length) {
      const z = this.zones[i]!;
      z.life -= dt;
      if (z.life <= 0) {
        if (z.secondPulsePending && z.weaponId) {
          const slot = this.slots.find((s) => s.weaponId === z.weaponId);
          this.triggerLightningStrike(
            z.x,
            z.y,
            z.radius * 1.25,
            z.damage * 0.85,
            z.knockback,
            z.critChance,
            z.critMult,
            slot,
            'lightning_bolt',
            false,
            enemySystem,
            rng,
            hooks,
          );
        }
        this.zones.splice(i, 1);
        continue;
      }

      // Follow player for active aura
      if (z.kind === 'aura') {
        z.x = playerX;
        z.y = playerY;
      }

      // La Borra creeping & growing pool
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
          const slot = z.weaponId
            ? this.slots.find((s) => s.weaponId === z.weaponId)
            : undefined;
          const count = enemySystem.grid.queryRadius(
            z.x,
            z.y,
            z.radius,
            this.queryScratch,
          );
          for (let eIdx = 0; eIdx < count; eIdx++) {
            const idx = this.queryScratch[eIdx]!;
            this.applyDamageToEnemy(
              enemySystem,
              idx,
              z.damage,
              slot,
              0,
              0,
              z.knockback,
              false,
              0,
              divineActive &&
                Boolean(
                  z.weaponId &&
                    this.catalog.arcanas.arcana_ix_divine_bloodline.affectedWeapons.includes(
                      z.weaponId,
                    ),
                ),
              hooks,
            );
          }
          this.damagePropsInRadius(enemySystem, z.x, z.y, z.radius, z.damage, hooks);
        }
      }
      i++;
    }
    void stats;
  }

  private updateBeams(
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
    let i = 0;
    while (i < this.beams.length) {
      const b = this.beams[i]!;
      b.life -= dt;
      if (b.life <= 0) {
        this.beams.splice(i, 1);
        continue;
      }
      b.angle += b.spinRate * dt;
      b.tickTimer -= dt;
      if (b.tickTimer <= 0) {
        b.tickTimer = 0.14;
        const x2 = playerX + Math.cos(b.angle) * b.length;
        const y2 = playerY + Math.sin(b.angle) * b.length;
        const slot = this.slots.find((s) => s.weaponId === b.weaponId);

        const count = enemySystem.grid.queryLine(
          playerX,
          playerY,
          x2,
          y2,
          b.width * 0.65,
          this.queryScratch,
        );
        for (let eIdx = 0; eIdx < count; eIdx++) {
          const idx = this.queryScratch[eIdx]!;
          const e = enemySystem.enemies[idx];
          if (!e || !e.alive) continue;
          const isCrit = rng.chance(b.critChance);
          const dmg = isCrit ? b.damage * b.critMult : b.damage;
          this.applyDamageToEnemy(
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
            const fp = this.catalog.arcanas.arcana_xix_heart_of_fire.params;
            this.triggerSubExplosion(
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

  private triggerLightningStrike(
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
    const count = enemySystem.grid.queryRadius(x, y, radius, this.queryScratch);
    for (let i = 0; i < count; i++) {
      const idx = this.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      const isCrit = rng.chance(critChance);
      const dmg = isCrit ? damage * critMult : damage;
      this.applyDamageToEnemy(
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
    this.damagePropsInRadius(enemySystem, x, y, radius, damage, hooks);

    this.zones.push({
      uid: this.nextUid++,
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
      hitCooldowns: new Map(),
    });
  }

  private triggerSubExplosion(
    x: number,
    y: number,
    radius: number,
    damage: number,
    weaponId: WeaponId,
    enemySystem: EnemySystem,
    hooks: WeaponCombatHooks,
  ): void {
    const slot = this.slots.find((s) => s.weaponId === weaponId);
    const count = enemySystem.grid.queryRadius(x, y, radius, this.queryScratch);
    for (let i = 0; i < count; i++) {
      const idx = this.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      this.applyDamageToEnemy(
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
    this.damagePropsInRadius(enemySystem, x, y, radius, damage, hooks);
    this.zones.push({
      uid: this.nextUid++,
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
      hitCooldowns: new Map(),
    });
  }

  triggerFrostExplosion(
    x: number,
    y: number,
    stats: StatBlock,
    enemySystem: EnemySystem,
    hooks: WeaponCombatHooks,
  ): void {
    const p = this.catalog.arcanas.arcana_xii_out_of_bounds.params;
    const radius = (p.freezeExplosionRadius ?? 120) * stats.area;
    const dmg = (p.freezeExplosionDamage ?? 45) * stats.might;
    const slot = this.slots.find((s) => s.weaponId === 'clock_lancet');
    const count = enemySystem.grid.queryRadius(x, y, radius, this.queryScratch);
    for (let i = 0; i < count; i++) {
      const idx = this.queryScratch[i]!;
      const e = enemySystem.enemies[idx];
      if (!e || !e.alive) continue;
      this.applyDamageToEnemy(
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
    this.zones.push({
      uid: this.nextUid++,
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
      hitCooldowns: new Map(),
    });
  }

  private applyDamageToEnemy(
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

  private damagePropsInRadius(
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

  private damagePropsInRect(
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
}
