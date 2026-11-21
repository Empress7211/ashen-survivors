import { BASE_WEAPON_IDS, PASSIVE_IDS } from '../contracts/ids.ts';
import type {
  ArcanaId,
  AudioCue,
  BaseWeaponId,
  Catalog,
  ChestModalState,
  ChestRewardItem,
  ChestTier,
  DraftModalState,
  DraftOption,
  EnemyId,
  HeroId,
  PassiveId,
  PassiveSlotSnapshot,
  PickupId,
  RelicId,
  RenderPickupState,
  SaveState,
  StageId,
  StatBlock,
  WeaponId,
} from '../contracts/index.ts';
import type { SeededRng } from './Rng.ts';
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from './StatCalculator.ts';
import type { WeaponSystem } from './WeaponSystem.ts';

export const MAX_ACTIVE_XP_GEMS = 400;

export interface WorldPickup {
  uid: number;
  kind: 'pickup' | 'passive' | 'relic';
  itemId: PickupId | PassiveId | RelicId;
  x: number;
  y: number;
  value: number;
  bobPhase: number;
  magnetized: boolean;
  magnetSpeed: number;
  chestTier?: ChestTier;
  canEvolveChest?: boolean;
  chestOpen?: boolean;
}

export interface ProgressionHooks {
  onAudioCue(cue: AudioCue): void;
  onHealPlayer(amount: number): void;
  onFloatingText(
    x: number,
    y: number,
    text: string,
    kind: 'damage' | 'crit' | 'heal' | 'xp' | 'gold' | 'status',
  ): void;
  onRosaryTriggered(): void;
  onOrologionTriggered(seconds: number): void;
  onStatsDirty(): void;
}

export function xpRequiredForNextLevel(level: number): number {
  const safeLv = Math.max(1, Math.floor(level));
  if (safeLv < 20) return 5 + (safeLv - 1) * 10;
  if (safeLv < 40) return 195 + (safeLv - 20) * 13;
  return 455 + (safeLv - 40) * 16;
}

export class ProgressionSystem {
  readonly catalog: Catalog;
  readonly saveBaseline: SaveState;
  readonly stageId: StageId;
  readonly heroId: HeroId;
  readonly limitBreakEnabled: boolean;
  readonly arcanasEnabled: boolean;

  level = 1;
  xp = 0;
  xpToNextLevel = xpRequiredForNextLevel(1);
  goldEarned = 0;
  kills = 0;
  banishCount = 0;
  nonTiragisuRevivalsConsumed = 0;
  tiragisuRevivalsUsed = 0;
  divineBloodlineBonusMaxHp = 0;
  soulEaterMightBonus = 0;

  readonly passives = new Map<PassiveId, number>();
  readonly extraPassives = new Set<PassiveId>(); // stage ground passives allowed beyond 6 slots
  readonly arcanas: ArcanaId[] = [];
  readonly banishedItems = new Set<string>();
  readonly evolvedWeapons = new Set<WeaponId>();
  readonly defeatedBosses = new Set<EnemyId>();
  readonly collectedRelics = new Set<RelicId>();
  readonly discoveredItems = new Set<string>();
  readonly runUnlockedAchievements: string[] = [];
  readonly runBestiaryKills: Partial<Record<EnemyId, number>> = {};
  readonly pickups: WorldPickup[] = [];

  pendingLevelUps = 0;
  rerollsConsumed = 0;
  skipsConsumed = 0;
  banishesConsumed = 0;

  activeDraft: DraftModalState | null = null;
  activeChest: ChestModalState | null = null;

  private nextPickupUid = 1;
  private gemStreak = 0;
  private gemStreakTimer = 0;
  private madGrooveTimer = 0;
  private lastDraftOptionKeys = new Set<string>();

  constructor(
    catalog: Catalog,
    saveBaseline: SaveState,
    options: {
      stageId: StageId;
      heroId: HeroId;
      limitBreakEnabled: boolean;
      arcanasEnabled: boolean;
    },
  ) {
    this.catalog = catalog;
    this.saveBaseline = saveBaseline;
    this.stageId = options.stageId;
    this.heroId = options.heroId;
    this.limitBreakEnabled = options.limitBreakEnabled;
    this.arcanasEnabled = options.arcanasEnabled;
    for (const r of saveBaseline.unlockedRelics) {
      this.collectedRelics.add(r);
    }
    this.discoveredItems.add(options.heroId);
    this.discoveredItems.add(catalog.heroes[options.heroId].startingWeapon);
  }

  get totalRevivalsConsumed(): number {
    return this.nonTiragisuRevivalsConsumed + this.tiragisuRevivalsUsed;
  }

  getRemainingUtility(stats: StatBlock): {
    rerolls: number;
    skips: number;
    banishes: number;
    revivals: number;
  } {
    return {
      rerolls: Math.max(0, stats.rerolls - this.rerollsConsumed),
      skips: Math.max(0, stats.skips - this.skipsConsumed),
      banishes: Math.max(0, stats.banishes - this.banishesConsumed),
      revivals: Math.max(0, stats.revivals - this.nonTiragisuRevivalsConsumed),
    };
  }

  getPassiveSnapshots(): PassiveSlotSnapshot[] {
    const out: PassiveSlotSnapshot[] = [];
    for (const [passiveId, level] of this.passives.entries()) {
      out.push({
        passiveId,
        level,
        maxLevel: this.catalog.passives[passiveId].maxLevel,
      });
    }
    return out;
  }

