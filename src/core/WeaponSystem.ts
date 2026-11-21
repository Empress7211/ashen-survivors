import type {
  ArcanaId,
  Catalog,
  RenderBeamState,
  RenderProjectileState,
  RenderZoneState,
  StageCorridorBounds,
  StatBlock,
  WeaponDamageSummary,
  WeaponId,
  WeaponSlotSnapshot,
} from '../contracts/index.ts';
import type { EnemySystem } from './EnemySystem.ts';
import type { SeededRng } from './Rng.ts';
import { triggerFrostExplosion as triggerFrostExplosionImpl } from './weapons/combat.ts';
import {
  consumeLaurelShield,
  ensurePermanentOrbiters,
  fireVolleyShot,
  triggerWeapon,
} from './weapons/firing.ts';
import { ProjectilePool, ZonePool } from './weapons/pools.ts';
import {
  fillRenderBeams as fillRenderBeamsImpl,
  fillRenderProjectiles as fillRenderProjectilesImpl,
  fillRenderProjectilesAndOrbiters as fillRenderProjectilesAndOrbitersImpl,
  fillRenderZones as fillRenderZonesImpl,
} from './weapons/renderFill.ts';
import {
  computeWeaponEffectiveBase,
  findWeaponSlot,
} from './weapons/stats.ts';
import type {
  ActiveBeam,
  ActiveOrbiter,
  ActiveProjectile,
  ActiveZone,
  WeaponCombatHooks,
  WeaponRuntimeContext,
  WeaponSlotState,
} from './weapons/types.ts';
import {
  updateBeams,
  updateOrbiters,
  updateProjectiles,
  updateZones,
} from './weapons/updates.ts';

export type { WeaponCombatHooks, WeaponSlotState } from './weapons/types.ts';
export { ProjectilePool, ZonePool } from './weapons/pools.ts';

export class WeaponSystem {
  readonly catalog: Catalog;
  readonly slots: WeaponSlotState[] = [];
  readonly damageHistory = new Map<WeaponId, WeaponDamageSummary>();
  readonly projectilePool = new ProjectilePool();
  readonly zonePool = new ZonePool();

  private readonly projectiles: ActiveProjectile[] = [];
  private readonly zones: ActiveZone[] = [];
  private readonly beams: ActiveBeam[] = [];
  private orbiters: ActiveOrbiter[] = [];
  private nextUid = 1;
  private readonly queryScratch: number[] = [];
  private readonly arcanaSetScratch = new Set<ArcanaId>();
  private readonly ctx: WeaponRuntimeContext;

  constructor(catalog: Catalog) {
    this.catalog = catalog;
    const self = this;
    this.ctx = {
      catalog,
      slots: this.slots,
      projectiles: this.projectiles,
      zones: this.zones,
      beams: this.beams,
      orbiters: this.orbiters,
      projectilePool: this.projectilePool,
      zonePool: this.zonePool,
      queryScratch: this.queryScratch,
      whipSlashToggle: 0,
      allocUid(): number {
        return self.nextUid++;
      },
    };
  }

