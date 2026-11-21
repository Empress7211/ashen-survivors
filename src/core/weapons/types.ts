import type {
  Catalog,
  ChestTier,
  EnemyId,
  RenderZoneState,
  WeaponId,
} from '../../contracts/index.ts';
import type { AudioCue } from '../../contracts/types.ts';
import type { ProjectilePool, ZonePool } from './pools.ts';

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

export type ProjectileBehavior =
  | 'straight'
  | 'homing'
  | 'axe_arc'
  | 'boomerang'
  | 'runetracer'
  | 'bone'
  | 'cherry';

export interface ActiveProjectile {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  behavior: ProjectileBehavior;
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

export interface ActiveZone {
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

export interface ActiveBeam {
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

export interface ActiveOrbiter {
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
    enemyId: EnemyId,
    x: number,
    y: number,
    xpValue: number,
    xpTier: 'xp_blue' | 'xp_green' | 'xp_red' | 'xp_gold',
    isBoss: boolean,
    isReaper: boolean,
    chestTier?: ChestTier,
    canEvolveChest?: boolean,
    fromRetaliation?: boolean,
  ): void;
  onPropBroken(x: number, y: number): void;
  onPentagramTriggered(eraseChance: number, vacuumAndRain: boolean): void;
  onFreezeTriggered(x: number, y: number): void;
  onScreenEffect(flash: { color: number; alpha: number } | null, shake: number): void;
}

export interface SpawnProjectileOptions {
  weaponId: WeaponId;
  vfxKey: string;
  behavior: ProjectileBehavior;
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
}

export interface SpawnZoneOptions {
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
}

export interface WeaponRuntimeContext {
  readonly catalog: Catalog;
  readonly slots: WeaponSlotState[];
  readonly projectiles: ActiveProjectile[];
  readonly zones: ActiveZone[];
  readonly beams: ActiveBeam[];
  readonly orbiters: ActiveOrbiter[];
  readonly projectilePool: ProjectilePool;
  readonly zonePool: ZonePool;
  readonly queryScratch: number[];
  whipSlashToggle: number;
  allocUid(): number;
}

export const NO_PLAYER_AMOUNT_WEAPONS = new Set<WeaponId>([
  'garlic',
  'soul_eater',
  'pentagram',
  'gorgeous_moon',
  'clock_lancet',
  'laurel',
]);
