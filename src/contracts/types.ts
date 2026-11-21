import type {
  ArcanaId,
  BaseWeaponId,
  ChestTier,
  EnemyId,
  EvolvedWeaponId,
  HeroId,
  PassiveId,
  PickupId,
  PowerUpId,
  PropId,
  RelicId,
  StageId,
  WeaponId,
} from './ids';

export type {
  ArcanaId,
  BaseWeaponId,
  BossEnemyId,
  CatalogIconId,
  ChestTier,
  EnemyId,
  EvolvedWeaponId,
  HeroId,
  PassiveId,
  PickupId,
  PowerUpId,
  PropId,
  RegularEnemyId,
  RelicId,
  StageId,
  WeaponId,
} from './ids';

/**
 * Canonical player/modifier stat vector.
 * Multiplier stats use 1.0 as baseline (100%); flat stats use additive units.
 * Cooldown uses 1.0 as baseline and decreases when faster (e.g. 0.92 = -8% cooldown).
 */
export interface StatBlock {
  maxHp: number;
  recovery: number;
  armor: number;
  moveSpeed: number;
  might: number;
  area: number;
  speed: number;
  duration: number;
  amount: number;
  cooldown: number;
  luck: number;
  growth: number;
  greed: number;
  curse: number;
  magnet: number;
  revivals: number;
  rerolls: number;
  skips: number;
  banishes: number;
}

export type StatDelta = Partial<StatBlock>;

export interface HeroLevelScaling {
  stat: keyof StatBlock;
  delta: number;
  everyLevels: number;
  startLevel: number;
  maxTriggers?: number;
}

export interface HeroTemporaryBonus {
  stat: keyof StatBlock;
  /** Exact stat bonus indexed by player level (e.g. Porta Lv1-4 cooldown bonus). */
  valuesByLevel: Readonly<Record<number, number>>;
}

export interface HeroDef {
  id: HeroId;
  name: string;
  englishName: string;
  title: string;
  lore: string;
  passiveSummary: string;
  startingWeapon: WeaponId;
  cost: number;
  unlockedByDefault: boolean;
  unlockHint: string;
  baseStats: StatBlock;
  levelScalings: readonly HeroLevelScaling[];
  temporaryBonuses?: readonly HeroTemporaryBonus[];
  accentColor: string;
}

export type WeaponCategory =
  | 'melee'
  | 'projectile'
  | 'orbit'
  | 'aura'
  | 'zone'
  | 'lightning'
  | 'screen'
  | 'radial'
  | 'shield'
  | 'beam';

export type WeaponTag =
  | 'physical'
  | 'magic'
  | 'fire'
  | 'ice'
  | 'holy'
  | 'dark'
  | 'lightning'
  | 'piercing'
  | 'crit'
  | 'lifesteal'
  | 'aoe'
  | 'union';

export interface WeaponBaseStats {
  damage: number;
  cooldown: number;
  area: number;
  baseSize: number;
  projectileSpeed: number;
  duration: number;
  amount: number;
  pierce: number;
  knockback: number;
  hitLimit: number;
  poolInterval?: number;
  critChance: number;
  critMultiplier: number;
  lifestealOnCrit?: number;
}

export interface WeaponLevelDelta {
  level: number;
  description: string;
  damage?: number;
  cooldown?: number;
  area?: number;
  speed?: number;
  duration?: number;
  amount?: number;
  pierce?: number;
  knockback?: number;
  critChance?: number;
  critMultiplier?: number;
  hitLimit?: number;
}

export interface EvolutionRecipe {
  evolvedId: EvolvedWeaponId;
  baseWeapon: BaseWeaponId;
  partnerWeapon?: BaseWeaponId;
  requiredPassive?: PassiveId;
  requiresMaxPassive: boolean;
  consumesPartnerWeapon: boolean;
  consumesPassive: boolean;
  minChestMinute: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  englishName: string;
  description: string;
  isEvolved: boolean;
  category: WeaponCategory;
  tags: readonly WeaponTag[];
  maxLevel: number;
  rarity: number;
  limitBreakable: boolean;
  baseStats: WeaponBaseStats;
  levels: readonly WeaponLevelDelta[];
  evolutionRecipe?: EvolutionRecipe;
  unlockedByDefault: boolean;
  vfxKey: string;
  sfxKey: WeaponId;
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  englishName: string;
  description: string;
  maxLevel: number;
  rarity: number;
  perLevelDelta: StatDelta;
  levelDescriptions: readonly string[];
  evolvesWeapons: readonly WeaponId[];
  unlockedByDefault: boolean;
}