  getRegularPassiveCount(): number {
    let count = 0;
    for (const id of this.passives.keys()) {
      if (!this.extraPassives.has(id)) count++;
    }
    return count;
  }

  spawnPickup(
    kind: 'pickup' | 'passive' | 'relic',
    itemId: PickupId | PassiveId | RelicId,
    x: number,
    y: number,
    options?: {
      value?: number;
      chestTier?: ChestTier;
      canEvolveChest?: boolean;
      magnetized?: boolean;
    },
  ): WorldPickup {
    let value = options?.value ?? 0;
    if (kind === 'pickup' && value === 0) {
      const def = this.catalog.pickups[itemId as PickupId];
      value = def.xpValue ?? def.goldValue ?? def.healValue ?? 0;
    }
    const inst: WorldPickup = {
      uid: this.nextPickupUid++,
      kind,
      itemId,
      x,
      y,
      value,
      bobPhase: (this.nextPickupUid % 16) * 0.4,
      magnetized: Boolean(options?.magnetized),
      magnetSpeed: 360,
      chestTier: options?.chestTier,
      canEvolveChest: options?.canEvolveChest,
      chestOpen: false,
    };
    this.pickups.push(inst);

    if (kind === 'pickup' && isXpGemId(itemId as PickupId)) {
      this.consolidateExcessXpGems(x, y);
    }
    return inst;
  }

