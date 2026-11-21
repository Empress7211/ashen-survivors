import type {
  AudioCue,
  Catalog,
  ChestTier,
  EnemyId,
  StageCorridorBounds,
  StageDef,
  StageGroundPickup,
  StatBlock,
  WaveEntry,
} from '../contracts/index.ts';
import type { EnemySystem } from './EnemySystem.ts';
import type { SeededRng } from './Rng.ts';

export interface WaveDirectorCallbacks {
  onAudioCue(cue: AudioCue): void;
  onSpawnPickup(
    kind: 'pickup' | 'passive' | 'relic',
    itemId: string,
    x: number,
    y: number,
    options?: { chestTier?: ChestTier; canEvolveChest?: boolean },
  ): void;
}

export class WaveDirector {
  readonly catalog: Catalog;
  readonly stage: StageDef;
  readonly hyper: boolean;
  readonly hurry: boolean;
  readonly endless: boolean;
  readonly arcanasEnabled: boolean;
  readonly runSeed: number;

  stageClockSeconds = 0;
  realElapsedSeconds = 0;
  endlessCycle = 0;
  reachedStageTimeLimit = false;

  private spawnTimer = 0;
  private reaperSpawnCount = 0;
  private groundPickupsSpawned = false;
  private readonly triggeredBossKeys = new Set<string>();
  private readonly triggeredSwarmKeys = new Set<string>();
  private readonly triggeredArcanaChestKeys = new Set<string>();
  private readonly spawnedPropCells = new Set<string>();

  constructor(
    catalog: Catalog,
    stage: StageDef,
    options: {
      hyper: boolean;
      hurry: boolean;
      endless: boolean;
      arcanasEnabled: boolean;
      seed: number;
    },
  ) {
    this.catalog = catalog;
    this.stage = stage;
    this.hyper = options.hyper;
    this.hurry = options.hurry;
    this.endless = options.endless;
    this.arcanasEnabled = options.arcanasEnabled;
    this.runSeed = options.seed;
  }

  getActiveWave(cycleSeconds: number): WaveEntry {
    const minute = Math.floor(cycleSeconds / 60);
    const waves = this.stage.waves;
    let best = waves[0]!;
    for (let i = 0; i < waves.length; i++) {
      const w = waves[i]!;
      if (w.minute <= minute) {
        best = w;
        if (w.endMinute === undefined || minute < w.endMinute) {
          return w;
        }
      }
    }
    return best;
  }

  ensureInitialWorldSetup(
    playerX: number,
    playerY: number,
    enemySystem: EnemySystem,
    unlockedRelics: readonly string[],
    callbacks: WaveDirectorCallbacks,
  ): void {
    if (!this.groundPickupsSpawned) {
      this.groundPickupsSpawned = true;
      this.spawnStageGroundPickups(unlockedRelics, callbacks);
    }
    this.ensurePropsAroundPlayer(playerX, playerY, enemySystem);
  }

