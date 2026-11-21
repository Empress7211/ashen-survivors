import {
  ARCANA_IDS,
  BASE_WEAPON_IDS,
  ENEMY_IDS,
  HERO_IDS,
  PASSIVE_IDS,
  POWERUP_IDS,
  RELIC_IDS,
  STAGE_IDS,
  WEAPON_IDS,
} from '../contracts/ids.ts';
import type {
  ArcanaId,
  AudioAndDisplaySettings,
  BaseWeaponId,
  Catalog,
  EnemyId,
  FunModeMultipliers,
  FunModeSettings,
  HeroId,
  PassiveId,
  PowerUpId,
  RelicId,
  SaveState,
  SettlementModalState,
  StageBestRecord,
  StageId,
} from '../contracts/types.ts';
import { CATALOG } from '../data/index.ts';
import { FUN_MODE_PRESETS } from './StatCalculator.ts';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

export const DEFAULT_SAVE_STORAGE_KEY = 'ashen_survivors_save_v1';

const HERO_ID_SET = new Set<string>(HERO_IDS);
const STAGE_ID_SET = new Set<string>(STAGE_IDS);
const RELIC_ID_SET = new Set<string>(RELIC_IDS);
const ARCANA_ID_SET = new Set<string>(ARCANA_IDS);
const POWERUP_ID_SET = new Set<string>(POWERUP_IDS);
const ENEMY_ID_SET = new Set<string>(ENEMY_IDS);
const SEALABLE_ITEM_ID_SET = new Set<string>([...BASE_WEAPON_IDS, ...PASSIVE_IDS]);
const VALID_ITEM_ID_SET = new Set<string>([
  ...WEAPON_IDS,
  ...PASSIVE_IDS,
  ...RELIC_IDS,
  ...ARCANA_IDS,
  ...HERO_IDS,
  ...STAGE_IDS,
]);

function resolveDefaultStorage(): StorageLike {
  try {
    const maybe = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (
      maybe &&
      typeof maybe.getItem === 'function' &&
      typeof maybe.setItem === 'function'
    ) {
      return maybe;
    }
  } catch {
    // Ignore storage access errors in restricted environments
  }
  return new MemoryStorage();
}

export function createDefaultSettings(): AudioAndDisplaySettings {
  return {
    bgmVolume: 0.5,
    sfxVolume: 0.7,
    muted: false,
    showDamageNumbers: true,
    screenShake: true,
    visualEffectsQuality: 'high',
    showMinimap: true,
    mouseFollow: false,
    language: 'zh-CN',
  };
}

export function createDefaultSaveState(catalog: Catalog): SaveState {
  const unlockedHeroes: HeroId[] = [];
  const purchasedHeroes: HeroId[] = [];
  for (const id of HERO_IDS) {
    const hero = catalog.heroes[id];
    if (hero.unlockedByDefault) {
      unlockedHeroes.push(id);
      if (hero.cost <= 0) {
        purchasedHeroes.push(id);
      }
    }
  }
  if (unlockedHeroes.length === 0) unlockedHeroes.push('antonio');
  if (purchasedHeroes.length === 0) purchasedHeroes.push(unlockedHeroes[0]!);

  const unlockedStages: StageId[] = [];
  for (const id of STAGE_IDS) {
    if (catalog.stages[id].unlockedByDefault) {
      unlockedStages.push(id);
    }
  }
  if (unlockedStages.length === 0) unlockedStages.push('mad_forest');

  const unlockedArcanas: ArcanaId[] = [];
  for (const id of ARCANA_IDS) {
    if (catalog.arcanas[id].unlockedByDefault) {
      unlockedArcanas.push(id);
    }
  }

  const selectedHeroId = purchasedHeroes[0]!;
  const selectedStageId = unlockedStages[0]!;

  return {
    version: 1,
    gold: 0,
    totalGoldEarned: 0,
    totalKills: 0,
    totalRuns: 0,
    powerUps: {},
    unlockedHeroes,
    purchasedHeroes,
    unlockedStages,
    unlockedHyper: [],
    unlockedRelics: [],
    unlockedArcanas,
    unlockedAchievements: [],
    discoveredItems: [catalog.heroes[selectedHeroId].startingWeapon],
    bestiaryKills: {},
    bestRunByStage: {},
    sealedItems: [],
    heroStageClears: {},
    heroHyperClears: {},
    selectedHeroId,
    selectedStageId,
    stageOptions: {
      hyper: false,
      hurry: false,
      arcanasEnabled: false,
      limitBreakEnabled: false,
      endless: false,
    },
    funMode: { ...FUN_MODE_PRESETS.standard },
    settings: createDefaultSettings(),
  };
}