  /**
   * Consolidates excess offscreen XP gems when total XP gems > MAX_ACTIVE_XP_GEMS (400)
   * without losing a single point of XP.
   */
  consolidateExcessXpGems(playerX: number, playerY: number): void {
    const xpIndices: number[] = [];
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i]!;
      if (p.kind === 'pickup' && isXpGemId(p.itemId as PickupId) && !p.magnetized) {
        xpIndices.push(i);
      }
    }
    if (xpIndices.length <= MAX_ACTIVE_XP_GEMS) return;

    // Sort indices by distance descending so farthest/offscreen gems merge first
    xpIndices.sort((ia, ib) => {
      const a = this.pickups[ia]!;
      const b = this.pickups[ib]!;
      const da = (a.x - playerX) * (a.x - playerX) + (a.y - playerY) * (a.y - playerY);
      const db = (b.x - playerX) * (b.x - playerX) + (b.y - playerY) * (b.y - playerY);
      return db - da;
    });

    const targetKeep = 350;
    const toMergeCount = xpIndices.length - targetKeep;
    if (toMergeCount < 2) return;

    const removeSet = new Set<number>();
    let totalMergedXp = 0;
    let sumX = 0;
    let sumY = 0;

    for (let k = 0; k < toMergeCount; k++) {
      const idx = xpIndices[k]!;
      const g = this.pickups[idx]!;
      removeSet.add(idx);
      totalMergedXp += g.value;
      sumX += g.x;
      sumY += g.y;
    }

    const anchorX = sumX / toMergeCount;
    const anchorY = sumY / toMergeCount;

    // Compact pickups removing merged indices
    let write = 0;
    for (let i = 0; i < this.pickups.length; i++) {
      if (!removeSet.has(i)) {
        this.pickups[write++] = this.pickups[i]!;
      }
    }
    this.pickups.length = write;

    const tier: PickupId =
      totalMergedXp >= 150 ? 'xp_gold' : totalMergedXp >= 25 ? 'xp_red' : 'xp_green';
    this.pickups.push({
      uid: this.nextPickupUid++,
      kind: 'pickup',
      itemId: tier,
      x: anchorX,
      y: anchorY,
      value: totalMergedXp,
      bobPhase: 0,
      magnetized: false,
      magnetSpeed: 360,
    });
  }

  getTotalFloorXp(): number {
    let sum = 0;
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i]!;
      if (p.kind === 'pickup' && isXpGemId(p.itemId as PickupId)) {
        sum += p.value;
      }
    }
    return sum;
  }

  activateVacuumAllGems(): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i]!;
      if (p.kind === 'pickup' && isXpGemId(p.itemId as PickupId)) {
        p.magnetized = true;
        p.magnetSpeed = Math.max(p.magnetSpeed, 560);
      }
    }
  }

  activateMadGroovePull(playerX: number, playerY: number, hooks: ProgressionHooks): void {
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i]!;
      if (p.kind === 'pickup' && !p.chestTier) {
        p.magnetized = true;
        p.magnetSpeed = 620;
      } else {
        // Pull chests / passives / relics directly near player feet
        const angle = (i * 0.8) % (Math.PI * 2);
        p.x = playerX + Math.cos(angle) * 44;
        p.y = playerY + Math.sin(angle) * 44;
      }
    }
    hooks.onFloatingText(playerX, playerY - 40, '疯狂律动 · 全图聚宝', 'status');
  }

  applyPentagramPickupEffect(
    eraseChance: number,
    vacuumAndRain: boolean,
    playerX: number,
    playerY: number,
    rng: SeededRng,
  ): void {
    if (vacuumAndRain) {
      // Gorgeous Moon: spawn extra crystal rain and vacuum everything
      for (let k = 0; k < 14; k++) {
        const theta = (k / 14) * Math.PI * 2;
        const r = rng.range(110, 320);
        this.spawnPickup(
          'pickup',
          k % 3 === 0 ? 'xp_red' : 'xp_green',
          playerX + Math.cos(theta) * r,
          playerY + Math.sin(theta) * r,
          { magnetized: true },
        );
      }
      this.activateVacuumAllGems();
      return;
    }

    if (eraseChance <= 0) return;
    let i = 0;
    while (i < this.pickups.length) {
      const p = this.pickups[i]!;
      const isProtected =
        p.kind === 'relic' ||
        p.kind === 'passive' ||
        Boolean(p.chestTier) ||
        p.magnetized;
      if (
        !isProtected &&
        Math.abs(p.x - playerX) <= 680 &&
        Math.abs(p.y - playerY) <= 420 &&
        rng.chance(eraseChance)
      ) {
        const last = this.pickups.pop()!;
        if (i < this.pickups.length) this.pickups[i] = last;
      } else {
        i++;
      }
    }
  }

  updatePickups(
    dt: number,
    stageClockSeconds: number,
    playerX: number,
    playerY: number,
    stats: StatBlock,
    weaponSystem: WeaponSystem,
    rng: SeededRng,
    hooks: ProgressionHooks,
  ): { openChest: ChestModalState | null; openArcana: boolean } {
    if (this.gemStreakTimer > 0) {
      this.gemStreakTimer = Math.max(0, this.gemStreakTimer - dt);
      if (this.gemStreakTimer === 0) this.gemStreak = 0;
    }

    if (this.arcanas.includes('arcana_viii_mad_groove')) {
      const interval =
        this.catalog.arcanas.arcana_viii_mad_groove.params.pullIntervalSeconds ?? 120;
      this.madGrooveTimer += dt;
      if (this.madGrooveTimer >= interval) {
        this.madGrooveTimer -= interval;
        this.activateMadGroovePull(playerX, playerY, hooks);
      }
    }

    const magnetR = 72 * stats.magnet;
    const directR = 28;
    let openedChest: ChestModalState | null = null;
    let openedArcana = false;

    let i = 0;
    while (i < this.pickups.length) {
      const p = this.pickups[i]!;
      p.bobPhase += dt * 4;
      const dx = playerX - p.x;
      const dy = playerY - p.y;
      const distSq = dx * dx + dy * dy;

      const magnetEligible =
        p.kind === 'pickup' && !p.chestTier && p.itemId !== 'chest_arcana';

      if (magnetEligible && !p.magnetized && distSq <= magnetR * magnetR) {
        p.magnetized = true;
      }

      if (p.magnetized) {
        p.magnetSpeed = Math.min(820, p.magnetSpeed + 650 * dt);
        const dist = Math.sqrt(distSq);
        if (dist > 1e-4) {
          const step = p.magnetSpeed * dt;
          if (step >= dist) {
            p.x = playerX;
            p.y = playerY;
          } else {
            p.x += (dx / dist) * step;
            p.y += (dy / dist) * step;
          }
        }
      }

      const collectDistSq =
        (playerX - p.x) * (playerX - p.x) + (playerY - p.y) * (playerY - p.y);

      if (collectDistSq <= directR * directR) {
        // Remove pickup
        const last = this.pickups.pop()!;
        if (i < this.pickups.length) this.pickups[i] = last;

        if (p.kind === 'relic') {
          const relicId = p.itemId as RelicId;
          this.collectedRelics.add(relicId);
          this.discoveredItems.add(relicId);
          hooks.onAudioCue({ type: 'pickup', kind: 'relic' });
          hooks.onFloatingText(
            playerX,
            playerY - 34,
            `圣物: ${this.catalog.relics[relicId].name}`,
            'status',
          );
          continue;
        }

        if (p.kind === 'passive') {
          const passiveId = p.itemId as PassiveId;
          this.grantStageGroundPassive(passiveId, hooks);
          hooks.onAudioCue({ type: 'pickup', kind: 'relic' });
          hooks.onFloatingText(
            playerX,
            playerY - 28,
            `+1 ${this.catalog.passives[passiveId].name}`,
            'status',
          );
          continue;
        }

        const pid = p.itemId as PickupId;
        if (isXpGemId(pid)) {
          this.grantXp(p.value * stats.growth);
          this.gemStreak = Math.min(16, this.gemStreak + 1);
          this.gemStreakTimer = 0.35;
          hooks.onAudioCue({
            type: 'xp_gem',
            tier: xpTierShort(pid),
            streak: this.gemStreak,
          });
          continue;
        }

        if (pid === 'coin' || pid === 'gold_bag' || pid === 'rich_gold_bag') {
          const goldGain = Math.max(1, Math.round(p.value * stats.greed));
          this.goldEarned += goldGain;
          hooks.onAudioCue({
            type: 'pickup',
            kind: pid === 'coin' ? 'coin' : 'gold_bag',
          });
          hooks.onFloatingText(playerX, playerY - 26, `+${goldGain}G`, 'gold');
          continue;
        }

        if (pid === 'roast_chicken') {
          const heal = p.value || 30;
          hooks.onHealPlayer(heal);
          hooks.onAudioCue({ type: 'pickup', kind: 'chicken' });
          continue;
        }

        if (pid === 'vacuum_orb') {
          this.activateVacuumAllGems();
          hooks.onAudioCue({ type: 'pickup', kind: 'vacuum' });
          hooks.onFloatingText(playerX, playerY - 30, '全图经验吸取!', 'status');
          continue;
        }

        if (pid === 'rosary') {
          hooks.onRosaryTriggered();
          hooks.onAudioCue({ type: 'pickup', kind: 'rosary' });
          hooks.onFloatingText(playerX, playerY - 30, '圣洁念珠净化!', 'status');
          continue;
        }

        if (pid === 'orologion') {
          const freezeSec = this.catalog.pickups.orologion.freezeSeconds ?? 10;
          hooks.onOrologionTriggered(freezeSec);
          hooks.onAudioCue({ type: 'pickup', kind: 'orologion' });
          hooks.onFloatingText(playerX, playerY - 30, '时间静止!', 'status');
          continue;
        }

        if (p.chestTier === 'arcana' || pid === 'chest_arcana') {
          openedArcana = true;
          hooks.onAudioCue({ type: 'chest_open', tier: 'arcana', itemCount: 1 });
          break;
        }

        if (
          p.chestTier ||
          pid === 'chest_bronze' ||
          pid === 'chest_silver' ||
          pid === 'chest_gold'
        ) {
          const tier: ChestTier =
            p.chestTier ??
            (pid === 'chest_gold'
              ? 'gold'
              : pid === 'chest_silver'
                ? 'silver'
                : 'bronze');
          openedChest = this.openTreasureChest(
            tier,
            Boolean(p.canEvolveChest),
            stats,
            weaponSystem,
            rng,
            hooks,
            stageClockSeconds,
          );
          break;
        }
      }

      i++;
    }

    return { openChest: openedChest, openArcana: openedArcana };
  }

  grantXp(amount: number): void {
    if (amount <= 0) return;
    this.xp += amount;
    while (this.xp >= this.xpToNextLevel) {
      this.xp -= this.xpToNextLevel;
      this.level += 1;
      this.pendingLevelUps += 1;
      this.xpToNextLevel = xpRequiredForNextLevel(this.level);
    }
  }

  grantStageGroundPassive(passiveId: PassiveId, hooks: ProgressionHooks): void {
    const cur = this.passives.get(passiveId) ?? 0;
    const def = this.catalog.passives[passiveId];
    if (cur < def.maxLevel) {
      if (cur === 0 && this.getRegularPassiveCount() >= MAX_PASSIVE_SLOTS) {
        this.extraPassives.add(passiveId);
      }
      this.passives.set(passiveId, cur + 1);
      this.discoveredItems.add(passiveId);
      hooks.onStatsDirty();
    }
  }

  buildLevelUpDraft(
    stats: StatBlock,
    weaponSystem: WeaponSystem,
    rng: SeededRng,
    excludePrevious = false,
  ): DraftModalState {
    const util = this.getRemainingUtility(stats);
    const desiredCount = rng.chance(Math.min(0.65, 0.25 * stats.luck)) ? 4 : 3;

    const candidates: { option: DraftOption; weight: number }[] = [];
    const heldWeapons = weaponSystem.slots;
    const heldWeaponIds = new Set(heldWeapons.map((s) => s.weaponId));
    const heldPassiveIds = new Set(this.passives.keys());
    const weaponSlotsFull = heldWeapons.length >= MAX_WEAPON_SLOTS;
    const passiveSlotsFull = this.getRegularPassiveCount() >= MAX_PASSIVE_SLOTS;

    // 1. Weapon upgrades & new base weapons
    for (const slot of heldWeapons) {
      if (slot.level >= slot.maxLevel || this.banishedItems.has(slot.weaponId)) {
        continue;
      }
      const def = this.catalog.weapons[slot.weaponId];
      const nextLv = slot.level + 1;
      const deltaDesc = def.levels[nextLv - 1]?.description ?? def.description;
      candidates.push({
        option: {
          optionId: `weapon:${slot.weaponId}`,
          kind: 'weapon',
          itemId: slot.weaponId,
          title: def.name,
          subtitle: `Lv ${slot.level} → Lv ${nextLv}`,
          description: deltaDesc,
          currentLevel: slot.level,
          nextLevel: nextLv,
          isNew: false,
        },
        weight: Math.max(40, def.rarity * 1.45),
      });
    }

    if (!weaponSlotsFull) {
      for (const wId of BASE_WEAPON_IDS) {
        if (heldWeaponIds.has(wId) || this.banishedItems.has(wId)) continue;
        // Skip if evolved form already held
        if (this.hasEvolvedFormOf(wId, heldWeaponIds)) continue;
        const def = this.catalog.weapons[wId];
        const unlocked =
          def.unlockedByDefault || this.saveBaseline.discoveredItems.includes(wId);
        if (!unlocked) continue;
        candidates.push({
          option: {
            optionId: `weapon:${wId}`,
            kind: 'weapon',
            itemId: wId,
            title: def.name,
            subtitle: '新武器 · Lv 1',
            description: def.description,
            currentLevel: 0,
            nextLevel: 1,
            isNew: true,
          },
          weight: Math.max(20, def.rarity),
        });
      }
    }

    // 2. Passive upgrades & new passives
    for (const [pId, lv] of this.passives.entries()) {
      const def = this.catalog.passives[pId];
      if (lv >= def.maxLevel || this.banishedItems.has(pId)) continue;
      const nextLv = lv + 1;
      candidates.push({
        option: {
          optionId: `passive:${pId}`,
          kind: 'passive',
          itemId: pId,
          title: def.name,
          subtitle: `Lv ${lv} → Lv ${nextLv}`,
          description: def.levelDescriptions[nextLv - 1] ?? def.description,
          currentLevel: lv,
          nextLevel: nextLv,
          isNew: false,
        },
        weight: Math.max(40, def.rarity * 1.45),
      });
    }

    if (!passiveSlotsFull) {
      for (const pId of PASSIVE_IDS) {
        if (heldPassiveIds.has(pId) || this.banishedItems.has(pId)) continue;
        const def = this.catalog.passives[pId];
        candidates.push({
          option: {
            optionId: `passive:${pId}`,
            kind: 'passive',
            itemId: pId,
            title: def.name,
            subtitle: '新被动 · Lv 1',
            description: def.levelDescriptions[0] ?? def.description,
            currentLevel: 0,
            nextLevel: 1,
            isNew: true,
          },
          weight: Math.max(20, def.rarity),
        });
      }
    }

    // 3. Limit Break or Consumables when full build
    if (candidates.length === 0) {
      if (this.limitBreakEnabled) {
        for (const slot of heldWeapons) {
          const def = this.catalog.weapons[slot.weaponId];
          if (!def.limitBreakable) continue;
          const lbStat = rng.pick(['might', 'area', 'cooldown', 'amount'] as const);
          const statDesc =
            lbStat === 'might'
              ? '武器伤害 +15%'
              : lbStat === 'area'
                ? '武器范围 +8%'
                : lbStat === 'cooldown'
                  ? '冷却缩减 -2.5%'
                  : '投射物数量 +1';
          candidates.push({
            option: {
              optionId: `limit_break:${slot.weaponId}:${lbStat}`,
              kind: 'limit_break',
              itemId: slot.weaponId,
              title: `${def.name} · 极限突破`,
              subtitle: `突破 Lv ${slot.limitBreakLevel + 1}`,
              description: statDesc,
              currentLevel: slot.limitBreakLevel,
              nextLevel: slot.limitBreakLevel + 1,
              isNew: false,
            },
            weight: 100,
          });
        }
      }
      if (candidates.length === 0) {
        candidates.push(
          {
            option: {
              optionId: 'consumable:gold_bag',
              kind: 'consumable',
              itemId: 'gold_bag',
              title: '钱袋',
              subtitle: '即时奖励',
              description: '立即获得 25 枚金币。',
              currentLevel: 0,
              nextLevel: 1,
              isNew: false,
            },
            weight: 100,
          },
          {
            option: {
              optionId: 'consumable:roast_chicken',
              kind: 'consumable',
              itemId: 'roast_chicken',
              title: '烤鸡',
              subtitle: '即时恢复',
              description: '立即恢复 30 点生命值。',
              currentLevel: 0,
              nextLevel: 1,
              isNew: false,
            },
            weight: 100,
          },
        );
      }
    }

    // Reroll filtering: prefer unseen options if enough exist
    let pool = candidates;
    if (excludePrevious && this.lastDraftOptionKeys.size > 0) {
      const filtered = candidates.filter(
        (c) => !this.lastDraftOptionKeys.has(c.option.optionId),
      );
      if (filtered.length >= Math.min(desiredCount, candidates.length)) {
        pool = filtered;
      }
    }

    const picked: DraftOption[] = [];
    const mutablePool = [...pool];
    const targetCount = Math.min(desiredCount, mutablePool.length);
    for (let k = 0; k < targetCount; k++) {
      const weights = mutablePool.map((c) => c.weight);
      const idx = rng.weightedIndex(weights);
      picked.push(mutablePool[idx]!.option);
      mutablePool.splice(idx, 1);
    }

    this.lastDraftOptionKeys = new Set(picked.map((o) => o.optionId));

    this.activeDraft = {
      mode: 'level_up',
      playerLevel: this.level,
      options: picked,
      rerollsRemaining: util.rerolls,
      skipsRemaining: util.skips,
      banishesRemaining: util.banishes,
      banishModeActive: false,
    };
    return this.activeDraft;
  }

  buildArcanaDraft(
    stats: StatBlock,
    rng: SeededRng,
    excludePrevious = false,
  ): DraftModalState | null {
    const util = this.getRemainingUtility(stats);
    const owned = new Set(this.arcanas);
    let available = this.saveBaseline.unlockedArcanas.filter(
      (id) => !owned.has(id) && !this.banishedItems.has(id),
    );
    if (available.length === 0) {
      return null;
    }

    if (excludePrevious && this.lastDraftOptionKeys.size > 0) {
      const filtered = available.filter(
        (id) => !this.lastDraftOptionKeys.has(`arcana:${id}`),
      );
      if (filtered.length > 0) {
        available = filtered;
      }
    }

    const shuffled = rng.shuffle([...available]);
    const pickedIds = shuffled.slice(0, Math.min(4, shuffled.length));
    const options: DraftOption[] = pickedIds.map((id) => {
      const def = this.catalog.arcanas[id];
      return {
        optionId: `arcana:${id}`,
        kind: 'arcana',
        itemId: id,
        title: `${def.roman} · ${def.name}`,
        subtitle: def.englishName,
        description: def.description,
        currentLevel: 0,
        nextLevel: 1,
        isNew: true,
      };
    });

    this.lastDraftOptionKeys = new Set(options.map((o) => o.optionId));
    this.activeDraft = {
      mode: 'arcana_select',
      playerLevel: this.level,
      options,
      rerollsRemaining: util.rerolls,
      skipsRemaining: 0,
      banishesRemaining: 0,
      banishModeActive: false,
    };
    return this.activeDraft;
  }

  chooseDraftOption(
    optionId: string,
    stats: StatBlock,
    weaponSystem: WeaponSystem,
    hooks: ProgressionHooks,
  ): boolean {
    if (!this.activeDraft) return false;
    const opt = this.activeDraft.options.find((o) => o.optionId === optionId);
    if (!opt) return false;

    if (this.activeDraft.banishModeActive) {
      return this.banishDraftOption(optionId, stats);
    }

    if (opt.kind === 'weapon') {
      const wId = opt.itemId as WeaponId;
      weaponSystem.addOrUpgradeWeapon(wId);
      this.discoveredItems.add(wId);
    } else if (opt.kind === 'passive') {
      const pId = opt.itemId as PassiveId;
      const cur = this.passives.get(pId) ?? 0;
      const maxLv = this.catalog.passives[pId].maxLevel;
      if (cur < maxLv) {
        this.passives.set(pId, cur + 1);
      }
      this.discoveredItems.add(pId);
    } else if (opt.kind === 'limit_break') {
      const parts = opt.optionId.split(':');
      const wId = parts[1] as WeaponId;
      const stat = (parts[2] as 'might' | 'area' | 'cooldown' | 'amount') || 'might';
      weaponSystem.applyLimitBreak(wId, stat);
    } else if (opt.kind === 'consumable') {
      if (opt.itemId === 'roast_chicken') {
        hooks.onHealPlayer(30);
      } else {
        this.goldEarned += Math.round(25 * stats.greed);
      }
    } else if (opt.kind === 'arcana') {
      const aId = opt.itemId as ArcanaId;
      if (!this.arcanas.includes(aId)) {
        this.arcanas.push(aId);
        this.discoveredItems.add(aId);
      }
    }

    hooks.onStatsDirty();
    this.activeDraft = null;
    return true;
  }

  rerollActiveDraft(
    stats: StatBlock,
    weaponSystem: WeaponSystem,
    rng: SeededRng,
  ): boolean {
    if (!this.activeDraft) return false;
    const util = this.getRemainingUtility(stats);
    if (util.rerolls <= 0) return false;
    this.rerollsConsumed += 1;
    if (this.activeDraft.mode === 'arcana_select') {
      this.buildArcanaDraft(stats, rng, true);
    } else {
      this.buildLevelUpDraft(stats, weaponSystem, rng, true);
    }
    return true;
  }

  skipActiveDraft(stats: StatBlock): boolean {
    if (!this.activeDraft || this.activeDraft.mode !== 'level_up') return false;
    const util = this.getRemainingUtility(stats);
    if (util.skips <= 0) return false;
    this.skipsConsumed += 1;
    this.xp += Math.round(this.xpToNextLevel * 0.25);
    this.activeDraft = null;
    return true;
  }

  toggleBanishMode(stats: StatBlock): boolean {
    if (!this.activeDraft || this.activeDraft.mode !== 'level_up') return false;
    const util = this.getRemainingUtility(stats);
    if (util.banishes <= 0 && !this.activeDraft.banishModeActive) return false;
    this.activeDraft = {
      ...this.activeDraft,
      banishModeActive: !this.activeDraft.banishModeActive,
    };
    return true;
  }

  banishDraftOption(optionId: string, stats: StatBlock): boolean {
    if (!this.activeDraft || this.activeDraft.mode !== 'level_up') return false;
    const util = this.getRemainingUtility(stats);
    if (util.banishes <= 0) return false;
    const opt = this.activeDraft.options.find((o) => o.optionId === optionId);
    if (!opt || opt.kind === 'consumable' || opt.kind === 'limit_break') {
      return false;
    }
    this.banishedItems.add(opt.itemId);
    this.banishesConsumed += 1;
    this.banishCount += 1;
    this.activeDraft = null;
    return true;
  }

  /**
   * Computes all currently eligible Evolution & Union recipes for the player's build.
   */
  getEligibleEvolutions(
    weaponSystem: WeaponSystem,
    elapsedSeconds: number,
    canEvolveChest = true,
  ) {
    const heldWeapons = new Map(weaponSystem.slots.map((s) => [s.weaponId, s]));
    const elapsedMinutes = elapsedSeconds / 60;
    return this.catalog.evolutions.filter((recipe) => {
      if (heldWeapons.has(recipe.evolvedId)) return false;
      if (!canEvolveChest || elapsedMinutes < recipe.minChestMinute) return false;

      const base = heldWeapons.get(recipe.baseWeapon);
      if (!base || base.level < base.maxLevel) return false;

      if (recipe.partnerWeapon) {
        const partner = heldWeapons.get(recipe.partnerWeapon);
        if (!partner || partner.level < partner.maxLevel) return false;
      }

      if (recipe.requiredPassive) {
        const passiveLv = this.passives.get(recipe.requiredPassive) ?? 0;
        const reqLv = recipe.requiresMaxPassive
          ? this.catalog.passives[recipe.requiredPassive].maxLevel
          : 1;
        if (passiveLv < reqLv) return false;
      }

      return true;
    });
  }

  openTreasureChest(
    tier: ChestTier,
    canEvolveChest: boolean,
    stats: StatBlock,
    weaponSystem: WeaponSystem,
    rng: SeededRng,
    hooks: ProgressionHooks,
    stageClockSeconds = 0,
  ): ChestModalState {
    // 1 / 3 / 5 item jackpot roll weighted by chest tier and Luck
    const p5 = (tier === 'gold' ? 0.16 : tier === 'silver' ? 0.06 : 0.02) * stats.luck;
    const p3 = (tier === 'gold' ? 0.45 : tier === 'silver' ? 0.25 : 0.1) * stats.luck;
    const roll = rng.next();
    const itemCount: 1 | 3 | 5 = roll < p5 ? 5 : roll < p5 + p3 ? 3 : 1;

    const items: ChestRewardItem[] = [];

    for (let slotIdx = 0; slotIdx < itemCount; slotIdx++) {
      // Check Evolution / Union eligibility first
      const eligibleEvos = this.getEligibleEvolutions(
        weaponSystem,
        stageClockSeconds,
        canEvolveChest,
      );
      if (eligibleEvos.length > 0) {
        const recipe = eligibleEvos[0]!;
        const evolvedDef = this.catalog.weapons[recipe.evolvedId];
        weaponSystem.evolveWeapon(
          recipe.baseWeapon,
          recipe.evolvedId,
          recipe.consumesPartnerWeapon ? recipe.partnerWeapon : undefined,
        );
        if (recipe.consumesPassive && recipe.requiredPassive) {
          this.passives.delete(recipe.requiredPassive);
          this.extraPassives.delete(recipe.requiredPassive);
        }
        this.evolvedWeapons.add(recipe.evolvedId);
        this.discoveredItems.add(recipe.evolvedId);
        hooks.onStatsDirty();
        hooks.onAudioCue({ type: 'evolution' });
        hooks.onAudioCue({
          type: 'chest_reveal',
          index: slotIdx,
          isEvolution: true,
        });
        items.push({
          kind: 'evolution',
          itemId: recipe.evolvedId,
          title: `${evolvedDef.name}（进化成功）`,
          description: evolvedDef.description,
          newLevel: 1,
          isEvolution: true,
        });
        continue;
      }

      // Upgrade a held non-maxed weapon or passive
      const upgradableWeapons = weaponSystem.slots.filter(
        (s) => s.level < s.maxLevel,
      );
      const upgradablePassives: [PassiveId, number][] = [];
      for (const [pId, lv] of this.passives.entries()) {
        if (lv < this.catalog.passives[pId].maxLevel) {
          upgradablePassives.push([pId, lv]);
        }
      }

      if (upgradableWeapons.length > 0) {
        const target = rng.pick(upgradableWeapons);
        weaponSystem.addOrUpgradeWeapon(target.weaponId);
        const def = this.catalog.weapons[target.weaponId];
        hooks.onStatsDirty();
        hooks.onAudioCue({
          type: 'chest_reveal',
          index: slotIdx,
          isEvolution: false,
        });
        items.push({
          kind: 'weapon_upgrade',
          itemId: target.weaponId,
          title: def.name,
          description: def.levels[target.level - 1]?.description ?? def.description,
          newLevel: target.level,
          isEvolution: false,
        });
      } else if (upgradablePassives.length > 0) {
        const [pId, lv] = rng.pick(upgradablePassives);
        const nextLv = lv + 1;
        this.passives.set(pId, nextLv);
        const def = this.catalog.passives[pId];
        hooks.onStatsDirty();
        hooks.onAudioCue({
          type: 'chest_reveal',
          index: slotIdx,
          isEvolution: false,
        });
        items.push({
          kind: 'passive_upgrade',
          itemId: pId,
          title: def.name,
          description: def.levelDescriptions[nextLv - 1] ?? def.description,
          newLevel: nextLv,
          isEvolution: false,
        });
      } else if (this.limitBreakEnabled) {
        const breakable = weaponSystem.slots.filter(
          (s) => this.catalog.weapons[s.weaponId].limitBreakable,
        );
        if (breakable.length > 0) {
          const target = rng.pick(breakable);
          const stat = rng.pick(['might', 'area', 'cooldown'] as const);
          weaponSystem.applyLimitBreak(target.weaponId, stat);
          const def = this.catalog.weapons[target.weaponId];
          hooks.onAudioCue({
            type: 'chest_reveal',
            index: slotIdx,
            isEvolution: false,
          });
          items.push({
            kind: 'limit_break',
            itemId: target.weaponId,
            title: `${def.name} · 极限突破`,
            description:
              stat === 'might'
                ? '武器伤害 +15%'
                : stat === 'area'
                  ? '武器范围 +8%'
                  : '冷却缩减 -2.5%',
            newLevel: target.limitBreakLevel,
            isEvolution: false,
          });
          continue;
        }
      }

      if (items.length <= slotIdx) {
        const goldAmt = Math.round((tier === 'gold' ? 80 : 40) * stats.greed);
        this.goldEarned += goldAmt;
        hooks.onAudioCue({
          type: 'chest_reveal',
          index: slotIdx,
          isEvolution: false,
        });
        items.push({
          kind: 'gold',
          title: '额外金币袋',
          description: `获得 ${goldAmt} 枚金币`,
          goldAmount: goldAmt,
          isEvolution: false,
        });
      }
    }

    const baseChestGold = tier === 'gold' ? 75 : tier === 'silver' ? 40 : 22;
    const bonusGold = Math.round(
      (baseChestGold + rng.int(5, 25)) * itemCount * stats.greed * 0.5,
    );
    this.goldEarned += bonusGold;

    hooks.onAudioCue({ type: 'chest_open', tier, itemCount });
    this.activeChest = {
      tier,
      itemCount,
      bonusGold,
      items,
    };
    return this.activeChest;
  }

  consumeReviveOnDeath(stats: StatBlock): boolean {
    const util = this.getRemainingUtility(stats);
    if (util.revivals <= 0) return false;
    const tiragisuLv = this.passives.get('tiragisu') ?? 0;
    if (tiragisuLv > 0) {
      if (tiragisuLv <= 1) {
        this.passives.delete('tiragisu');
        this.extraPassives.delete('tiragisu');
      } else {
        this.passives.set('tiragisu', tiragisuLv - 1);
      }
      this.tiragisuRevivalsUsed += 1;
    } else {
      this.nonTiragisuRevivalsConsumed += 1;
    }
    return true;
  }

  checkAchievementsLive(
    elapsedSeconds: number,
    weaponSystem: WeaponSystem,
    hooks?: ProgressionHooks,
    playerX = 0,
    playerY = 0,
  ): string[] {
    const newlyUnlocked: string[] = [];
    const elapsedMinutes = elapsedSeconds / 60;
    const totalKillsCombined = this.saveBaseline.totalKills + this.kills;
    const weaponLvMap = new Map(
      weaponSystem.slots.map((s) => [s.weaponId, s.level]),
    );

    for (const ach of this.catalog.achievements) {
      if (
        this.saveBaseline.unlockedAchievements.includes(ach.id) ||
        this.runUnlockedAchievements.includes(ach.id)
      ) {
        continue;
      }

      const cond = ach.condition;
      if (cond.stageId && cond.stageId !== this.stageId) continue;
      if (cond.heroId && cond.heroId !== this.heroId) continue;

      let satisfied = false;
      switch (cond.type) {
        case 'survive_minutes':
          satisfied = elapsedMinutes >= cond.targetValue;
          break;
        case 'reach_level':
          satisfied = this.level >= cond.targetValue;
          break;
        case 'total_kills':
          satisfied = totalKillsCombined >= cond.targetValue;
          break;
        case 'run_kills':
          satisfied = this.kills >= cond.targetValue;
          break;
        case 'evolve_weapon':
          satisfied = cond.targetId
            ? this.evolvedWeapons.has(cond.targetId as WeaponId)
            : this.evolvedWeapons.size >= cond.targetValue;
          break;
        case 'collect_gold':
          satisfied = this.goldEarned >= cond.targetValue;
          break;
        case 'collect_relic':
          satisfied = cond.targetId
            ? this.collectedRelics.has(cond.targetId as RelicId)
            : this.collectedRelics.size >= cond.targetValue;
          break;
        case 'defeat_boss':
          satisfied = cond.targetId
            ? this.defeatedBosses.has(cond.targetId as EnemyId)
            : this.defeatedBosses.size >= cond.targetValue;
          break;
        case 'max_weapon_level': {
          const targetId = cond.targetId as WeaponId | undefined;
          if (targetId) {
            satisfied = (weaponLvMap.get(targetId) ?? 0) >= cond.targetValue;
          }
          break;
        }
        case 'banish_count':
          satisfied = this.banishCount >= cond.targetValue;
          break;
        case 'revive_count':
          satisfied = this.totalRevivalsConsumed >= cond.targetValue;
          break;
        case 'unlock_stage':
          satisfied = cond.targetId
            ? this.saveBaseline.unlockedStages.includes(cond.targetId as StageId)
            : false;
          break;
      }

      if (satisfied) {
        this.runUnlockedAchievements.push(ach.id);
        newlyUnlocked.push(ach.id);
        hooks?.onFloatingText(
          playerX,
          playerY - 52,
          `成就解锁: ${ach.name}`,
          'status',
        );
      }
    }
    return newlyUnlocked;
  }

  getRenderPickups(): RenderPickupState[] {
    const out: RenderPickupState[] = [];
    this.fillRenderPickups(out);
    return out;
  }

  fillRenderPickups(out: RenderPickupState[]): void {
    const count = this.pickups.length;
    for (let i = 0; i < count; i++) {
      const p = this.pickups[i]!;
      let slot = out[i];
      if (!slot) {
        slot = {
          uid: p.uid,
          kind: p.kind,
          itemId: p.itemId,
          x: p.x,
          y: p.y,
          bobPhase: p.bobPhase,
          magnetized: p.magnetized,
          chestOpen: p.chestOpen,
        };
        out.push(slot);
      } else {
        slot.uid = p.uid;
        slot.kind = p.kind;
        slot.itemId = p.itemId;
        slot.x = p.x;
        slot.y = p.y;
        slot.bobPhase = p.bobPhase;
        slot.magnetized = p.magnetized;
        slot.chestOpen = p.chestOpen;
      }
    }
    out.length = count;
  }

  private hasEvolvedFormOf(
    baseId: BaseWeaponId,
    heldWeaponIds: Set<WeaponId>,
  ): boolean {
    for (const r of this.catalog.evolutions) {
      if (r.baseWeapon === baseId && heldWeaponIds.has(r.evolvedId)) {
        return true;
      }
    }
    return false;
  }
}

function isXpGemId(id: PickupId): boolean {
  return id === 'xp_blue' || id === 'xp_green' || id === 'xp_red' || id === 'xp_gold';
}

function xpTierShort(id: PickupId): 'blue' | 'green' | 'red' | 'gold' {
  if (id === 'xp_green') return 'green';
  if (id === 'xp_red') return 'red';
  if (id === 'xp_gold') return 'gold';
  return 'blue';
}