  update(
    dt: number,
    stats: StatBlock,
    playerX: number,
    playerY: number,
    enemySystem: EnemySystem,
    rng: SeededRng,
    unlockedRelics: readonly string[],
    callbacks: WaveDirectorCallbacks,
  ): void {
    const timeScale = this.hurry ? this.stage.hurryTimeScale : 1;
    this.realElapsedSeconds += dt;
    this.stageClockSeconds += dt * timeScale;

    this.ensureInitialWorldSetup(
      playerX,
      playerY,
      enemySystem,
      unlockedRelics,
      callbacks,
    );

    const stageDuration = Math.max(60, this.stage.durationSeconds);
    if (this.endless) {
      this.endlessCycle = Math.floor(this.stageClockSeconds / stageDuration);
      if (this.stageClockSeconds >= stageDuration) {
        this.reachedStageTimeLimit = true;
      }
    } else {
      this.endlessCycle = 0;
    }

    const cycleTime = this.endless
      ? this.stageClockSeconds % stageDuration
      : this.stageClockSeconds;

    // 30:00 Red Death check (non-endless)
    if (!this.endless && this.stageClockSeconds >= this.stage.reaperTimeSeconds) {
      this.reachedStageTimeLimit = true;
      const expectedReapers =
        1 + Math.floor((this.stageClockSeconds - this.stage.reaperTimeSeconds) / 60);
      while (this.reaperSpawnCount < expectedReapers) {
        this.reaperSpawnCount++;
        const pos = this.pickRingPosition(
          playerX,
          playerY,
          560,
          660,
          true,
          28,
          rng,
        );
        const reaper = enemySystem.spawnEnemy(
          this.stage.reaperEnemyId,
          pos.x,
          pos.y,
          { hpScale: 1, speedScale: 1, damageScale: 1 },
        );
        callbacks.onAudioCue({ type: 'boss_spawn', enemyId: reaper.enemyId });
      }
    }

    // 11:00 and 21:00 Arcana Chests when Arcanas are enabled
    if (this.arcanasEnabled) {
      for (const minuteMark of [11, 21]) {
        const markSeconds = minuteMark * 60;
        const key = `${this.endlessCycle}:arcana:${minuteMark}`;
        if (cycleTime >= markSeconds && !this.triggeredArcanaChestKeys.has(key)) {
          this.triggeredArcanaChestKeys.add(key);
          const angle = rng.range(0, Math.PI * 2);
          const dropPos = this.clampToCorridor(
            playerX + Math.cos(angle) * 180,
            playerY + Math.sin(angle) * 180,
            24,
          );
          callbacks.onSpawnPickup('pickup', 'chest_arcana', dropPos.x, dropPos.y, {
            chestTier: 'arcana',
            canEvolveChest: false,
          });
        }
      }
    }

    const wave = this.getActiveWave(cycleTime);
    const cycleMultiplier = 1 + this.endlessCycle; // +100% HP & damage per Endless cycle
    const hpScale =
      this.stage.baseModifiers.enemyHp *
      (wave.hpMultiplier ?? 1) *
      stats.curse *
      cycleMultiplier;
    const damageScale = (wave.damageMultiplier ?? 1) * cycleMultiplier;
    const speedScale =
      this.stage.baseModifiers.enemySpeed *
      (this.hyper ? 1 + this.stage.hyperModifiers.enemySpeedBonus : 1) *
      (wave.speedMultiplier ?? 1) *
      (1 + (stats.curse - 1) * 0.5);

    // Boss events
    for (let i = 0; i < this.stage.bossEvents.length; i++) {
      const ev = this.stage.bossEvents[i]!;
      const key = `${this.endlessCycle}:${i}`;
      if (cycleTime >= ev.timeSeconds && !this.triggeredBossKeys.has(key)) {
        this.triggeredBossKeys.add(key);
        const count = ev.count ?? 1;
        const tier = ev.chestTier;
        const def = this.catalog.enemies[ev.enemyId];
        for (let c = 0; c < count; c++) {
          const pos = this.pickSpawnPosition(
            playerX,
            playerY,
            Boolean(def.ignoresWalls),
            def.radius,
            rng,
          );
          enemySystem.spawnEnemy(ev.enemyId, pos.x, pos.y, {
            hpScale: Math.max(1, cycleMultiplier * this.stage.baseModifiers.enemyHp),
            speedScale,
            damageScale,
            chestTier: tier,
            canEvolveChest: ev.canEvolveChest,
          });
        }
        callbacks.onAudioCue({ type: 'boss_spawn', enemyId: ev.enemyId });
      }
    }

    // Swarm burst events
    for (let i = 0; i < this.stage.swarmEvents.length; i++) {
      const ev = this.stage.swarmEvents[i]!;
      const key = `${this.endlessCycle}:${i}`;
      if (cycleTime >= ev.timeSeconds && !this.triggeredSwarmKeys.has(key)) {
        this.triggeredSwarmKeys.add(key);
        this.spawnSwarmEvent(
          ev.enemyId,
          ev.count,
          ev.formation,
          hpScale,
          speedScale * (ev.speedMultiplier ?? 1.15),
          damageScale,
          playerX,
          playerY,
          enemySystem,
          rng,
        );
      }
    }

    // Do not spam extra wave enemies after 30:00 Red Death arrival in standard mode
    if (!this.endless && this.stageClockSeconds >= this.stage.reaperTimeSeconds) {
      return;
    }

    // Continuous wave spawning & minimum quota enforcement
    const effectiveMin = Math.round(wave.minimumCount * stats.curse);
    const effectiveMax = Math.min(
      1600,
      Math.round(
        (wave.maxCount ?? Math.max(effectiveMin * 2, 120)) * Math.max(1, stats.curse),
      ),
    );
    const effectiveInterval = Math.max(
      0.08,
      wave.spawnInterval / Math.max(0.5, stats.curse),
    );

    if (enemySystem.activeCount < effectiveMin && enemySystem.activeCount < 1600) {
      const deficit = Math.min(6, effectiveMin - enemySystem.activeCount);
      for (let s = 0; s < deficit; s++) {
        this.spawnWaveEnemy(
          wave,
          hpScale,
          speedScale,
          damageScale,
          playerX,
          playerY,
          enemySystem,
          rng,
        );
      }
    }

    this.spawnTimer += dt * timeScale;
    let burstGuard = 0;
    while (
      this.spawnTimer >= effectiveInterval &&
      enemySystem.activeCount < effectiveMax &&
      enemySystem.activeCount < 1600 &&
      burstGuard < 4
    ) {
      this.spawnTimer -= effectiveInterval;
      this.spawnWaveEnemy(
        wave,
        hpScale,
        speedScale,
        damageScale,
        playerX,
        playerY,
        enemySystem,
        rng,
      );
      burstGuard++;
    }
    if (this.spawnTimer > effectiveInterval * 2) {
      this.spawnTimer = effectiveInterval;
    }
  }