/**
 * Canonical Vampire Survivors PowerUp cost scaling formula:
 * baseCost * (currentRank + 1) * (1 + 0.1 * totalPurchasedRanks)
 */
export function computePowerUpNextCost(
  id: PowerUpId,
  currentRank: number,
  totalPurchasedRanks: number,
  catalog: Catalog,
): number {
  const def = catalog.powerUps[id];
  const safeRank = Math.max(0, Math.floor(currentRank));
  if (safeRank >= def.maxRank) return 0;
  const safeTotal = Math.max(0, Math.floor(totalPurchasedRanks));
  return Math.floor(def.baseCost * (safeRank + 1) * (1 + 0.1 * safeTotal));
}

/**
 * Canonical fallback sum of PowerUp gold value when no purchase ledger exists
 * (e.g., imported JSON save). Evaluates ranks in canonical POWERUP_IDS order.
 */
export function computePowerUpCanonicalRefund(
  powerUps: Partial<Record<PowerUpId, number>>,
  catalog: Catalog,
): number {
  let totalGold = 0;
  let totalPurchasedRanks = 0;
  for (const id of POWERUP_IDS) {
    const rank = Math.min(
      catalog.powerUps[id].maxRank,
      Math.max(0, Math.floor(powerUps[id] ?? 0)),
    );
    for (let r = 0; r < rank; r++) {
      totalGold += computePowerUpNextCost(id, r, totalPurchasedRanks, catalog);
      totalPurchasedRanks += 1;
    }
  }
  return totalGold;
}

function uniqueValidIds<T extends string>(
  raw: unknown,
  validSet: Set<string>,
  required: readonly T[] = [],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const req of required) {
    if (validSet.has(req) && !seen.has(req)) {
      seen.add(req);
      result.push(req);
    }
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string' && validSet.has(item) && !seen.has(item)) {
        seen.add(item);
        result.push(item as T);
      }
    }
  }
  return result;
}

function nonNegInt(val: unknown, fallback = 0): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(0, Math.floor(val));
}

function clampRange(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

function matchesPreset(
  m: FunModeMultipliers,
  target: FunModeSettings,
): boolean {
  return (
    Math.abs(m.mightMultiplier - target.mightMultiplier) < 1e-3 &&
    Math.abs(m.moveSpeedMultiplier - target.moveSpeedMultiplier) < 1e-3 &&
    Math.abs(m.xpMultiplier - target.xpMultiplier) < 1e-3 &&
    Math.abs(m.cooldownMultiplier - target.cooldownMultiplier) < 1e-3 &&
    Math.abs(m.damageTakenMultiplier - target.damageTakenMultiplier) < 1e-3 &&
    m.bonusRevivals === target.bonusRevivals &&
    m.bonusAmount === target.bonusAmount
  );
}

function resolveFunPreset(m: FunModeMultipliers): FunModeSettings['preset'] {
  if (matchesPreset(m, FUN_MODE_PRESETS.standard)) return 'standard';
  if (matchesPreset(m, FUN_MODE_PRESETS.casual)) return 'casual';
  if (matchesPreset(m, FUN_MODE_PRESETS.musou)) return 'musou';
  return 'custom';
}

function sanitizeFunMode(raw: unknown): FunModeSettings {
  const def = FUN_MODE_PRESETS.standard;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...def };
  }
  const obj = raw as Record<string, unknown>;
  const presetHint =
    obj.preset === 'casual'
      ? FUN_MODE_PRESETS.casual
      : obj.preset === 'musou'
        ? FUN_MODE_PRESETS.musou
        : def;
  const multipliers: FunModeMultipliers = {
    mightMultiplier: Number(clampRange(obj.mightMultiplier, 1, 5, presetHint.mightMultiplier).toFixed(2)),
    moveSpeedMultiplier: Number(clampRange(obj.moveSpeedMultiplier, 1, 2, presetHint.moveSpeedMultiplier).toFixed(2)),
    xpMultiplier: Number(clampRange(obj.xpMultiplier, 1, 4, presetHint.xpMultiplier).toFixed(2)),
    cooldownMultiplier: Number(clampRange(obj.cooldownMultiplier, 0.5, 1, presetHint.cooldownMultiplier).toFixed(2)),
    damageTakenMultiplier: Number(clampRange(obj.damageTakenMultiplier, 0.25, 1, presetHint.damageTakenMultiplier).toFixed(2)),
    bonusRevivals: Math.round(clampRange(obj.bonusRevivals, 0, 3, presetHint.bonusRevivals)),
    bonusAmount: Math.round(clampRange(obj.bonusAmount, 0, 3, presetHint.bonusAmount)),
  };
  return {
    preset: resolveFunPreset(multipliers),
    ...multipliers,
  };
}

