import type {
  ArcanaId,
  AudioCue,
  BossBarState,
  Catalog,
  ChestModalState,
  DraftModalState,
  EnemyId,
  PassiveSlotSnapshot,
  PauseEvolutionHint,
  PauseMapMarker,
  PauseSnapshot,
  PickupId,
  RelicId,
  RenderBeamState,
  RenderEnemyState,
  RenderFloatingText,
  RenderFrameState,
  RenderPickupState,
  RenderPlayerState,
  RenderProjectileState,
  RenderPropState,
  RenderZoneState,
  ReviveModalState,
  RunPhase,
  RunStartConfig,
  SaveState,
  SettlementModalState,
  SimulationAction,
  StatBlock,
  WeaponId,
  WeaponSlotSnapshot,
} from '../contracts/index.ts';
import { CATALOG } from '../data/index.ts';
import { EnemySystem } from './EnemySystem.ts';
import { ProgressionSystem } from './ProgressionSystem.ts';
import { SeededRng } from './Rng.ts';
import { calculatePlayerStats } from './StatCalculator.ts';
import { WaveDirector } from './WaveDirector.ts';
import { WeaponSystem } from './WeaponSystem.ts';

export const FIXED_DT = 1 / 60;
const BASE_MOVE_SPEED = 160;
const PLAYER_RADIUS = 14;
const MAX_FLOATING_TEXTS = 120;

interface ActiveFloatingText {
  uid: number;
  x: number;
  y: number;
  text: string;
  kind: RenderFloatingText['kind'];
  age: number;
  maxAge: number;
}

export class GameSimulation {
  readonly catalog: Catalog;
  readonly config: RunStartConfig;
  readonly rng: SeededRng;
  readonly enemySystem: EnemySystem;
  readonly weaponSystem: WeaponSystem;
  readonly waveDirector: WaveDirector;
  readonly progression: ProgressionSystem;

  phase: RunPhase = 'playing';
  tick = 0;

  playerX = 0;
  playerY = 0;
  playerVx = 0;
  playerVy = 0;
  facingX = 1;
  facingY = 0;
  hp: number;
  invulnTimer = 0;
  hitFlashTimer = 0;
  playerAnimTimer = 0;
  playerAnimFrame: 0 | 1 | 2 | 3 = 0;
  isMoving = false;

  stats: StatBlock;
  private statsDirty = true;
  private readonly saveBaseline: SaveState;
  private readonly audioCueQueue: AudioCue[] = [];
  private readonly floatingTexts: ActiveFloatingText[] = [];
  private readonly contactScratch: number[] = [];
  private readonly frostScratch: number[] = [];
  private readonly rosaryScratch: number[] = [];

  private nextTextUid = 1;
  private textRingCursor = 0;
  private screenFlash: { color: number; alpha: number } | null = null;
  private screenShake = 0;
  private recoveryAccum = 0;
  private sarabandeBuffer = 0;
  private soulEaterHealAccum = 0;
  private causeOfDeath?: string;
  private settlementModal: SettlementModalState | null = null;
  private cachedRelicsList: RelicId[] = [];
  private cachedRelicCount = -1;

  // Reusable zero-allocation RenderFrameState buffers
  private readonly frameEnemies: RenderEnemyState[] = [];
  private readonly frameProjectiles: RenderProjectileState[] = [];
  private readonly frameZones: RenderZoneState[] = [];
  private readonly frameBeams: RenderBeamState[] = [];
  private readonly framePickups: RenderPickupState[] = [];
  private readonly frameProps: RenderPropState[] = [];
  private readonly frameFloatingTexts: RenderFloatingText[] = [];
  private readonly frameAudioCues: AudioCue[] = [];
  private readonly frameHudWeapons: WeaponSlotSnapshot[] = [];
  private readonly frameHudPassives: PassiveSlotSnapshot[] = [];
  private readonly frameHudArcanas: ArcanaId[] = [];
  private readonly frameMapMarkers: PauseMapMarker[] = [];
  private readonly frameBossBar: BossBarState = {
    enemyId: 'boss_giant_bat',
    name: '',
    hp: 0,
    maxHp: 0,
  };
  private readonly framePlayer: RenderPlayerState;
  private readonly frameScreenFlash = { color: 0, alpha: 0 };
  private readonly frameState: RenderFrameState;