  private spawnWaveEnemy(
    wave: WaveEntry,
    hpScale: number,
    speedScale: number,
    damageScale: number,
    playerX: number,
    playerY: number,
    enemySystem: EnemySystem,
    rng: SeededRng,
  ): void {
    const enemyId = rng.pick(wave.enemies);
    const def = this.catalog.enemies[enemyId];
    const pos = this.pickSpawnPosition(
      playerX,
      playerY,
      Boolean(def.ignoresWalls),
      def.radius,
      rng,
    );
    enemySystem.spawnEnemy(enemyId, pos.x, pos.y, {
      hpScale,
      speedScale,
      damageScale,
    });
  }

  private spawnSwarmEvent(
    enemyId: EnemyId,
    count: number,
    formation: 'ring' | 'line' | 'cluster',
    hpScale: number,
    speedScale: number,
    damageScale: number,
    playerX: number,
    playerY: number,
    enemySystem: EnemySystem,
    rng: SeededRng,
  ): void {
    const def = this.catalog.enemies[enemyId];
    const cappedCount = Math.min(count, Math.max(0, 1650 - enemySystem.activeCount));
    if (cappedCount <= 0) return;

    if (formation === 'ring') {
      const baseAngle = rng.range(0, Math.PI * 2);
      for (let i = 0; i < cappedCount; i++) {
        const theta = baseAngle + (i / cappedCount) * Math.PI * 2;
        const rawX = playerX + Math.cos(theta) * 660;
        const rawY = playerY + Math.sin(theta) * 660;
        const pos = def.ignoresWalls
          ? { x: rawX, y: rawY }
          : this.clampToCorridor(rawX, rawY, def.radius);
        enemySystem.spawnEnemy(enemyId, pos.x, pos.y, {
          hpScale,
          speedScale,
          damageScale,
        });
      }
      return;
    }

    if (formation === 'line') {
      const fromRight = rng.chance(0.5);
      const dirX = fromRight ? -1 : 1;
      const startX = playerX + (fromRight ? 760 : -760);
      const baseY = playerY + rng.range(-180, 180);
      for (let i = 0; i < cappedCount; i++) {
        const rowOffset = ((i % 7) - 3) * 38;
        const colOffset = Math.floor(i / 7) * 44 * (fromRight ? 1 : -1);
        const rawY = baseY + rowOffset;
        const pos = def.ignoresWalls
          ? { x: startX + colOffset, y: rawY }
          : this.clampToCorridor(startX + colOffset, rawY, def.radius);
        enemySystem.spawnEnemy(enemyId, pos.x, pos.y, {
          hpScale,
          speedScale,
          damageScale,
          swarmDirX: dirX,
          swarmDirY: 0,
          swarmTimer: 7.5,
        });
      }
      return;
    }

    // cluster
    const angle = rng.range(0, Math.PI * 2);
    const cx = playerX + Math.cos(angle) * 720;
    const cy = playerY + Math.sin(angle) * 520;
    for (let i = 0; i < cappedCount; i++) {
      const jAngle = rng.range(0, Math.PI * 2);
      const jRad = rng.range(0, 110);
      const rawX = cx + Math.cos(jAngle) * jRad;
      const rawY = cy + Math.sin(jAngle) * jRad;
      const pos = def.ignoresWalls
        ? { x: rawX, y: rawY }
        : this.clampToCorridor(rawX, rawY, def.radius);
      enemySystem.spawnEnemy(enemyId, pos.x, pos.y, {
        hpScale,
        speedScale,
        damageScale,
      });
    }
  }