function clamp01(val: unknown, fallback: number): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.min(1, Math.max(0, val));
}

function sanitizeHeroStageMap(
  raw: unknown,
): Partial<Record<HeroId, StageId[]>> {
  const out: Partial<Record<HeroId, StageId[]>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return out;
  }
  const obj = raw as Record<string, unknown>;
  for (const heroId of HERO_IDS) {
    const stages = uniqueValidIds<StageId>(obj[heroId], STAGE_ID_SET);
    if (stages.length > 0) {
      out[heroId] = stages;
    }
  }
  return out;
}

function appendUniqueStage(
  map: Partial<Record<HeroId, StageId[]>>,
  heroId: HeroId,
  stageId: StageId,
): void {
  const list = map[heroId] ?? [];
  if (!list.includes(stageId)) {
    list.push(stageId);
  }
  map[heroId] = list;
}

export function sanitizeSaveState(raw: unknown, catalog: Catalog): SaveState {
  const defaults = createDefaultSaveState(catalog);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    return defaults;
  }

  const powerUps: Partial<Record<PowerUpId, number>> = {};
  if (obj.powerUps && typeof obj.powerUps === 'object' && !Array.isArray(obj.powerUps)) {
    const rawPu = obj.powerUps as Record<string, unknown>;
    for (const id of POWERUP_IDS) {
      const rank = nonNegInt(rawPu[id], 0);
      if (rank > 0) {
        powerUps[id] = Math.min(rank, catalog.powerUps[id].maxRank);
      }
    }
  }

  const unlockedHeroes = uniqueValidIds<HeroId>(
    obj.unlockedHeroes,
    HERO_ID_SET,
    defaults.unlockedHeroes,
  );
  const purchasedHeroes = uniqueValidIds<HeroId>(
    obj.purchasedHeroes,
    HERO_ID_SET,
    defaults.purchasedHeroes,
  );
  for (const h of purchasedHeroes) {
    if (!unlockedHeroes.includes(h)) unlockedHeroes.push(h);
  }

  const unlockedStages = uniqueValidIds<StageId>(
    obj.unlockedStages,
    STAGE_ID_SET,
    defaults.unlockedStages,
  );
  const unlockedHyper = uniqueValidIds<StageId>(obj.unlockedHyper, STAGE_ID_SET);
  const unlockedRelics = uniqueValidIds<RelicId>(obj.unlockedRelics, RELIC_ID_SET);
  const unlockedArcanas = uniqueValidIds<ArcanaId>(
    obj.unlockedArcanas,
    ARCANA_ID_SET,
    defaults.unlockedArcanas,
  );

  const validAchievementIds = new Set(catalog.achievements.map((a) => a.id));
  const unlockedAchievements = uniqueValidIds<string>(
    obj.unlockedAchievements,
    validAchievementIds,
  );

  const discoveredItems = uniqueValidIds<string>(
    obj.discoveredItems,
    VALID_ITEM_ID_SET,
    defaults.discoveredItems,
  );

  const bestiaryKills: Partial<Record<EnemyId, number>> = {};
  if (
    obj.bestiaryKills &&
    typeof obj.bestiaryKills === 'object' &&
    !Array.isArray(obj.bestiaryKills)
  ) {
    const rawBk = obj.bestiaryKills as Record<string, unknown>;
    for (const enemyId of ENEMY_IDS) {
      const kills = nonNegInt(rawBk[enemyId], 0);
      if (kills > 0) bestiaryKills[enemyId] = kills;
    }
  }

  const bestRunByStage: Partial<Record<StageId, StageBestRecord>> = {};
  if (
    obj.bestRunByStage &&
    typeof obj.bestRunByStage === 'object' &&
    !Array.isArray(obj.bestRunByStage)
  ) {
    const rawRuns = obj.bestRunByStage as Record<string, unknown>;
    for (const stageId of STAGE_IDS) {
      const rec = rawRuns[stageId];
      if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
        const r = rec as Record<string, unknown>;
        const lastHeroId =
          typeof r.lastHeroId === 'string' && HERO_ID_SET.has(r.lastHeroId)
            ? (r.lastHeroId as HeroId)
            : undefined;
        bestRunByStage[stageId] = {
          bestTimeSeconds: Math.max(
            0,
            typeof r.bestTimeSeconds === 'number' && Number.isFinite(r.bestTimeSeconds)
              ? r.bestTimeSeconds
              : 0,
          ),
          bestLevel: Math.max(1, nonNegInt(r.bestLevel, 1)),
          bestKills: nonNegInt(r.bestKills, 0),
          clears: nonNegInt(r.clears, 0),
          hyperCleared: Boolean(r.hyperCleared),
          lastHeroId,
        };
      }
    }
  }

  const sealedItems = uniqueValidIds<string>(
    obj.sealedItems,
    SEALABLE_ITEM_ID_SET,
  );
  const heroStageClears = sanitizeHeroStageMap(obj.heroStageClears);
  const heroHyperClears = sanitizeHeroStageMap(obj.heroHyperClears);
  for (const stageId of STAGE_IDS) {
    const rec = bestRunByStage[stageId];
    if (!rec || !rec.lastHeroId) continue;
    if (rec.clears > 0) {
      appendUniqueStage(heroStageClears, rec.lastHeroId, stageId);
    }
    if (rec.hyperCleared) {
      appendUniqueStage(heroHyperClears, rec.lastHeroId, stageId);
    }
  }

  const selectedHeroId =
    typeof obj.selectedHeroId === 'string' &&
    HERO_ID_SET.has(obj.selectedHeroId) &&
    purchasedHeroes.includes(obj.selectedHeroId as HeroId)
      ? (obj.selectedHeroId as HeroId)
      : defaults.selectedHeroId;

  const selectedStageId =
    typeof obj.selectedStageId === 'string' &&
    STAGE_ID_SET.has(obj.selectedStageId) &&
    unlockedStages.includes(obj.selectedStageId as StageId)
      ? (obj.selectedStageId as StageId)
      : defaults.selectedStageId;

  const rawOpts =
    obj.stageOptions && typeof obj.stageOptions === 'object'
      ? (obj.stageOptions as Record<string, unknown>)
      : {};
  const stageOptions = {
    hyper: Boolean(rawOpts.hyper) && unlockedHyper.includes(selectedStageId),
    hurry: Boolean(rawOpts.hurry),
    arcanasEnabled: Boolean(rawOpts.arcanasEnabled) && unlockedRelics.includes('relic_randomazzo'),
    limitBreakEnabled: Boolean(rawOpts.limitBreakEnabled),
    endless: Boolean(rawOpts.endless),
  };

  const funMode = sanitizeFunMode(obj.funMode);

  const rawSettings =
    obj.settings && typeof obj.settings === 'object'
      ? (obj.settings as Record<string, unknown>)
      : {};
  const defaultSettings = defaults.settings;
  const settings: AudioAndDisplaySettings = {
    bgmVolume: clamp01(rawSettings.bgmVolume, defaultSettings.bgmVolume),
    sfxVolume: clamp01(rawSettings.sfxVolume, defaultSettings.sfxVolume),
    muted:
      typeof rawSettings.muted === 'boolean'
        ? rawSettings.muted
        : defaultSettings.muted,
    showDamageNumbers:
      typeof rawSettings.showDamageNumbers === 'boolean'
        ? rawSettings.showDamageNumbers
        : defaultSettings.showDamageNumbers,
    screenShake:
      typeof rawSettings.screenShake === 'boolean'
        ? rawSettings.screenShake
        : defaultSettings.screenShake,
    visualEffectsQuality:
      rawSettings.visualEffectsQuality === 'medium' ? 'medium' : 'high',
    showMinimap:
      typeof rawSettings.showMinimap === 'boolean'
        ? rawSettings.showMinimap
        : defaultSettings.showMinimap,
    mouseFollow:
      typeof rawSettings.mouseFollow === 'boolean'
        ? rawSettings.mouseFollow
        : defaultSettings.mouseFollow,
    language: 'zh-CN',
  };

  return {
    version: 1,
    gold: nonNegInt(obj.gold, 0),
    totalGoldEarned: nonNegInt(obj.totalGoldEarned, 0),
    totalKills: nonNegInt(obj.totalKills, 0),
    totalRuns: nonNegInt(obj.totalRuns, 0),
    powerUps,
    unlockedHeroes,
    purchasedHeroes,
    unlockedStages,
    unlockedHyper,
    unlockedRelics,
    unlockedArcanas,
    unlockedAchievements,
    discoveredItems,
    bestiaryKills,
    bestRunByStage,
    sealedItems,
    heroStageClears,
    heroHyperClears,
    selectedHeroId,
    selectedStageId,
    stageOptions,
    funMode,
    settings,
  };
}