  constructor(
    config: RunStartConfig,
    saveBaseline: SaveState,
    catalog: Catalog = CATALOG,
  ) {
    this.catalog = catalog;
    this.config = config;
    this.saveBaseline = saveBaseline;
    this.rng = new SeededRng(config.seed ?? 0x1337beef);

    const stageDef = catalog.stages[config.stageId];
    const heroDef = catalog.heroes[config.heroId];

    this.enemySystem = new EnemySystem(catalog, 96);
    this.weaponSystem = new WeaponSystem(catalog);
    this.waveDirector = new WaveDirector(catalog, stageDef, {
      hyper: config.hyper,
      hurry: config.hurry,
      endless: config.endless,
      arcanasEnabled: config.arcanasEnabled,
      seed: config.seed ?? 0x1337beef,
    });
    this.progression = new ProgressionSystem(catalog, saveBaseline, {
      stageId: config.stageId,
      heroId: config.heroId,
      limitBreakEnabled: config.limitBreakEnabled,
      arcanasEnabled: config.arcanasEnabled,
    });

    // Equip hero's starting weapon
    this.weaponSystem.addOrUpgradeWeapon(heroDef.startingWeapon);

    // Compute initial stats & HP
    this.hp = heroDef.baseStats.maxHp;
    this.stats = this.recomputeStats();
    this.hp = this.stats.maxHp;

    this.framePlayer = {
      heroId: config.heroId,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facingX: 1,
      facingY: 0,
      hp: this.hp,
      maxHp: this.stats.maxHp,
      invulnTimer: 0,
      hitFlash: false,
      laurelShieldCharges: 0,
      animFrame: 0,
      isMoving: false,
      garlicRadius: 0,
      soulEaterActive: false,
    };

    const util = this.progression.getRemainingUtility(this.stats);
    this.frameState = {
      phase: this.phase,
      stageId: config.stageId,
      corridorBounds: stageDef.corridorBounds,
      tick: 0,
      player: this.framePlayer,
      enemies: this.frameEnemies,
      projectiles: this.frameProjectiles,
      zones: this.frameZones,
      beams: this.frameBeams,
      pickups: this.framePickups,
      props: this.frameProps,
      floatingTexts: this.frameFloatingTexts,
      screenFlash: null,
      screenShake: 0,
      hud: {
        elapsedSeconds: 0,
        stageDurationSeconds: stageDef.durationSeconds,
        level: 1,
        xp: 0,
        xpToNextLevel: 5,
        hp: this.hp,
        maxHp: this.stats.maxHp,
        kills: 0,
        goldEarned: 0,
        weapons: this.frameHudWeapons,
        passives: this.frameHudPassives,
        arcanas: this.frameHudArcanas,
        rerollsRemaining: util.rerolls,
        skipsRemaining: util.skips,
        banishesRemaining: util.banishes,
        revivalsRemaining: util.revivals,
        activeEnemyCount: 0,
        stageId: config.stageId,
        hyper: config.hyper,
        hurry: config.hurry,
        endless: config.endless,
        endlessCycle: 0,
        hasMilkyWayMap: false,
        mapMarkers: undefined,
      },
      bossBar: null,
      draftModal: null,
      chestModal: null,
      reviveModal: null,
      settlementModal: null,
      pauseSnapshot: null,
      audioCues: this.frameAudioCues,
    };

    // Spawn stage ground passives/relics and initial prop ring immediately at tick 0
    this.waveDirector.ensureInitialWorldSetup(
      this.playerX,
      this.playerY,
      this.enemySystem,
      this.getCollectedRelicsList(),
      {
        onAudioCue: (cue) => this.pushAudioCue(cue),
        onSpawnPickup: (kind, itemId, x, y, opts) => {
          this.progression.spawnPickup(
            kind,
            itemId as PickupId,
            x,
            y,
            opts,
          );
        },
      },
    );

    // 0:00 Arcana selection if arcanasEnabled and unlockedArcanas available
    if (config.arcanasEnabled && saveBaseline.unlockedArcanas.length > 0) {
      const draft = this.progression.buildArcanaDraft(this.stats, this.rng);
      if (draft) {
        this.phase = 'arcana_select';
        this.frameState.phase = this.phase;
      }
    }
  }

  private getCollectedRelicsList(): RelicId[] {
    if (this.progression.collectedRelics.size !== this.cachedRelicCount) {
      this.cachedRelicCount = this.progression.collectedRelics.size;
      this.cachedRelicsList = Array.from(this.progression.collectedRelics);
    }
    return this.cachedRelicsList;
  }

  step(inputX = 0, inputY = 0, dt = FIXED_DT): RenderFrameState {
    this.stepTick(inputX, inputY, dt);
    return this.getRenderFrame();
  }

  stepTick(inputX = 0, inputY = 0, dt = FIXED_DT): RunPhase {
    if (this.phase !== 'playing') {
      return this.phase;
    }

    this.tick += 1;
    this.progression.lastPlayerX = this.playerX;
    this.progression.lastPlayerY = this.playerY;

    // Recompute dynamic stats (supports oscillating Arcanas XVII/XVIII, Divine Bloodline, etc.)
    const prevMaxHp = this.stats.maxHp;
    this.stats = this.recomputeStats();
    if (this.statsDirty) {
      this.statsDirty = false;
      if (this.stats.maxHp > prevMaxHp && this.hp > 0) {
        this.hp = Math.min(this.stats.maxHp, this.hp + (this.stats.maxHp - prevMaxHp));
      }
    }
    if (this.hp > this.stats.maxHp) {
      this.hp = this.stats.maxHp;
    }

    // 1. Player movement & corridor/prop clamping
    this.updatePlayerMovement(inputX, inputY, dt);
    this.progression.lastPlayerX = this.playerX;
    this.progression.lastPlayerY = this.playerY;

    // 2. Player HP Recovery
    if (this.stats.recovery > 0 && this.hp > 0 && this.hp < this.stats.maxHp) {
      this.recoveryAccum += this.stats.recovery * dt;
      if (this.recoveryAccum >= 1) {
        const whole = Math.floor(this.recoveryAccum);
        this.recoveryAccum -= whole;
        this.applyPlayerHealing(whole);
      }
    }

    // 3. Timers & screen effects
    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.hitFlashTimer > 0) this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    if (this.screenShake > 0) this.screenShake = Math.max(0, this.screenShake - dt * 28);
    if (this.screenFlash) {
      this.screenFlash.alpha -= dt * 1.4;
      if (this.screenFlash.alpha <= 0) this.screenFlash = null;
    }
    this.updateFloatingTexts(dt);

    // 4. Wave Director spawning
    this.waveDirector.update(
      dt,
      this.stats,
      this.playerX,
      this.playerY,
      this.enemySystem,
      this.rng,
      this.getCollectedRelicsList(),
      {
        onAudioCue: (cue) => this.pushAudioCue(cue),
        onSpawnPickup: (kind, itemId, x, y, opts) => {
          this.progression.spawnPickup(
            kind,
            itemId as PickupId,
            x,
            y,
            opts,
          );
        },
      },
    );

    // 5. Enemy movement, freeze, knockback decay, corridor bounds, SpatialHashGrid rebuild
    const corridorBounds = this.waveDirector.stage.corridorBounds;
    this.enemySystem.update(
      dt,
      this.tick,
      this.playerX,
      this.playerY,
      corridorBounds,
    );

    // 6. Weapons combat update
    this.weaponSystem.update(
      dt,
      this.playerX,
      this.playerY,
      this.facingX,
      this.facingY,
      this.stats,
      this.progression.arcanas,
      this.enemySystem,
      this.rng,
      corridorBounds,
      this.createWeaponHooks(),
    );

    // 7. Enemy-player contact damage & Laurel / Revival checks
    this.handleEnemyContact();

    // 8. Pickups, Magnet, XP & Chest / Arcana triggers
    if (this.phase === 'playing') {
      const pickupEvents = this.progression.updatePickups(
        dt,
        this.waveDirector.stageClockSeconds,
        this.playerX,
        this.playerY,
        this.stats,
        this.weaponSystem,
        this.rng,
        this.createProgressionHooks(),
      );

      if (pickupEvents.openChest) {
        this.phase = 'chest';
      } else if (pickupEvents.openArcana) {
        const arcanaDraft = this.progression.buildArcanaDraft(this.stats, this.rng);
        if (arcanaDraft) {
          this.phase = 'arcana_select';
        }
      } else if (this.progression.pendingLevelUps > 0) {
        this.openNextLevelUpDraft();
      }
    }