export interface ArcanaDef {
  id: ArcanaId;
  roman: string;
  name: string;
  englishName: string;
  description: string;
  affectedWeapons: readonly WeaponId[];
  affectedPassives: readonly PassiveId[];
  params: Readonly<Record<string, number>>;
  unlockedByDefault: boolean;
}

export interface PowerUpDef {
  id: PowerUpId;
  name: string;
  englishName: string;
  description: string;
  maxRank: number;
  baseCost: number;
  statDeltaPerRank: StatDelta;
  isUtility?: boolean;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  englishName: string;
  lore: string;
  isBoss: boolean;
  isReaper: boolean;
  maxHp: number;
  speed: number;
  damage: number;
  knockbackResistance: number;
  xpValue: number;
  xpTier: 'xp_blue' | 'xp_green' | 'xp_red' | 'xp_gold';
  radius: number;
  spriteScale: number;
  bossChestTier?: PickupId;
  canEvolveChest?: boolean;
  ignoresWalls?: boolean;
  tint?: number;
}

export interface WaveBossSpawn {
  enemyId: EnemyId;
  timeSeconds: number;
  chestTier: ChestTier;
  canEvolveChest: boolean;
  count?: number;
}

export interface WaveSwarmEvent {
  timeSeconds: number;
  enemyId: EnemyId;
  count: number;
  formation: 'ring' | 'line' | 'cluster';
  speedMultiplier?: number;
}

export interface WaveEntry {
  minute: number;
  endMinute?: number;
  enemies: readonly EnemyId[];
  spawnInterval: number;
  minimumCount: number;
  maxCount?: number;
  hpMultiplier?: number;
  speedMultiplier?: number;
  damageMultiplier?: number;
}

export interface StageGroundPickup {
  id: string;
  kind: 'passive' | 'relic' | 'pickup';
  itemId: PassiveId | RelicId | PickupId;
  x: number;
  y: number;
  requiresRelic?: RelicId;
}

export interface StageCorridorBounds {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
}

export interface StageModifiers {
  gold: number;
  luck: number;
  xp: number;
  enemyHp: number;
  enemySpeed: number;
}

export interface StageDef {
  id: StageId;
  name: string;
  englishName: string;
  description: string;
  order: number;
  tileKey: StageId;
  durationSeconds: number;
  reaperTimeSeconds: number;
  reaperEnemyId: EnemyId;
  corridorBounds?: StageCorridorBounds;
  baseModifiers: StageModifiers;
  hyperModifiers: {
    moveSpeedBonus: number;
    goldMultiplier: number;
    luckBonus: number;
    enemySpeedBonus: number;
    xpMultiplier: number;
  };
  hurryTimeScale: number;
  allowedProps: readonly PropId[];
  propSpawnSpacing: number;
  waves: readonly WaveEntry[];
  bossEvents: readonly WaveBossSpawn[];
  swarmEvents: readonly WaveSwarmEvent[];
  groundPickups: readonly StageGroundPickup[];
  unlockedByDefault: boolean;
  unlockHint: string;
  bgmTheme: StageId;
}

export interface RelicDef {
  id: RelicId;
  name: string;
  englishName: string;
  description: string;
  stageId?: StageId;
}

export interface PickupDef {
  id: PickupId;
  name: string;
  englishName: string;
  description: string;
  xpValue?: number;
  goldValue?: number;
  healValue?: number;
  freezeSeconds?: number;
}

export interface PropDef {
  id: PropId;
  name: string;
  englishName: string;
  maxHp: number;
  radius: number;
}

export type AchievementCategory =
  | 'survival'
  | 'kills'
  | 'evolution'
  | 'level'
  | 'gold'
  | 'stage'
  | 'collection'
  | 'relic';