  addOrUpgradeWeapon(weaponId: WeaponId): WeaponSlotState | null {
    const existing = findWeaponSlot(this.slots, weaponId);
    const def = this.catalog.weapons[weaponId];
    if (existing) {
      if (existing.level < existing.maxLevel) {
        existing.level++;
        if (weaponId === 'laurel') {
          const stats = computeWeaponEffectiveBase(this.catalog, existing);
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
    const slot = findWeaponSlot(this.slots, weaponId);
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

    // Clear old orbiters belonging to replaced weapons in place so ctx.orbiters stays aliased
    let write = 0;
    for (let i = 0; i < this.orbiters.length; i++) {
      const o = this.orbiters[i]!;
      if (o.weaponId !== baseWeaponId && o.weaponId !== partnerWeaponId) {
        this.orbiters[write++] = o;
      }
    }
    this.orbiters.length = write;

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
    const out: WeaponSlotSnapshot[] = [];
    this.fillSlotSnapshots(out);
    return out;
  }

  fillSlotSnapshots(out: WeaponSlotSnapshot[]): void {
    const count = this.slots.length;
    for (let i = 0; i < count; i++) {
      const s = this.slots[i]!;
      let slot = out[i];
      if (!slot) {
        slot = {
          weaponId: s.weaponId,
          level: s.level,
          maxLevel: s.maxLevel,
          isEvolved: s.isEvolved,
          limitBreakLevel: s.limitBreakLevel,
        };
        out.push(slot);
      } else {
        slot.weaponId = s.weaponId;
        slot.level = s.level;
        slot.maxLevel = s.maxLevel;
        slot.isEvolved = s.isEvolved;
        slot.limitBreakLevel = s.limitBreakLevel;
      }
    }
    out.length = count;
  }

  getLaurelCharges(): number {
    const slot = findWeaponSlot(this.slots, 'laurel');
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
    return consumeLaurelShield(
      this.ctx,
      playerX,
      playerY,
      stats,
      arcanas,
      enemySystem,
      rng,
      hooks,
    );
  }

  getGarlicRenderRadius(stats: StatBlock): {
    radius: number;
    soulEaterActive: boolean;
  } {
    const soul = findWeaponSlot(this.slots, 'soul_eater');
    if (soul) {
      const ws = computeWeaponEffectiveBase(this.catalog, soul);
      return {
        radius: ws.baseSize * ws.area * stats.area * (1 + soul.limitBreakArea),
        soulEaterActive: true,
      };
    }
    const garlic = findWeaponSlot(this.slots, 'garlic');
    if (garlic) {
      const ws = computeWeaponEffectiveBase(this.catalog, garlic);
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
    const arcanaSet = this.arcanaSetScratch;
    arcanaSet.clear();
    for (let i = 0; i < arcanas.length; i++) {
      arcanaSet.add(arcanas[i]!);
    }

    // 1. Update slot timers & fire weapons
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      slot.activeSeconds += dt;
      const def = this.catalog.weapons[slot.weaponId];
      const wStats = computeWeaponEffectiveBase(this.catalog, slot);

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
        ensurePermanentOrbiters(this.ctx, slot, def, wStats, stats, arcanaSet);
        continue;
      }

      // Sequential volley burst queue (knife / magic_wand / phiera / eight_sparrow)
      if (slot.burstQueue > 0) {
        slot.burstTimer -= dt;
        if (slot.burstTimer <= 0) {
          slot.burstQueue -= 1;
          slot.burstTimer =
            slot.weaponId === 'knife' || slot.weaponId === 'thousand_edge'
              ? 0.045
              : 0.07;
          fireVolleyShot(
            this.ctx,
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

        triggerWeapon(
          this.ctx,
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
    updateOrbiters(
      this.ctx,
      dt,
      playerX,
      playerY,
      arcanaSet,
      enemySystem,
      hooks,
    );

    // 3. Update Projectiles (with pooled release on expiration/consumption)
    updateProjectiles(
      this.ctx,
      dt,
      playerX,
      playerY,
      arcanaSet,
      enemySystem,
      rng,
      corridorBounds,
      hooks,
    );

    // 4. Update Zones (with pooled release on expiration)
    updateZones(
      this.ctx,
      dt,
      playerX,
      playerY,
      arcanaSet,
      enemySystem,
      rng,
      hooks,
    );

    // 5. Update Beams (Phieraggi)
    updateBeams(
      this.ctx,
      dt,
      playerX,
      playerY,
      stats,
      arcanaSet,
      enemySystem,
      rng,
      hooks,
    );
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
    const out: RenderProjectileState[] = [];
    fillRenderProjectilesImpl(this.projectiles, out);
    return out;
  }

  getRenderZones(): RenderZoneState[] {
    const out: RenderZoneState[] = [];
    fillRenderZonesImpl(this.zones, out);
    return out;
  }

  fillRenderZones(out: RenderZoneState[]): void {
    fillRenderZonesImpl(this.zones, out);
  }

  getRenderProjectilesAndOrbiters(
    playerX: number,
    playerY: number,
  ): RenderProjectileState[] {
    const out: RenderProjectileState[] = [];
    fillRenderProjectilesAndOrbitersImpl(
      this.projectiles,
      this.orbiters,
      playerX,
      playerY,
      out,
    );
    return out;
  }

  fillRenderProjectilesAndOrbiters(
    playerX: number,
    playerY: number,
    out: RenderProjectileState[],
  ): void {
    fillRenderProjectilesAndOrbitersImpl(
      this.projectiles,
      this.orbiters,
      playerX,
      playerY,
      out,
    );
  }

  getRenderBeams(playerX: number, playerY: number): RenderBeamState[] {
    const out: RenderBeamState[] = [];
    fillRenderBeamsImpl(this.beams, playerX, playerY, out);
    return out;
  }

  fillRenderBeams(
    playerX: number,
    playerY: number,
    out: RenderBeamState[],
  ): void {
    fillRenderBeamsImpl(this.beams, playerX, playerY, out);
  }

  triggerFrostExplosion(
    x: number,
    y: number,
    stats: StatBlock,
    enemySystem: EnemySystem,
    hooks: WeaponCombatHooks,
  ): void {
    triggerFrostExplosionImpl(this.ctx, x, y, stats, enemySystem, hooks);
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
}