  private pickSpawnPosition(
    playerX: number,
    playerY: number,
    ignoresWalls: boolean,
    radius: number,
    rng: SeededRng,
  ): { x: number; y: number } {
    const bounds = this.stage.corridorBounds;
    if (!ignoresWalls && bounds) {
      // Horizontal corridor (e.g. Inlaid Library y in [-360, 360]): spawn offscreen left/right
      if (bounds.minY !== undefined && bounds.maxY !== undefined && bounds.minX === undefined) {
        const side = rng.chance(0.5) ? 1 : -1;
        const x = playerX + side * rng.range(700, 860);
        const y = rng.range(bounds.minY + radius + 8, bounds.maxY - radius - 8);
        return { x, y };
      }
      // Vertical corridor (e.g. Gallo Tower x in [-380, 380]): spawn offscreen top/bottom
      if (bounds.minX !== undefined && bounds.maxX !== undefined && bounds.minY === undefined) {
        const side = rng.chance(0.5) ? 1 : -1;
        const x = rng.range(bounds.minX + radius + 8, bounds.maxX - radius - 8);
        const y = playerY + side * rng.range(450, 580);
        return { x, y };
      }
    }
    return this.pickRingPosition(playerX, playerY, 690, 840, ignoresWalls, radius, rng);
  }

  private pickRingPosition(
    playerX: number,
    playerY: number,
    minR: number,
    maxR: number,
    ignoresWalls: boolean,
    radius: number,
    rng: SeededRng,
  ): { x: number; y: number } {
    const theta = rng.range(0, Math.PI * 2);
    const r = rng.range(minR, maxR);
    const x = playerX + Math.cos(theta) * r;
    const y = playerY + Math.sin(theta) * r;
    if (ignoresWalls) return { x, y };
    return this.clampToCorridor(x, y, radius);
  }

  private clampToCorridor(x: number, y: number, radius: number): { x: number; y: number } {
    const b: StageCorridorBounds | undefined = this.stage.corridorBounds;
    if (!b) return { x, y };
    let cx = x;
    let cy = y;
    if (b.minX !== undefined) cx = Math.max(b.minX + radius, cx);
    if (b.maxX !== undefined) cx = Math.min(b.maxX - radius, cx);
    if (b.minY !== undefined) cy = Math.max(b.minY + radius, cy);
    if (b.maxY !== undefined) cy = Math.min(b.maxY - radius, cy);
    return { x: cx, y: cy };
  }

  private spawnStageGroundPickups(
    unlockedRelics: readonly string[],
    callbacks: WaveDirectorCallbacks,
  ): void {
    const list: readonly StageGroundPickup[] = this.stage.groundPickups;
    for (let i = 0; i < list.length; i++) {
      const gp = list[i]!;
      if (gp.requiresRelic && !unlockedRelics.includes(gp.requiresRelic)) {
        continue;
      }
      if (gp.kind === 'relic' && unlockedRelics.includes(gp.itemId)) {
        // Already collected relic in meta save: place a Rich Gold Bag instead
        callbacks.onSpawnPickup('pickup', 'rich_gold_bag', gp.x, gp.y);
        continue;
      }
      callbacks.onSpawnPickup(gp.kind, gp.itemId, gp.x, gp.y);
    }
  }

  private ensurePropsAroundPlayer(
    playerX: number,
    playerY: number,
    enemySystem: EnemySystem,
  ): void {
    const allowed = this.stage.allowedProps;
    if (allowed.length === 0) return;
    const spacing = Math.max(220, this.stage.propSpawnSpacing);
    const gx0 = Math.floor(playerX / spacing);
    const gy0 = Math.floor(playerY / spacing);

    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const gx = gx0 + dx;
        const gy = gy0 + dy;
        const key = `${gx}:${gy}`;
        if (this.spawnedPropCells.has(key)) continue;
        this.spawnedPropCells.add(key);

        // Deterministic hash per cell
        let h =
          Math.imul(gx, 374761393) ^
          Math.imul(gy, 668265263) ^
          Math.imul(this.runSeed, 1442695041);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h = (h ^ (h >>> 16)) >>> 0;

        // ~68% of grid cells contain a destructible prop
        if ((h & 1023) >= 700) continue;

        const fracX = ((h >>> 10) & 1023) / 1024;
        const fracY = ((h >>> 20) & 1023) / 1024;
        const rawX = (gx + 0.2 + fracX * 0.6) * spacing;
        const rawY = (gy + 0.2 + fracY * 0.6) * spacing;

        // Do not spawn props directly on player origin (0, 0)
        if (rawX * rawX + rawY * rawY < 140 * 140) continue;

        const propId = allowed[h % allowed.length]!;
        const propDef = this.catalog.props[propId];
        const b = this.stage.corridorBounds;
        if (b) {
          if (b.minX !== undefined && (rawX < b.minX + propDef.radius + 32 || rawX > (b.maxX ?? Infinity) - propDef.radius - 32)) {
            continue;
          }
          if (b.minY !== undefined && (rawY < b.minY + propDef.radius + 32 || rawY > (b.maxY ?? Infinity) - propDef.radius - 32)) {
            continue;
          }
        }
        enemySystem.spawnProp(propId, rawX, rawY);
      }
    }
  }
}