export interface AchievementCondition {
  type:
    | 'survive_minutes'
    | 'reach_level'
    | 'total_kills'
    | 'run_kills'
    | 'evolve_weapon'
    | 'unlock_stage'
    | 'collect_gold'
    | 'collect_relic'
    | 'defeat_boss'
    | 'max_weapon_level'
    | 'banish_count'
    | 'revive_count';
  targetValue: number;
  targetId?: string;
  stageId?: StageId;
  heroId?: HeroId;
}

export interface AchievementUnlockReward {
  gold?: number;
  hero?: HeroId;
  stage?: StageId;
  hyperStage?: StageId;
  weapon?: WeaponId;
  passive?: PassiveId;
  arcana?: ArcanaId;
  relic?: RelicId;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  condition: AchievementCondition;
  reward: AchievementUnlockReward;
}

export interface Catalog {
  readonly heroes: Readonly<Record<HeroId, HeroDef>>;
  readonly weapons: Readonly<Record<WeaponId, WeaponDef>>;
  readonly passives: Readonly<Record<PassiveId, PassiveDef>>;
  readonly arcanas: Readonly<Record<ArcanaId, ArcanaDef>>;
  readonly powerUps: Readonly<Record<PowerUpId, PowerUpDef>>;
  readonly enemies: Readonly<Record<EnemyId, EnemyDef>>;
  readonly stages: Readonly<Record<StageId, StageDef>>;
  readonly relics: Readonly<Record<RelicId, RelicDef>>;
  readonly pickups: Readonly<Record<PickupId, PickupDef>>;
  readonly props: Readonly<Record<PropId, PropDef>>;
  readonly evolutions: readonly EvolutionRecipe[];
  readonly achievements: readonly AchievementDef[];
}

export interface StageBestRecord {
  bestTimeSeconds: number;
  bestLevel: number;
  bestKills: number;
  clears: number;
  hyperCleared: boolean;
  lastHeroId?: HeroId;
}

export interface AudioAndDisplaySettings {
  bgmVolume: number;
  sfxVolume: number;
  muted: boolean;
  showDamageNumbers: boolean;
  screenShake: boolean;
  visualEffectsQuality: 'high' | 'medium';
  showMinimap: boolean;
  language: 'zh-CN';
}

export interface SaveState {
  version: 1;
  gold: number;
  totalGoldEarned: number;
  totalKills: number;
  totalRuns: number;
  powerUps: Partial<Record<PowerUpId, number>>;
  unlockedHeroes: HeroId[];
  purchasedHeroes: HeroId[];
  unlockedStages: StageId[];
  unlockedHyper: StageId[];
  unlockedRelics: RelicId[];
  unlockedArcanas: ArcanaId[];
  unlockedAchievements: string[];
  discoveredItems: string[];
  bestiaryKills: Partial<Record<EnemyId, number>>;
  bestRunByStage: Partial<Record<StageId, StageBestRecord>>;
  sealedItems?: string[];
  heroStageClears?: Partial<Record<HeroId, StageId[]>>;
  heroHyperClears?: Partial<Record<HeroId, StageId[]>>;
  selectedHeroId: HeroId;
  selectedStageId: StageId;
  stageOptions: {
    hyper: boolean;
    hurry: boolean;
    arcanasEnabled: boolean;
    limitBreakEnabled: boolean;
    endless: boolean;
  };
  settings: AudioAndDisplaySettings;
}

export type AudioCue =
  | { type: 'xp_gem'; tier: 'blue' | 'green' | 'red' | 'gold'; streak?: number }
  | { type: 'hit'; crit?: boolean; weaponId?: WeaponId }
  | { type: 'weapon_fire'; weaponId: WeaponId }
  | { type: 'player_hurt' }
  | { type: 'level_up'; level: number }
  | { type: 'chest_open'; tier: ChestTier; itemCount: 1 | 3 | 5 }
  | { type: 'chest_reveal'; index: number; isEvolution?: boolean }
  | { type: 'evolution' }
  | {
      type: 'pickup';
      kind: 'coin' | 'gold_bag' | 'chicken' | 'vacuum' | 'rosary' | 'orologion' | 'relic';
    }
  | { type: 'boss_spawn'; enemyId: EnemyId }
  | { type: 'revive' }
  | { type: 'game_over'; victory: boolean }
  | { type: 'ui_hover' }
  | { type: 'ui_click' }
  | { type: 'ui_buy' }
  | { type: 'ui_error' };