    // 9. Live achievement evaluation (every 15 ticks)
    if (this.tick % 15 === 0) {
      this.progression.checkAchievementsLive(
        this.waveDirector.stageClockSeconds,
        this.weaponSystem,
        this.createProgressionHooks(),
        this.playerX,
        this.playerY,
      );
    }

    return this.phase;
  }

  getRenderFrame(): RenderFrameState {
    const frame = this.buildRenderFrameState();
    this.audioCueQueue.length = 0;
    return frame;
  }

  dispatch(action: SimulationAction): RenderFrameState {
    switch (action.type) {
      case 'choose_draft': {
        if (this.phase !== 'level_up' && this.phase !== 'arcana_select') break;
        const ok = this.progression.chooseDraftOption(
          action.optionId,
          this.stats,
          this.weaponSystem,
          this.createProgressionHooks(),
        );
        if (!ok) {
          this.pushAudioCue({ type: 'ui_error' });
          break;
        }
        this.pushAudioCue({ type: 'ui_click' });
        const prevMax = this.stats.maxHp;
        this.stats = this.recomputeStats();
        this.statsDirty = false;
        if (this.stats.maxHp > prevMax) {
          this.hp = Math.min(this.stats.maxHp, this.hp + (this.stats.maxHp - prevMax));
        }

        if (this.phase === 'level_up') {
          this.progression.pendingLevelUps = Math.max(
            0,
            this.progression.pendingLevelUps - 1,
          );
        }

        if (this.progression.pendingLevelUps > 0) {
          this.openNextLevelUpDraft();
        } else {
          this.phase = 'playing';
        }
        this.progression.checkAchievementsLive(
          this.waveDirector.stageClockSeconds,
          this.weaponSystem,
          this.createProgressionHooks(),
          this.playerX,
          this.playerY,
        );
        break;
      }

      case 'reroll_draft': {
        if (this.phase !== 'level_up' && this.phase !== 'arcana_select') break;
        const ok = this.progression.rerollActiveDraft(
          this.stats,
          this.weaponSystem,
          this.rng,
        );
        this.pushAudioCue({ type: ok ? 'ui_click' : 'ui_error' });
        break;
      }

      case 'skip_draft': {
        if (this.phase !== 'level_up') break;
        const ok = this.progression.skipActiveDraft(this.stats);
        if (!ok) {
          this.pushAudioCue({ type: 'ui_error' });
          break;
        }
        this.pushAudioCue({ type: 'ui_click' });
        this.progression.pendingLevelUps = Math.max(
          0,
          this.progression.pendingLevelUps - 1,
        );
        if (this.progression.pendingLevelUps > 0) {
          this.openNextLevelUpDraft();
        } else {
          this.phase = 'playing';
        }
        break;
      }

      case 'toggle_banish_mode': {
        if (this.phase !== 'level_up') break;
        const ok = this.progression.toggleBanishMode(this.stats);
        this.pushAudioCue({ type: ok ? 'ui_click' : 'ui_error' });
        break;
      }

      case 'banish_draft': {
        if (this.phase !== 'level_up') break;
        const ok = this.progression.banishDraftOption(action.optionId, this.stats);
        if (!ok) {
          this.pushAudioCue({ type: 'ui_error' });
          break;
        }
        this.pushAudioCue({ type: 'ui_click' });
        this.progression.pendingLevelUps = Math.max(
          0,
          this.progression.pendingLevelUps - 1,
        );
        this.progression.checkAchievementsLive(
          this.waveDirector.stageClockSeconds,
          this.weaponSystem,
          this.createProgressionHooks(),
          this.playerX,
          this.playerY,
        );
        if (this.progression.pendingLevelUps > 0) {
          this.openNextLevelUpDraft();
        } else {
          this.phase = 'playing';
        }
        break;
      }

      case 'close_chest': {
        if (this.phase !== 'chest') break;
        this.progression.activeChest = null;
        this.pushAudioCue({ type: 'ui_click' });
        this.progression.checkAchievementsLive(
          this.waveDirector.stageClockSeconds,
          this.weaponSystem,
          this.createProgressionHooks(),
          this.playerX,
          this.playerY,
        );
        if (this.progression.pendingLevelUps > 0) {
          this.openNextLevelUpDraft();
        } else {
          this.phase = 'playing';
        }
        break;
      }

      case 'confirm_revive': {
        if (this.phase !== 'revive') break;
        const ok = this.progression.consumeReviveOnDeath(this.stats);
        if (!ok) {
          this.enterSettlement(this.waveDirector.reachedStageTimeLimit);
          break;
        }
        this.stats = this.recomputeStats();
        this.statsDirty = false;
        this.hp = Math.max(1, Math.round(this.stats.maxHp * 0.5));
        this.invulnTimer = 3.0;
        this.hitFlashTimer = 0;

        // Invulnerability revival shockwave knocking back & damaging nearby enemies
        const count = this.enemySystem.grid.queryRadius(
          this.playerX,
          this.playerY,
          380,
          this.contactScratch,
        );
        for (let i = 0; i < count; i++) {
          const idx = this.contactScratch[i]!;
          const e = this.enemySystem.enemies[idx];
          if (!e || !e.alive) continue;
          this.enemySystem.damageEnemy(idx, 120 * this.stats.might, {
            knockX: e.x - this.playerX,
            knockY: e.y - this.playerY,
            knockForce: 110,
          });
        }
        this.screenFlash = { color: 0xffd86b, alpha: 0.65 };
        this.screenShake = 14;
        this.pushAudioCue({ type: 'revive' });
        this.pushFloatingText(this.playerX, this.playerY - 40, '浴火重生!', 'status');
        this.progression.checkAchievementsLive(
          this.waveDirector.stageClockSeconds,
          this.weaponSystem,
          this.createProgressionHooks(),
          this.playerX,
          this.playerY,
        );
        this.phase = 'playing';
        break;
      }

      case 'forfeit_revive': {
        if (this.phase !== 'revive') break;
        this.enterSettlement(this.waveDirector.reachedStageTimeLimit);
        break;
      }

      case 'toggle_pause': {
        if (this.phase === 'playing') {
          this.phase = 'paused';
          this.pushAudioCue({ type: 'ui_click' });
        } else if (this.phase === 'paused') {
          this.phase = 'playing';
          this.pushAudioCue({ type: 'ui_click' });
        }
        break;
      }

      case 'end_run': {
        if (this.phase !== 'settlement') {
          this.causeOfDeath = this.causeOfDeath ?? '主动撤离战场';
          this.enterSettlement(this.waveDirector.reachedStageTimeLimit);
        }
        break;
      }
    }

    const frame = this.buildRenderFrameState();
    this.audioCueQueue.length = 0;
    return frame;
  }

  getRunSummaryForSave(): {
    settlement: SettlementModalState;
    runBestiaryKills: Partial<Record<EnemyId, number>>;
    discoveredItems: string[];
    unlockedRelics: import('../contracts/ids.ts').RelicId[];
    hyperEnabled: boolean;
  } {
    const settlement =
      this.settlementModal ??
      this.buildSettlementModal(this.waveDirector.reachedStageTimeLimit);
    return {
      settlement,
      runBestiaryKills: { ...this.progression.runBestiaryKills },
      discoveredItems: Array.from(this.progression.discoveredItems),
      unlockedRelics: Array.from(this.progression.collectedRelics),
      hyperEnabled: this.config.hyper,
    };
  }

  private recomputeStats(): StatBlock {
    return calculatePlayerStats({
      catalog: this.catalog,
      heroId: this.config.heroId,
      stageId: this.config.stageId,
      playerLevel: this.progression.level,
      currentHp: this.hp,
      powerUps: this.saveBaseline.powerUps,
      passives: this.progression.passives,
      weaponSlotCount: this.weaponSystem.slots.length,
      arcanas: this.progression.arcanas,
      hyper: this.config.hyper,
      elapsedSeconds: this.waveDirector.realElapsedSeconds,
      revivalsConsumed: this.progression.totalRevivalsConsumed,
      divineBloodlineBonusMaxHp: this.progression.divineBloodlineBonusMaxHp,
      soulEaterMightBonus: this.progression.soulEaterMightBonus,
    });
  }

  private updatePlayerMovement(inputX: number, inputY: number, dt: number): void {
    const mag = Math.hypot(inputX, inputY);
    let nx = 0;
    let ny = 0;
    if (mag > 0.05) {
      const clampMag = Math.min(1, mag);
      nx = (inputX / mag) * clampMag;
      ny = (inputY / mag) * clampMag;
      this.isMoving = true;
      if (Math.abs(nx) > 0.02 || Math.abs(ny) > 0.02) {
        const fMag = Math.hypot(nx, ny);
        this.facingX = nx / fMag;
        this.facingY = ny / fMag;
      }
      this.playerAnimTimer += dt;
      if (this.playerAnimTimer >= 0.12) {
        this.playerAnimTimer -= 0.12;
        this.playerAnimFrame = (((this.playerAnimFrame + 1) & 3) as 0 | 1 | 2 | 3);
      }
    } else {
      this.isMoving = false;
      this.playerAnimTimer = 0;
      this.playerAnimFrame = 0;
    }

    const moveSpeed = BASE_MOVE_SPEED * this.stats.moveSpeed;
    this.playerVx = nx * moveSpeed;
    this.playerVy = ny * moveSpeed;

    const clamped = this.enemySystem.clampPlayerPosition(
      this.playerX + this.playerVx * dt,
      this.playerY + this.playerVy * dt,
      PLAYER_RADIUS,
      this.waveDirector.stage.corridorBounds,
    );
    this.playerX = clamped.x;
    this.playerY = clamped.y;
  }

  private handleEnemyContact(): void {
    if (this.invulnTimer > 0 || this.hp <= 0) return;

    const count = this.enemySystem.grid.queryRadius(
      this.playerX,
      this.playerY,
      PLAYER_RADIUS,
      this.contactScratch,
    );
    let maxContactDmg = 0;
    let attackerName = '';
    for (let i = 0; i < count; i++) {
      const idx = this.contactScratch[i]!;
      const e = this.enemySystem.enemies[idx];
      if (!e || !e.alive || e.freezeTimer > 0) continue;
      if (e.damage > maxContactDmg) {
        maxContactDmg = e.damage;
        attackerName = this.catalog.enemies[e.enemyId].name;
      }
    }
    if (maxContactDmg <= 0) return;

    // Try Laurel shield first
    const laurelRes = this.weaponSystem.tryConsumeLaurelShield(
      this.playerX,
      this.playerY,
      this.stats,
      this.progression.arcanas,
      this.enemySystem,
      this.rng,
      this.createWeaponHooks(),
    );
    if (laurelRes.blocked) {
      this.invulnTimer = Math.max(0.25, laurelRes.invulnSeconds);
      this.screenFlash = { color: 0x62f5ff, alpha: 0.3 };
      return;
    }

    const taken = Math.max(1, Math.round(maxContactDmg - this.stats.armor));
    this.hp = Math.max(0, this.hp - taken);
    this.invulnTimer = 0.25;
    this.hitFlashTimer = 0.12;
    this.screenShake = Math.max(this.screenShake, 7);
    this.pushAudioCue({ type: 'player_hurt' });

    // Arcana IX Divine Bloodline contact retaliation
    if (this.progression.arcanas.includes('arcana_ix_divine_bloodline')) {
      const p = this.catalog.arcanas.arcana_ix_divine_bloodline.params;
      const reflectDmg = Math.max(10, this.stats.armor * 14 * this.stats.might);
      for (let i = 0; i < count; i++) {
        const idx = this.contactScratch[i]!;
        const e = this.enemySystem.enemies[idx];
        if (!e || !e.alive) continue;
        const res = this.enemySystem.damageEnemy(idx, reflectDmg, {
          knockX: e.x - this.playerX,
          knockY: e.y - this.playerY,
          knockForce: 45,
        });
        if (res.killed) {
          this.progression.divineBloodlineBonusMaxHp +=
            p.maxHpPerRetaliationKill ?? 0.5;
          this.statsDirty = true;
          this.handleEnemyDeathReward(
            e.enemyId,
            e.x,
            e.y,
            e.xpValue,
            e.xpTier,
            e.isBoss,
            e.isReaper,
            e.chestTier,
            e.canEvolveChest,
            true,
          );
        }
      }
    }

    // Arcana XIX Heart of Fire retaliation
    if (this.progression.arcanas.includes('arcana_xix_heart_of_fire')) {
      const fp = this.catalog.arcanas.arcana_xix_heart_of_fire.params;
      const blastCount = this.enemySystem.grid.queryRadius(
        this.playerX,
        this.playerY,
        (fp.explosionRadius ?? 90) * this.stats.area,
        this.rosaryScratch,
      );
      for (let i = 0; i < blastCount; i++) {
        const idx = this.rosaryScratch[i]!;
        const e = this.enemySystem.enemies[idx];
        if (!e || !e.alive) continue;
        const res = this.enemySystem.damageEnemy(
          idx,
          (fp.explosionDamage ?? 32) * this.stats.might,
          { knockX: e.x - this.playerX, knockY: e.y - this.playerY, knockForce: 40 },
        );
        if (res.killed) {
          this.handleEnemyDeathReward(
            e.enemyId,
            e.x,
            e.y,
            e.xpValue,
            e.xpTier,
            e.isBoss,
            e.isReaper,
            e.chestTier,
            e.canEvolveChest,
            false,
          );
        }
      }
    }

    if (this.hp <= 0) {
      this.causeOfDeath = attackerName || '黑暗魔物';
      const util = this.progression.getRemainingUtility(this.stats);
      if (util.revivals > 0) {
        this.phase = 'revive';
      } else {
        this.enterSettlement(this.waveDirector.reachedStageTimeLimit);
      }
    }
  }

  private applyPlayerHealing(baseAmount: number, sourceWeapon?: WeaponId): void {
    if (baseAmount <= 0 || this.hp <= 0) return;
    const hasSarabande = this.progression.arcanas.includes('arcana_vi_sarabande');
    const mult = hasSarabande
      ? (this.catalog.arcanas.arcana_vi_sarabande.params.healMultiplier ?? 2.0)
      : 1.0;
    const finalHeal = Math.max(1, Math.round(baseAmount * mult));
    const prevHp = this.hp;
    this.hp = Math.min(this.stats.maxHp, this.hp + finalHeal);
    const actualHealed = this.hp - prevHp;

    if (actualHealed > 0) {
      this.pushFloatingText(this.playerX, this.playerY - 24, `+${actualHealed}`, 'heal');
    }

    // Soul Eater converts healing into Might
    if (
      this.weaponSystem.slots.some((s) => s.weaponId === 'soul_eater') &&
      (actualHealed > 0 || sourceWeapon === 'soul_eater')
    ) {
      this.soulEaterHealAccum += Math.max(1, actualHealed || finalHeal);
      const nextBonus = Math.min(0.8, Math.floor(this.soulEaterHealAccum / 5) * 0.01);
      if (nextBonus > this.progression.soulEaterMightBonus) {
        this.progression.soulEaterMightBonus = nextBonus;
        this.statsDirty = true;
      }
    }

    // Sarabande of Healing emits holy damage pulse
    if (hasSarabande) {
      this.sarabandeBuffer += finalHeal;
      if (this.sarabandeBuffer >= 2) {
        const pulseDmg =
          this.sarabandeBuffer *
          (this.catalog.arcanas.arcana_vi_sarabande.params.healDamageMultiplier ?? 1.0) *
          this.stats.might;
        this.sarabandeBuffer = 0;
        const burstR =
          (this.catalog.arcanas.arcana_vi_sarabande.params.burstRadius ?? 150) *
          this.stats.area;
        const count = this.enemySystem.grid.queryRadius(
          this.playerX,
          this.playerY,
          burstR,
          this.rosaryScratch,
        );
        for (let i = 0; i < count; i++) {
          const idx = this.rosaryScratch[i]!;
          const e = this.enemySystem.enemies[idx];
          if (!e || !e.alive) continue;
          const res = this.enemySystem.damageEnemy(idx, pulseDmg, {
            knockX: e.x - this.playerX,
            knockY: e.y - this.playerY,
            knockForce: 15,
          });
          if (res.killed) {
            this.handleEnemyDeathReward(
              e.enemyId,
              e.x,
              e.y,
              e.xpValue,
              e.xpTier,
              e.isBoss,
              e.isReaper,
              e.chestTier,
              e.canEvolveChest,
              false,
            );
          }
        }
      }
    }
  }

  private handleEnemyDeathReward(
    enemyId: EnemyId,
    x: number,
    y: number,
    xpValue: number,
    xpTier: 'xp_blue' | 'xp_green' | 'xp_red' | 'xp_gold',
    isBoss: boolean,
    isReaper: boolean,
    chestTier?: import('../contracts/ids.ts').ChestTier,
    canEvolveChest?: boolean,
    fromRetaliation = false,
  ): void {
    this.progression.kills += 1;
    this.progression.runBestiaryKills[enemyId] =
      (this.progression.runBestiaryKills[enemyId] ?? 0) + 1;

    if (fromRetaliation && this.progression.arcanas.includes('arcana_ix_divine_bloodline')) {
      this.progression.divineBloodlineBonusMaxHp +=
        this.catalog.arcanas.arcana_ix_divine_bloodline.params.maxHpPerRetaliationKill ?? 0.5;
      this.statsDirty = true;
    }

    // Spawn XP Gem
    this.progression.spawnPickup('pickup', xpTier, x, y, { value: xpValue });

    if (isBoss) {
      this.progression.defeatedBosses.add(enemyId);
      if (chestTier) {
        const chestPickupId: PickupId =
          chestTier === 'gold'
            ? 'chest_gold'
            : chestTier === 'silver'
              ? 'chest_silver'
              : chestTier === 'arcana'
                ? 'chest_arcana'
                : 'chest_bronze';
        this.progression.spawnPickup('pickup', chestPickupId, x + 12, y, {
          chestTier,
          canEvolveChest,
        });
      }
    }

    if (enemyId === 'reaper_red_death') {
      // Defeating Red Death unlocks red_death and crowns a glorious victory!
      this.progression.checkAchievementsLive(
        this.waveDirector.stageClockSeconds,
        this.weaponSystem,
        this.createProgressionHooks(),
        this.playerX,
        this.playerY,
      );
      if (isReaper) {
        this.waveDirector.reachedStageTimeLimit = true;
      }
    }
  }

  private openNextLevelUpDraft(): void {
    this.progression.buildLevelUpDraft(this.stats, this.weaponSystem, this.rng);
    this.phase = 'level_up';
    this.pushAudioCue({ type: 'level_up', level: this.progression.level });
  }

  private enterSettlement(victory: boolean): void {
    this.progression.checkAchievementsLive(
      this.waveDirector.stageClockSeconds,
      this.weaponSystem,
      undefined,
      this.playerX,
      this.playerY,
    );
    this.settlementModal = this.buildSettlementModal(victory);
    this.phase = 'settlement';
    this.pushAudioCue({ type: 'game_over', victory });
  }

  private buildSettlementModal(victory: boolean): SettlementModalState {
    return {
      victory,
      stageId: this.config.stageId,
      heroId: this.config.heroId,
      elapsedSeconds: this.waveDirector.stageClockSeconds,
      level: this.progression.level,
      kills: this.progression.kills,
      goldEarned: this.progression.goldEarned,
      weaponBreakdown: this.weaponSystem.getWeaponBreakdown(),
      unlockedAchievements: [...this.progression.runUnlockedAchievements],
      causeOfDeath: victory ? undefined : this.causeOfDeath,
    };
  }

  private createWeaponHooks(): import('./WeaponSystem.ts').WeaponCombatHooks {
    return {
      onAudioCue: (cue) => this.pushAudioCue(cue),
      onHealPlayer: (amount, sourceWeapon) => {
        this.applyPlayerHealing(amount, sourceWeapon);
      },
      onFloatingText: (x, y, text, kind) => {
        this.pushFloatingText(x, y, text, kind);
      },
      onEnemyKilled: (
        enemyId,
        x,
        y,
        xpValue,
        xpTier,
        isBoss,
        isReaper,
        chestTier,
        canEvolveChest,
        fromRetaliation,
      ) => {
        this.handleEnemyDeathReward(
          enemyId,
          x,
          y,
          xpValue,
          xpTier,
          isBoss,
          isReaper,
          chestTier,
          canEvolveChest,
          fromRetaliation,
        );
      },
      onPropBroken: (x, y) => {
        const oroBonus = this.progression.arcanas.includes('arcana_xii_out_of_bounds')
          ? (this.catalog.arcanas.arcana_xii_out_of_bounds.params.orologionChanceBonus ?? 0.08)
          : 0;
        const loot = this.enemySystem.rollPropLoot(
          this.rng,
          this.stats.luck,
          oroBonus,
        );
        if (loot) {
          this.progression.spawnPickup('pickup', loot, x, y);
        }
      },
      onPentagramTriggered: (eraseChance, vacuumAndRain) => {
        this.progression.applyPentagramPickupEffect(
          eraseChance,
          vacuumAndRain,
          this.playerX,
          this.playerY,
          this.rng,
        );
      },
      onFreezeTriggered: (x, y) => {
        this.weaponSystem.triggerFrostExplosion(
          x,
          y,
          this.stats,
          this.enemySystem,
          this.createWeaponHooks(),
        );
      },
      onScreenEffect: (flash, shake) => {
        if (flash) this.screenFlash = flash;
        if (shake > this.screenShake) this.screenShake = shake;
      },
    };
  }

  private createProgressionHooks(): import('./ProgressionSystem.ts').ProgressionHooks {
    return {
      onAudioCue: (cue) => this.pushAudioCue(cue),
      onHealPlayer: (amount) => this.applyPlayerHealing(amount),
      onFloatingText: (x, y, text, kind) => {
        this.pushFloatingText(x, y, text, kind);
      },
      onRosaryTriggered: () => {
        const count = this.enemySystem.grid.queryRadius(
          this.playerX,
          this.playerY,
          760,
          this.rosaryScratch,
        );
        for (let i = 0; i < count; i++) {
          const idx = this.rosaryScratch[i]!;
          const e = this.enemySystem.enemies[idx];
          if (!e || !e.alive || e.isBoss || e.isReaper) continue;
          const res = this.enemySystem.damageEnemy(idx, e.hp + 100);
          if (res.killed) {
            this.handleEnemyDeathReward(
              e.enemyId,
              e.x,
              e.y,
              e.xpValue,
              e.xpTier,
              false,
              false,
            );
          }
        }
        this.screenFlash = { color: 0xffffff, alpha: 0.7 };
        this.screenShake = 8;
      },
      onOrologionTriggered: (seconds) => {
        const count = this.enemySystem.grid.queryRadius(
          this.playerX,
          this.playerY,
          960,
          this.frostScratch,
        );
        const outOfBounds = this.progression.arcanas.includes('arcana_xii_out_of_bounds');
        for (let i = 0; i < count; i++) {
          const idx = this.frostScratch[i]!;
          const e = this.enemySystem.enemies[idx];
          if (!e || !e.alive || e.isReaper) continue;
          this.enemySystem.freezeEnemy(idx, seconds);
          if (outOfBounds && i < 6) {
            this.weaponSystem.triggerFrostExplosion(
              e.x,
              e.y,
              this.stats,
              this.enemySystem,
              this.createWeaponHooks(),
            );
          }
        }
        this.screenFlash = { color: 0x7bdff2, alpha: 0.45 };
      },
      onStatsDirty: () => {
        this.statsDirty = true;
      },
    };
  }

  private pushAudioCue(cue: AudioCue): void {
    // Prevent flooding audio queue during massive AoEs
    if (this.audioCueQueue.length < 48) {
      this.audioCueQueue.push(cue);
    }
  }

  private pushFloatingText(
    x: number,
    y: number,
    text: string,
    kind: RenderFloatingText['kind'],
  ): void {
    const item: ActiveFloatingText = {
      uid: this.nextTextUid++,
      x,
      y,
      text,
      kind,
      age: 0,
      maxAge: kind === 'status' ? 1.4 : 0.6,
    };
    if (this.floatingTexts.length >= MAX_FLOATING_TEXTS) {
      this.floatingTexts[this.textRingCursor] = item;
      this.textRingCursor = (this.textRingCursor + 1) % MAX_FLOATING_TEXTS;
    } else {
      this.floatingTexts.push(item);
    }
  }

  private updateFloatingTexts(dt: number): void {
    let i = 0;
    while (i < this.floatingTexts.length) {
      const ft = this.floatingTexts[i]!;
      ft.age += dt;
      ft.y -= 28 * dt;
      if (ft.age >= ft.maxAge) {
        const last = this.floatingTexts.pop()!;
        if (i < this.floatingTexts.length) {
          this.floatingTexts[i] = last;
        }
      } else {
        i++;
      }
    }
  }

  private fillMapMarkers(out: PauseMapMarker[], includePickups: boolean): void {
    let cursor = 0;
    const heroName = this.catalog.heroes[this.config.heroId].name;
    let playerSlot = out[cursor];
    if (!playerSlot) {
      playerSlot = {
        label: heroName,
        kind: 'player',
        itemId: undefined,
        x: this.playerX,
        y: this.playerY,
      };
      out.push(playerSlot);
    } else {
      playerSlot.label = heroName;
      playerSlot.kind = 'player';
      playerSlot.itemId = undefined;
      playerSlot.x = this.playerX;
      playerSlot.y = this.playerY;
    }
    cursor++;

    if (includePickups) {
      const pickups = this.progression.pickups;
      for (let i = 0; i < pickups.length; i++) {
        const p = pickups[i]!;
        let kind: PauseMapMarker['kind'] | null = null;
        let label = '';
        if (p.kind === 'passive') {
          kind = 'passive';
          label = this.catalog.passives[p.itemId as import('../contracts/ids.ts').PassiveId].name;
        } else if (p.kind === 'relic') {
          kind = 'relic';
          label = this.catalog.relics[p.itemId as RelicId].name;
        } else if (p.chestTier) {
          kind = 'pickup';
          label = '宝箱';
        }
        if (!kind) continue;
        let slot = out[cursor];
        if (!slot) {
          slot = {
            label,
            kind,
            itemId: p.itemId,
            x: p.x,
            y: p.y,
          };
          out.push(slot);
        } else {
          slot.label = label;
          slot.kind = kind;
          slot.itemId = p.itemId;
          slot.x = p.x;
          slot.y = p.y;
        }
        cursor++;
      }
    }
    out.length = cursor;
  }

  private buildPauseSnapshot(): PauseSnapshot {
    const hasMilkyWayMap = this.progression.collectedRelics.has('relic_map');
    const hasGrimoire = this.progression.collectedRelics.has('relic_grimoire');
    const heldWeapons = new Map(
      this.weaponSystem.slots.map((s) => [s.weaponId, s]),
    );

    const evolutionsPossible: PauseEvolutionHint[] = [];
    for (const recipe of this.catalog.evolutions) {
      const hasBase = heldWeapons.has(recipe.baseWeapon);
      const hasEvolved = heldWeapons.has(recipe.evolvedId);
      if (!hasBase && !hasEvolved && !hasGrimoire) continue;

      const baseReady =
        (heldWeapons.get(recipe.baseWeapon)?.level ?? 0) >=
        this.catalog.weapons[recipe.baseWeapon].maxLevel;
      const partnerReady =
        !recipe.partnerWeapon ||
        (heldWeapons.get(recipe.partnerWeapon)?.level ?? 0) >=
          this.catalog.weapons[recipe.partnerWeapon].maxLevel;
      const passiveLv = recipe.requiredPassive
        ? this.progression.passives.get(recipe.requiredPassive) ?? 0
        : 1;
      const passiveReq = recipe.requiredPassive
        ? recipe.requiresMaxPassive
          ? this.catalog.passives[recipe.requiredPassive].maxLevel
          : 1
        : 1;
      const ready = baseReady && partnerReady && passiveLv >= passiveReq;

      evolutionsPossible.push({
        baseWeapon: recipe.baseWeapon,
        requiredPassive: recipe.requiredPassive,
        partnerWeapon: recipe.partnerWeapon,
        evolvedId: recipe.evolvedId,
        ready,
      });
    }

    const mapMarkers: PauseMapMarker[] = [];
    this.fillMapMarkers(mapMarkers, hasMilkyWayMap);

    return {
      stats: { ...this.stats },
      weapons: this.weaponSystem.getSlotSnapshots(),
      passives: this.progression.getPassiveSnapshots(),
      arcanas: [...this.progression.arcanas],
      evolutionsPossible,
      mapMarkers,
      hasMilkyWayMap,
      hasGrimoire,
    };
  }

  private findActiveBossBar(): BossBarState | null {
    let best: import('./EnemySystem.ts').EnemyInstance | null = null;
    const list = this.enemySystem.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (!e.alive || !e.isBoss) continue;
      if (!best || e.maxHp > best.maxHp) {
        best = e;
      }
    }
    if (!best) return null;
    this.frameBossBar.enemyId = best.enemyId;
    this.frameBossBar.name = this.catalog.enemies[best.enemyId].name;
    this.frameBossBar.hp = best.hp;
    this.frameBossBar.maxHp = best.maxHp;
    return this.frameBossBar;
  }

  private buildRenderFrameState(): RenderFrameState {
    const garlicInfo = this.weaponSystem.getGarlicRenderRadius(this.stats);
    const util = this.progression.getRemainingUtility(this.stats);

    const player = this.framePlayer;
    player.heroId = this.config.heroId;
    player.x = this.playerX;
    player.y = this.playerY;
    player.vx = this.playerVx;
    player.vy = this.playerVy;
    player.facingX = this.facingX;
    player.facingY = this.facingY;
    player.hp = this.hp;
    player.maxHp = this.stats.maxHp;
    player.invulnTimer = this.invulnTimer;
    player.hitFlash = this.hitFlashTimer > 0;
    player.laurelShieldCharges = this.weaponSystem.getLaurelCharges();
    player.animFrame = this.playerAnimFrame;
    player.isMoving = this.isMoving;
    player.garlicRadius = garlicInfo.radius;
    player.soulEaterActive = garlicInfo.soulEaterActive;

    const srcEnemies = this.enemySystem.enemies;
    const dstEnemies = this.frameEnemies;
    let enemyCursor = 0;
    for (let i = 0; i < srcEnemies.length; i++) {
      const e = srcEnemies[i]!;
      if (!e.alive) continue;
      let slot = dstEnemies[enemyCursor];
      if (!slot) {
        slot = {
          uid: e.uid,
          enemyId: e.enemyId,
          x: e.x,
          y: e.y,
          facingX: e.facingX,
          radius: e.radius,
          scale: e.scale,
          hp: e.hp,
          maxHp: e.maxHp,
          hitFlash: e.hitFlashTimer > 0,
          frozen: e.freezeTimer > 0,
          isBoss: e.isBoss,
          isReaper: e.isReaper,
          animFrame: e.animFrame,
          tint: e.tint,
        };
        dstEnemies.push(slot);
      } else {
        slot.uid = e.uid;
        slot.enemyId = e.enemyId;
        slot.x = e.x;
        slot.y = e.y;
        slot.facingX = e.facingX;
        slot.radius = e.radius;
        slot.scale = e.scale;
        slot.hp = e.hp;
        slot.maxHp = e.maxHp;
        slot.hitFlash = e.hitFlashTimer > 0;
        slot.frozen = e.freezeTimer > 0;
        slot.isBoss = e.isBoss;
        slot.isReaper = e.isReaper;
        slot.animFrame = e.animFrame;
        slot.tint = e.tint;
      }
      enemyCursor++;
    }
    dstEnemies.length = enemyCursor;

    const srcProps = this.enemySystem.props;
    const dstProps = this.frameProps;
    const propCount = srcProps.length;
    for (let i = 0; i < propCount; i++) {
      const p = srcProps[i]!;
      let slot = dstProps[i];
      if (!slot) {
        slot = {
          uid: p.uid,
          propId: p.propId,
          x: p.x,
          y: p.y,
          broken: p.broken,
          hitFlash: p.hitFlashTimer > 0,
        };
        dstProps.push(slot);
      } else {
        slot.uid = p.uid;
        slot.propId = p.propId;
        slot.x = p.x;
        slot.y = p.y;
        slot.broken = p.broken;
        slot.hitFlash = p.hitFlashTimer > 0;
      }
    }
    dstProps.length = propCount;

    const srcTexts = this.floatingTexts;
    const dstTexts = this.frameFloatingTexts;
    const textCount = srcTexts.length;
    for (let i = 0; i < textCount; i++) {
      const ft = srcTexts[i]!;
      const progress = Math.min(1, ft.age / ft.maxAge);
      let slot = dstTexts[i];
      if (!slot) {
        slot = {
          uid: ft.uid,
          x: ft.x,
          y: ft.y,
          text: ft.text,
          kind: ft.kind,
          progress,
        };
        dstTexts.push(slot);
      } else {
        slot.uid = ft.uid;
        slot.x = ft.x;
        slot.y = ft.y;
        slot.text = ft.text;
        slot.kind = ft.kind;
        slot.progress = progress;
      }
    }
    dstTexts.length = textCount;

    this.weaponSystem.fillRenderProjectilesAndOrbiters(
      this.playerX,
      this.playerY,
      this.frameProjectiles,
    );
    this.weaponSystem.fillRenderZones(this.frameZones);
    this.weaponSystem.fillRenderBeams(this.playerX, this.playerY, this.frameBeams);
    this.progression.fillRenderPickups(this.framePickups);

    this.frameAudioCues.length = 0;
    for (let i = 0; i < this.audioCueQueue.length; i++) {
      this.frameAudioCues.push(this.audioCueQueue[i]!);
    }

    let screenFlashOut: { color: number; alpha: number } | null = null;
    if (this.screenFlash) {
      this.frameScreenFlash.color = this.screenFlash.color;
      this.frameScreenFlash.alpha = this.screenFlash.alpha;
      screenFlashOut = this.frameScreenFlash;
    }

    const fs = this.frameState;
    fs.phase = this.phase;
    fs.stageId = this.config.stageId;
    fs.corridorBounds = this.waveDirector.stage.corridorBounds;
    fs.tick = this.tick;
    fs.screenFlash = screenFlashOut;
    fs.screenShake = this.screenShake;

    const hud = fs.hud;
    hud.elapsedSeconds = this.waveDirector.stageClockSeconds;
    hud.stageDurationSeconds = this.waveDirector.stage.durationSeconds;
    hud.level = this.progression.level;
    hud.xp = this.progression.xp;
    hud.xpToNextLevel = this.progression.xpToNextLevel;
    hud.hp = this.hp;
    hud.maxHp = this.stats.maxHp;
    hud.kills = this.progression.kills;
    hud.goldEarned = this.progression.goldEarned;
    this.weaponSystem.fillSlotSnapshots(this.frameHudWeapons);
    hud.weapons = this.frameHudWeapons;
    this.progression.fillPassiveSnapshots(this.frameHudPassives);
    hud.passives = this.frameHudPassives;
    const srcArcanas = this.progression.arcanas;
    const dstArcanas = this.frameHudArcanas;
    for (let i = 0; i < srcArcanas.length; i++) {
      dstArcanas[i] = srcArcanas[i]!;
    }
    dstArcanas.length = srcArcanas.length;
    hud.arcanas = dstArcanas;
    hud.rerollsRemaining = util.rerolls;
    hud.skipsRemaining = util.skips;
    hud.banishesRemaining = util.banishes;
    hud.revivalsRemaining = util.revivals;
    hud.activeEnemyCount = enemyCursor;
    hud.stageId = this.config.stageId;
    hud.hyper = this.config.hyper;
    hud.hurry = this.config.hurry;
    hud.endless = this.config.endless;
    hud.endlessCycle = this.waveDirector.endlessCycle;
    const hasMilkyWayMap = this.progression.collectedRelics.has('relic_map');
    hud.hasMilkyWayMap = hasMilkyWayMap;
    if (hasMilkyWayMap) {
      this.fillMapMarkers(this.frameMapMarkers, true);
      hud.mapMarkers = this.frameMapMarkers;
    } else {
      this.frameMapMarkers.length = 0;
      hud.mapMarkers = undefined;
    }

    fs.bossBar = this.findActiveBossBar();
    fs.draftModal =
      this.phase === 'level_up' || this.phase === 'arcana_select'
        ? this.progression.activeDraft
        : null;
    fs.chestModal = this.phase === 'chest' ? this.progression.activeChest : null;
    fs.reviveModal =
      this.phase === 'revive'
        ? {
            revivalsRemaining: util.revivals,
            heroName: this.catalog.heroes[this.config.heroId].name,
            elapsedSeconds: this.waveDirector.stageClockSeconds,
          }
        : null;
    fs.settlementModal =
      this.phase === 'settlement' ? this.settlementModal : null;
    fs.pauseSnapshot = this.phase === 'paused' ? this.buildPauseSnapshot() : null;

    return fs;
  }
}