export class SaveStore {
  private readonly catalog: Catalog;
  private readonly storage: StorageLike;
  private readonly storageKey: string;
  private state: SaveState;
  private powerUpGoldLedger: number | null = null;

  constructor(
    catalog: Catalog = CATALOG,
    storage: StorageLike = resolveDefaultStorage(),
    storageKey = DEFAULT_SAVE_STORAGE_KEY,
  ) {
    this.catalog = catalog;
    this.storage = storage;
    this.storageKey = storageKey;
    this.state = this.load();
  }

  getState(): SaveState {
    return this.state;
  }

  load(): SaveState {
    try {
      const rawText = this.storage.getItem(this.storageKey);
      if (!rawText) {
        this.state = createDefaultSaveState(this.catalog);
        this.powerUpGoldLedger = 0;
        return this.state;
      }
      const parsed: unknown = JSON.parse(rawText);
      this.state = sanitizeSaveState(parsed, this.catalog);
      this.powerUpGoldLedger = this.readLedger();
      return this.state;
    } catch {
      this.state = createDefaultSaveState(this.catalog);
      this.powerUpGoldLedger = 0;
      return this.state;
    }
  }

  save(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.state));
      if (this.powerUpGoldLedger !== null) {
        this.storage.setItem(
          `${this.storageKey}:ledger`,
          String(this.powerUpGoldLedger),
        );
      }
    } catch {
      // Ignore quota / private mode storage errors safely
    }
  }

  reset(): SaveState {
    this.state = createDefaultSaveState(this.catalog);
    this.powerUpGoldLedger = 0;
    this.save();
    return this.state;
  }

  exportJson(): string {
    return JSON.stringify(this.state, null, 2);
  }

  importJson(
    json: string,
  ): { ok: true; state: SaveState } | { ok: false; error: string } {
    if (typeof json !== 'string' || json.trim().length === 0) {
      return { ok: false, error: '存档文本为空' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return { ok: false, error: 'JSON 格式无效' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '存档根节点必须为对象' };
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.version !== 1) {
      return { ok: false, error: `不支持的存档版本: ${String(obj.version)}` };
    }
    if (typeof obj.gold !== 'number' || !Number.isFinite(obj.gold) || obj.gold < 0) {
      return { ok: false, error: '无效的金币数值' };
    }
    if (
      obj.powerUps !== undefined &&
      (typeof obj.powerUps !== 'object' || obj.powerUps === null || Array.isArray(obj.powerUps))
    ) {
      return { ok: false, error: '无效的强化数据格式' };
    }
    if (
      obj.powerUps &&
      Object.entries(obj.powerUps as Record<string, unknown>).some(
        ([k, v]) =>
          !POWERUP_ID_SET.has(k) ||
          typeof v !== 'number' ||
          !Number.isFinite(v) ||
          v < 0,
      )
    ) {
      return { ok: false, error: '包含非法的强化 ID 或等级' };
    }

    this.state = sanitizeSaveState(parsed, this.catalog);
    this.powerUpGoldLedger = computePowerUpCanonicalRefund(
      this.state.powerUps,
      this.catalog,
    );
    this.save();
    return { ok: true, state: this.state };
  }

  getPowerUpRank(id: PowerUpId): number {
    return this.state.powerUps[id] ?? 0;
  }

  getTotalPowerUpRanks(): number {
    let total = 0;
    for (const id of POWERUP_IDS) {
      total += this.state.powerUps[id] ?? 0;
    }
    return total;
  }

  getPowerUpNextCost(id: PowerUpId): number | null {
    const def = this.catalog.powerUps[id];
    const current = this.getPowerUpRank(id);
    if (current >= def.maxRank) return null;
    return computePowerUpNextCost(
      id,
      current,
      this.getTotalPowerUpRanks(),
      this.catalog,
    );
  }

  getTotalPowerUpRefund(): number {
    if (this.getTotalPowerUpRanks() === 0) return 0;
    if (this.powerUpGoldLedger !== null && this.powerUpGoldLedger > 0) {
      return this.powerUpGoldLedger;
    }
    return computePowerUpCanonicalRefund(this.state.powerUps, this.catalog);
  }

  canBuyPowerUp(id: PowerUpId): boolean {
    const cost = this.getPowerUpNextCost(id);
    return cost !== null && this.state.gold >= cost;
  }

  buyPowerUp(id: PowerUpId): {
    ok: boolean;
    cost: number;
    newRank: number;
    error?: string;
  } {
    const current = this.getPowerUpRank(id);
    const cost = this.getPowerUpNextCost(id);
    if (cost === null) {
      return { ok: false, cost: 0, newRank: current, error: '已达到最高等级' };
    }
    if (this.state.gold < cost) {
      return { ok: false, cost, newRank: current, error: '金币不足' };
    }
    const baseSpent = this.getTotalPowerUpRefund();
    this.state.gold -= cost;
    this.state.powerUps[id] = current + 1;
    this.powerUpGoldLedger = baseSpent + cost;
    this.save();
    return { ok: true, cost, newRank: current + 1 };
  }

  refundPowerUps(): { refundedGold: number; clearedRanks: number } {
    const clearedRanks = this.getTotalPowerUpRanks();
    const refundedGold = this.getTotalPowerUpRefund();
    this.state.gold += refundedGold;
    this.state.powerUps = {};
    this.powerUpGoldLedger = 0;
    this.save();
    return { refundedGold, clearedRanks };
  }

  private readLedger(): number | null {
    if (this.getTotalPowerUpRanks() === 0) return 0;
    try {
      const raw = this.storage.getItem(`${this.storageKey}:ledger`);
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
    } catch {
      return null;
    }
  }

  isHeroUnlocked(id: HeroId): boolean {
    return this.state.unlockedHeroes.includes(id);
  }

  isHeroPurchased(id: HeroId): boolean {
    return this.state.purchasedHeroes.includes(id);
  }

  buyHero(id: HeroId): { ok: boolean; cost: number; error?: string } {
    if (!this.isHeroUnlocked(id)) {
      return { ok: false, cost: 0, error: '尚未解锁该角色' };
    }
    if (this.isHeroPurchased(id)) {
      return { ok: false, cost: 0, error: '已拥有该角色' };
    }
    const hero = this.catalog.heroes[id];
    if (this.state.gold < hero.cost) {
      return { ok: false, cost: hero.cost, error: '金币不足' };
    }
    this.state.gold -= hero.cost;
    this.state.purchasedHeroes.push(id);
    this.discoverItem(id);
    this.discoverItem(hero.startingWeapon);
    this.state.selectedHeroId = id;
    this.save();
    return { ok: true, cost: hero.cost };
  }

  selectHero(id: HeroId): boolean {
    if (!this.isHeroPurchased(id)) return false;
    this.state.selectedHeroId = id;
    this.save();
    return true;
  }

  selectStage(id: StageId): boolean {
    if (!this.state.unlockedStages.includes(id)) return false;
    this.state.selectedStageId = id;
    if (!this.state.unlockedHyper.includes(id)) {
      this.state.stageOptions.hyper = false;
    }
    this.save();
    return true;
  }

  setStageOptions(opts: Partial<SaveState['stageOptions']>): void {
    const next = { ...this.state.stageOptions, ...opts };
    if (!this.state.unlockedHyper.includes(this.state.selectedStageId)) {
      next.hyper = false;
    }
    if (!this.state.unlockedRelics.includes('relic_randomazzo')) {
      next.arcanasEnabled = false;
    }
    this.state.stageOptions = next;
    this.save();
  }

  getFunMode(): FunModeSettings {
    return this.state.funMode ?? { ...FUN_MODE_PRESETS.standard };
  }

  setFunPreset(preset: 'standard' | 'casual' | 'musou'): void {
    this.state.funMode = { ...FUN_MODE_PRESETS[preset] };
    this.save();
  }

  updateCustomFunMode(patch: Partial<FunModeMultipliers>): void {
    const cur = this.getFunMode();
    const merged: FunModeMultipliers = {
      mightMultiplier: Number(clampRange(patch.mightMultiplier ?? cur.mightMultiplier, 1, 5, cur.mightMultiplier).toFixed(2)),
      moveSpeedMultiplier: Number(clampRange(patch.moveSpeedMultiplier ?? cur.moveSpeedMultiplier, 1, 2, cur.moveSpeedMultiplier).toFixed(2)),
      xpMultiplier: Number(clampRange(patch.xpMultiplier ?? cur.xpMultiplier, 1, 4, cur.xpMultiplier).toFixed(2)),
      cooldownMultiplier: Number(clampRange(patch.cooldownMultiplier ?? cur.cooldownMultiplier, 0.5, 1, cur.cooldownMultiplier).toFixed(2)),
      damageTakenMultiplier: Number(clampRange(patch.damageTakenMultiplier ?? cur.damageTakenMultiplier, 0.25, 1, cur.damageTakenMultiplier).toFixed(2)),
      bonusRevivals: Math.round(clampRange(patch.bonusRevivals ?? cur.bonusRevivals, 0, 3, cur.bonusRevivals)),
      bonusAmount: Math.round(clampRange(patch.bonusAmount ?? cur.bonusAmount, 0, 3, cur.bonusAmount)),
    };
    this.state.funMode = {
      preset: resolveFunPreset(merged),
      ...merged,
    };
    this.save();
  }

  updateSettings(opts: Partial<AudioAndDisplaySettings>): void {
    const next: AudioAndDisplaySettings = {
      ...this.state.settings,
      ...opts,
      language: 'zh-CN',
    };
    next.bgmVolume = clamp01(next.bgmVolume, this.state.settings.bgmVolume);
    next.sfxVolume = clamp01(next.sfxVolume, this.state.settings.sfxVolume);
    this.state.settings = next;
    this.save();
  }

  addGold(amount: number): void {
    const clean = Math.max(0, Math.floor(amount));
    if (clean === 0) return;
    this.state.gold += clean;
    this.state.totalGoldEarned += clean;
    this.save();
  }

  discoverItem(itemId: string): void {
    if (
      VALID_ITEM_ID_SET.has(itemId) &&
      !this.state.discoveredItems.includes(itemId)
    ) {
      this.state.discoveredItems.push(itemId);
    }
  }

  unlockRelic(relicId: RelicId): void {
    if (!this.state.unlockedRelics.includes(relicId)) {
      this.state.unlockedRelics.push(relicId);
    }
    this.discoverItem(relicId);
  }

  getMaxSealCount(): number {
    return 4 + this.state.unlockedStages.length * 2;
  }

  getSealedItems(): readonly string[] {
    return this.state.sealedItems ?? [];
  }

  isItemSealed(itemId: string): boolean {
    return (this.state.sealedItems ?? []).includes(itemId);
  }

  toggleSealItem(itemId: BaseWeaponId | PassiveId): {
    ok: boolean;
    sealed: boolean;
    error?: string;
  } {
    if (!SEALABLE_ITEM_ID_SET.has(itemId)) {
      return { ok: false, sealed: false, error: '该物品不可封印' };
    }
    const list = this.state.sealedItems ?? (this.state.sealedItems = []);
    const idx = list.indexOf(itemId);
    if (idx !== -1) {
      list.splice(idx, 1);
      this.save();
      return { ok: true, sealed: false };
    }
    if (list.length >= this.getMaxSealCount()) {
      return { ok: false, sealed: false, error: '封印槽位已满' };
    }
    list.push(itemId);
    this.save();
    return { ok: true, sealed: true };
  }

  clearSealedItems(): void {
    this.state.sealedItems = [];
    this.save();
  }

  getHeroStageClears(heroId: HeroId): { normal: StageId[]; hyper: StageId[] } {
    return {
      normal: [...(this.state.heroStageClears?.[heroId] ?? [])],
      hyper: [...(this.state.heroHyperClears?.[heroId] ?? [])],
    };
  }

  applyAchievementRewards(achievementIds: readonly string[]): void {
    const byId = new Map(this.catalog.achievements.map((a) => [a.id, a]));
    for (const id of achievementIds) {
      const def = byId.get(id);
      if (!def) continue;
      if (!this.state.unlockedAchievements.includes(id)) {
        this.state.unlockedAchievements.push(id);
        const reward = def.reward;
        if (reward.gold && reward.gold > 0) {
          this.state.gold += reward.gold;
          this.state.totalGoldEarned += reward.gold;
        }
        if (reward.hero && !this.state.unlockedHeroes.includes(reward.hero)) {
          this.state.unlockedHeroes.push(reward.hero);
          if (this.catalog.heroes[reward.hero].cost <= 0) {
            if (!this.state.purchasedHeroes.includes(reward.hero)) {
              this.state.purchasedHeroes.push(reward.hero);
            }
          }
        }
        if (reward.stage && !this.state.unlockedStages.includes(reward.stage)) {
          this.state.unlockedStages.push(reward.stage);
        }
        if (
          reward.hyperStage &&
          !this.state.unlockedHyper.includes(reward.hyperStage)
        ) {
          this.state.unlockedHyper.push(reward.hyperStage);
        }
        if (reward.arcana && !this.state.unlockedArcanas.includes(reward.arcana)) {
          this.state.unlockedArcanas.push(reward.arcana);
        }
        if (reward.relic) {
          this.unlockRelic(reward.relic);
        }
        if (reward.weapon) this.discoverItem(reward.weapon);
        if (reward.passive) this.discoverItem(reward.passive);
      }
    }
  }

  recordSettlement(
    settlement: SettlementModalState,
    options?: {
      runBestiaryKills?: Partial<Record<EnemyId, number>>;
      discoveredItems?: readonly string[];
      unlockedRelics?: readonly RelicId[];
      hyperEnabled?: boolean;
    },
  ): void {
    const goldEarned = Math.max(0, Math.floor(settlement.goldEarned));
    this.state.gold += goldEarned;
    this.state.totalGoldEarned += goldEarned;
    this.state.totalKills += Math.max(0, Math.floor(settlement.kills));
    this.state.totalRuns += 1;

    if (options?.runBestiaryKills) {
      for (const enemyId of ENEMY_IDS) {
        const count = options.runBestiaryKills[enemyId] ?? 0;
        if (count > 0) {
          this.state.bestiaryKills[enemyId] =
            (this.state.bestiaryKills[enemyId] ?? 0) + count;
        }
      }
    }

    if (options?.discoveredItems) {
      for (const item of options.discoveredItems) {
        this.discoverItem(item);
      }
    }
    for (const wb of settlement.weaponBreakdown) {
      this.discoverItem(wb.weaponId);
    }

    if (options?.unlockedRelics) {
      for (const relic of options.unlockedRelics) {
        this.unlockRelic(relic);
      }
    }

    const prev = this.state.bestRunByStage[settlement.stageId];
    const nextRecord: StageBestRecord = {
      bestTimeSeconds: Math.max(
        prev?.bestTimeSeconds ?? 0,
        settlement.elapsedSeconds,
      ),
      bestLevel: Math.max(prev?.bestLevel ?? 1, settlement.level),
      bestKills: Math.max(prev?.bestKills ?? 0, settlement.kills),
      clears: (prev?.clears ?? 0) + (settlement.victory ? 1 : 0),
      hyperCleared:
        Boolean(prev?.hyperCleared) ||
        (Boolean(options?.hyperEnabled) && settlement.victory),
      lastHeroId: settlement.heroId,
    };
    this.state.bestRunByStage[settlement.stageId] = nextRecord;

    if (
      settlement.victory &&
      HERO_ID_SET.has(settlement.heroId) &&
      STAGE_ID_SET.has(settlement.stageId)
    ) {
      const heroStageClears =
        this.state.heroStageClears ?? (this.state.heroStageClears = {});
      appendUniqueStage(heroStageClears, settlement.heroId, settlement.stageId);
      if (options?.hyperEnabled) {
        const heroHyperClears =
          this.state.heroHyperClears ?? (this.state.heroHyperClears = {});
        appendUniqueStage(heroHyperClears, settlement.heroId, settlement.stageId);
      }
    }

    if (settlement.unlockedAchievements.length > 0) {
      this.applyAchievementRewards(settlement.unlockedAchievements);
    }

    this.save();
  }
}