export type RunPhase =
  | 'playing'
  | 'paused'
  | 'level_up'
  | 'arcana_select'
  | 'chest'
  | 'revive'
  | 'settlement';

export interface RunStartConfig {
  heroId: HeroId;
  stageId: StageId;
  hyper: boolean;
  hurry: boolean;
  arcanasEnabled: boolean;
  limitBreakEnabled: boolean;
  endless: boolean;
  seed?: number;
}

export type SimulationAction =
  | { type: 'choose_draft'; optionId: string }
  | { type: 'reroll_draft' }
  | { type: 'skip_draft' }
  | { type: 'toggle_banish_mode' }
  | { type: 'banish_draft'; optionId: string }
  | { type: 'close_chest' }
  | { type: 'confirm_revive' }
  | { type: 'forfeit_revive' }
  | { type: 'toggle_pause' }
  | { type: 'end_run' };

export interface RenderPlayerState {
  heroId: HeroId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  invulnTimer: number;
  hitFlash: boolean;
  laurelShieldCharges: number;
  animFrame: 0 | 1 | 2 | 3;
  isMoving: boolean;
  garlicRadius: number;
  soulEaterActive: boolean;
}

export interface RenderEnemyState {
  uid: number;
  enemyId: EnemyId;
  x: number;
  y: number;
  facingX: -1 | 1;
  radius: number;
  scale: number;
  hp: number;
  maxHp: number;
  hitFlash: boolean;
  frozen: boolean;
  isBoss: boolean;
  isReaper: boolean;
  animFrame: 0 | 1 | 2 | 3;
  tint?: number;
}

export interface RenderProjectileState {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  scale: number;
  alpha: number;
  flipX?: boolean;
  tint?: number;
}

export interface RenderZoneState {
  uid: number;
  kind:
    | 'pool'
    | 'aura'
    | 'slash'
    | 'lightning'
    | 'explosion'
    | 'bombard_telegraph'
    | 'pentagram'
    | 'clock_hand'
    | 'shield_burst';
  weaponId?: WeaponId;
  vfxKey: string;
  x: number;
  y: number;
  radius: number;
  endX?: number;
  endY?: number;
  rotation: number;
  progress: number;
  alpha: number;
  flipX?: boolean;
  tint?: number;
}

export interface RenderBeamState {
  uid: number;
  weaponId: WeaponId;
  vfxKey: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  alpha: number;
  color: number;
}

export interface RenderPickupState {
  uid: number;
  kind: 'pickup' | 'passive' | 'relic';
  itemId: PickupId | PassiveId | RelicId;
  x: number;
  y: number;
  bobPhase: number;
  magnetized: boolean;
  chestOpen?: boolean;
}

export interface RenderPropState {
  uid: number;
  propId: PropId;
  x: number;
  y: number;
  broken: boolean;
  hitFlash: boolean;
}

export interface RenderFloatingText {
  uid: number;
  x: number;
  y: number;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'xp' | 'gold' | 'status';
  progress: number;
}

export interface WeaponSlotSnapshot {
  weaponId: WeaponId;
  level: number;
  maxLevel: number;
  isEvolved: boolean;
  limitBreakLevel: number;
}

export interface PassiveSlotSnapshot {
  passiveId: PassiveId;
  level: number;
  maxLevel: number;
}

export interface HudSnapshot {
  elapsedSeconds: number;
  stageDurationSeconds: number;
  level: number;
  xp: number;
  xpToNextLevel: number;
  hp: number;
  maxHp: number;
  kills: number;
  goldEarned: number;
  weapons: readonly WeaponSlotSnapshot[];
  passives: readonly PassiveSlotSnapshot[];
  arcanas: readonly ArcanaId[];
  rerollsRemaining: number;
  skipsRemaining: number;
  banishesRemaining: number;
  revivalsRemaining: number;
  activeEnemyCount: number;
  stageId: StageId;
  hyper: boolean;
  hurry: boolean;
  endless: boolean;
  endlessCycle: number;
  hasMilkyWayMap?: boolean;
  mapMarkers?: readonly PauseMapMarker[];
}

export interface BossBarState {
  enemyId: EnemyId;
  name: string;
  hp: number;
  maxHp: number;
}

export interface DraftOption {
  optionId: string;
  kind: 'weapon' | 'passive' | 'consumable' | 'limit_break' | 'arcana';
  itemId: WeaponId | PassiveId | PickupId | ArcanaId;
  title: string;
  subtitle: string;
  description: string;
  currentLevel: number;
  nextLevel: number;
  isNew: boolean;
  isEvolution?: boolean;
  evolutionPartnerText?: string;
}

export interface DraftModalState {
  mode: 'level_up' | 'arcana_select';
  playerLevel: number;
  options: readonly DraftOption[];
  rerollsRemaining: number;
  skipsRemaining: number;
  banishesRemaining: number;
  banishModeActive: boolean;
}

export interface ChestRewardItem {
  kind: 'weapon_upgrade' | 'passive_upgrade' | 'evolution' | 'gold' | 'limit_break';
  itemId?: WeaponId | PassiveId;
  title: string;
  description: string;
  newLevel?: number;
  goldAmount?: number;
  isEvolution: boolean;
}

export interface ChestModalState {
  tier: ChestTier;
  itemCount: 1 | 3 | 5;
  bonusGold: number;
  items: readonly ChestRewardItem[];
}

export interface ReviveModalState {
  revivalsRemaining: number;
  heroName: string;
  elapsedSeconds: number;
}

export interface WeaponDamageSummary {
  weaponId: WeaponId;
  name: string;
  level: number;
  isEvolved: boolean;
  totalDamage: number;
  dps: number;
  activeSeconds: number;
}

export interface SettlementModalState {
  victory: boolean;
  stageId: StageId;
  heroId: HeroId;
  elapsedSeconds: number;
  level: number;
  kills: number;
  goldEarned: number;
  weaponBreakdown: readonly WeaponDamageSummary[];
  unlockedAchievements: readonly string[];
  causeOfDeath?: string;
}

export interface PauseMapMarker {
  label: string;
  kind: 'player' | 'passive' | 'relic' | 'pickup';
  itemId?: string;
  x: number;
  y: number;
}

export interface PauseEvolutionHint {
  baseWeapon: BaseWeaponId;
  requiredPassive?: PassiveId;
  partnerWeapon?: BaseWeaponId;
  evolvedId: EvolvedWeaponId;
  ready: boolean;
}

export interface PauseSnapshot {
  stats: StatBlock;
  weapons: readonly WeaponSlotSnapshot[];
  passives: readonly PassiveSlotSnapshot[];
  arcanas: readonly ArcanaId[];
  evolutionsPossible: readonly PauseEvolutionHint[];
  mapMarkers: readonly PauseMapMarker[];
  hasMilkyWayMap: boolean;
  hasGrimoire: boolean;
}

export interface RenderFrameState {
  phase: RunPhase;
  stageId: StageId;
  corridorBounds?: StageCorridorBounds;
  tick: number;
  player: RenderPlayerState;
  enemies: readonly RenderEnemyState[];
  projectiles: readonly RenderProjectileState[];
  zones: readonly RenderZoneState[];
  beams: readonly RenderBeamState[];
  pickups: readonly RenderPickupState[];
  props: readonly RenderPropState[];
  floatingTexts: readonly RenderFloatingText[];
  screenFlash: { color: number; alpha: number } | null;
  screenShake: number;
  hud: HudSnapshot;
  bossBar: BossBarState | null;
  draftModal: DraftModalState | null;
  chestModal: ChestModalState | null;
  reviveModal: ReviveModalState | null;
  settlementModal: SettlementModalState | null;
  pauseSnapshot: PauseSnapshot | null;
  audioCues: readonly AudioCue[];
}
