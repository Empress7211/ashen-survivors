import Phaser from 'phaser';
import type { PassiveId, RenderFrameState } from '../contracts/index';
import {
  ATLAS_ENTITIES,
  ATLAS_VFX,
  ATLAS_WORLD,
  TEX_GLOW_DISC,
  TEX_SHADOW_ELLIPSE,
  clampAlpha,
  hasAtlasPassiveFrame,
  interpolateValue,
  passiveAtlasFrame,
  passiveIconKey,
} from './RenderAssets';
import { ImagePool } from './SpritePool';
import type { EntityRenderInterp } from './types';

const WARM_LIGHT_PROPS = new Set<string>([
  'brazier',
  'candelabra',
  'streetlamp',
  'stained_pedestal',
]);

const FLYING_ENEMY_IDS = new Set<string>([
  'bat_brown',
  'bat_swarm',
  'ghost',
  'dust_elemental',
  'harpy',
  'imp_demon',
  'dragon_shrimp',
  'nesuferit_mage',
  'boss_giant_bat',
  'boss_nesuferit',
  'boss_sword_guardian',
  'boss_trinacria',
  'reaper_stalker',
  'reaper_red_death',
]);

interface DustParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  tint: number;
}

interface AfterimageGhost {
  active: boolean;
  x: number;
  y: number;
  frame: string;
  flipX: boolean;
  rot: number;
  scaleX: number;
  scaleY: number;
  age: number;
  maxAge: number;
}

interface DeathBurstParticle {
  active: boolean;
  x: number;
  y: number;
  age: number;
  maxAge: number;
  baseScale: number;
  isHeavy: boolean;
  tint: number;
  rot: number;
}

interface TrackedVisibleEnemy {
  uid: number;
  x: number;
  y: number;
  radius: number;
  isHeavy: boolean;
  tint: number;
}

const MAX_DUST_PARTICLES = 24;
const MAX_AFTERIMAGES = 6;
const MAX_DEATH_BURSTS = 48;
const MAX_BURSTS_PER_TICK = 14;
const PLAYER_BASE_SCALE = 0.693;

export class EntityRenderer {
  private readonly scene: Phaser.Scene;
  private readonly shadowPool: ImagePool;
  private readonly pickupGlowPool: ImagePool;
  private readonly dustPool: ImagePool;
  private readonly pickupVfxPool: ImagePool;
  private readonly pickupWorldPool: ImagePool;
  private readonly pickupPassivePool: ImagePool;
  private readonly propPool: ImagePool;
  private readonly afterimagePool: ImagePool;
  private readonly enemyPool: ImagePool;
  private readonly bossPool: ImagePool;
  private readonly deathBurstPool: ImagePool;
  private readonly bossAuraGraphics: Phaser.GameObjects.Graphics;
  private readonly bossHpGraphics: Phaser.GameObjects.Graphics;
  private readonly playerSprite: Phaser.GameObjects.Image;
  private readonly playerHpGraphics: Phaser.GameObjects.Graphics;

  private prevEntityTick = -1;
  private lastRenderPerfMs = -1;
  private lastPlayerRenderX = 0;
  private lastPlayerRenderY = 0;
  private playerWalkPhase = 0;
  private playerStrideBlend = 0;
  private prevStepSign = 1;
  private afterimageCooldown = 0;

  private readonly dustParticles: DustParticle[];
  private dustCursor = 0;
  private readonly afterimages: AfterimageGhost[];
  private afterimageCursor = 0;
  private readonly deathBursts: DeathBurstParticle[];
  private deathBurstCursor = 0;
  private readonly aliveUidSet = new Set<number>();
  private prevVisibleEnemies: TrackedVisibleEnemy[] = [];
  private currVisibleEnemies: TrackedVisibleEnemy[] = [];
  private prevVisibleLen = 0;
  private currVisibleLen = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Ground shadows (depth 6) — shared single texture for 1,500+ entities
    this.shadowPool = new ImagePool(scene, TEX_SHADOW_ELLIPSE, 6, 360);

    // Subtle additive ground beacons under relics, passives, chests, light props, bosses
    this.pickupGlowPool = new ImagePool(
      scene,
      TEX_GLOW_DISC,
      7,
      64,
      Phaser.BlendModes.ADD,
    );

    // Grounded footstep dust puffs (depth 8)
    this.dustPool = new ImagePool(
      scene,
      TEX_GLOW_DISC,
      8,
      28,
      Phaser.BlendModes.NORMAL,
    );

    this.bossAuraGraphics = scene.add.graphics();
    this.bossAuraGraphics.setDepth(7);
    this.bossAuraGraphics.setBlendMode(Phaser.BlendModes.ADD);

    // Pickups (depth 10)
    this.pickupVfxPool = new ImagePool(scene, ATLAS_VFX, 10, 260);
    this.pickupWorldPool = new ImagePool(scene, ATLAS_WORLD, 10, 12);
    this.pickupPassivePool = new ImagePool(scene, TEX_GLOW_DISC, 10, 0);

    // Props (depth 11)
    this.propPool = new ImagePool(scene, ATLAS_WORLD, 11, 64);

    // High-speed dash afterimages & Regular Enemies (depth 12 — single WebGL batch!)
    this.afterimagePool = new ImagePool(
      scene,
      ATLAS_ENTITIES,
      12,
      8,
      Phaser.BlendModes.ADD,
    );
    this.enemyPool = new ImagePool(scene, ATLAS_ENTITIES, 12, 320);

    // Player (depth 13) — foot-anchored for grounded stride bobbing & squash-stretch
    this.playerSprite = scene.add.image(0, 0, ATLAS_ENTITIES);
    this.playerSprite.setOrigin(0.5, 0.84);
    this.playerSprite.setScale(PLAYER_BASE_SCALE);
    this.playerSprite.setDepth(13);
    this.playerSprite.setVisible(false);

    this.playerHpGraphics = scene.add.graphics();
    this.playerHpGraphics.setDepth(14);

    // Bosses & Reapers (depth 14)
    this.bossPool = new ImagePool(scene, ATLAS_ENTITIES, 14, 12);
    this.deathBurstPool = new ImagePool(
      scene,
      ATLAS_VFX,
      15,
      64,
      Phaser.BlendModes.ADD,
    );
    this.bossHpGraphics = scene.add.graphics();
    this.bossHpGraphics.setDepth(15);

    this.dustParticles = Array.from({ length: MAX_DUST_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      age: 0,
      maxAge: 0.3,
      startScale: 0.14,
      endScale: 0.28,
      tint: 0xcabaa5,
    }));
    this.afterimages = Array.from({ length: MAX_AFTERIMAGES }, () => ({
      active: false,
      x: 0,
      y: 0,
      frame: 'antonio_0',
      flipX: false,
      rot: 0,
      scaleX: PLAYER_BASE_SCALE,
      scaleY: PLAYER_BASE_SCALE,
      age: 0,
      maxAge: 0.18,
    }));
    this.deathBursts = Array.from({ length: MAX_DEATH_BURSTS }, () => ({
      active: false,
      x: 0,
      y: 0,
      age: 0,
      maxAge: 0.22,
      baseScale: 0.45,
      isHeavy: false,
      tint: 0xff6b57,
      rot: 0,
    }));
  }

  render(
    state: RenderFrameState,
    camCenterX: number,
    camCenterY: number,
    visW: number,
    visH: number,
    highQuality: boolean,
    interp?: EntityRenderInterp,
  ): void {
    this.shadowPool.beginFrame();
    this.pickupGlowPool.beginFrame();
    this.dustPool.beginFrame();
    this.pickupVfxPool.beginFrame();
    this.pickupWorldPool.beginFrame();
    this.pickupPassivePool.beginFrame();
    this.propPool.beginFrame();
    this.afterimagePool.beginFrame();
    this.enemyPool.beginFrame();
    this.bossPool.beginFrame();
    this.deathBurstPool.beginFrame();
    this.bossAuraGraphics.clear();
    this.bossHpGraphics.clear();
    this.playerHpGraphics.clear();

    const cullLeft = camCenterX - visW * 0.5 - 180;
    const cullRight = camCenterX + visW * 0.5 + 180;
    const cullTop = camCenterY - visH * 0.5 - 180;
    const cullBottom = camCenterY + visH * 0.5 + 180;
    const tick = state.tick;
    const alpha = interp?.alpha !== undefined ? clampAlpha(interp.alpha) : 1;
    const enemySnaps = alpha < 1 ? interp?.enemySnaps : undefined;
    const playerX = interp?.playerX ?? state.player.x;
    const playerY = interp?.playerY ?? state.player.y;

    const nowMs =
      typeof performance !== 'undefined' ? performance.now() : tick * (1000 / 60);
    const isFreshRun =
      this.prevEntityTick < 0 ||
      tick < this.prevEntityTick ||
      tick - this.prevEntityTick > 20;

    if (isFreshRun) {
      this.resetTransientVisuals(playerX, playerY, nowMs);
    }

    const rawDt =
      this.lastRenderPerfMs >= 0
        ? Math.min(0.05, Math.max(0, (nowMs - this.lastRenderPerfMs) / 1000))
        : 0;
    this.lastRenderPerfMs = nowMs;
    const tickAdvanced = !isFreshRun && tick > this.prevEntityTick;
    const stepDt = tickAdvanced ? Math.min(0.05, (tick - this.prevEntityTick) / 60) : 0;
    const animDt =
      state.phase === 'playing' ? Math.max(rawDt, stepDt > 0 && rawDt < 0.001 ? stepDt : 0) : 0;

    // Detect recently slain screen-visible enemies for punchy death pops
    if (tickAdvanced && state.phase === 'playing' && this.prevVisibleLen > 0) {
      this.aliveUidSet.clear();
      const enemyList = state.enemies;
      for (let i = 0; i < enemyList.length; i++) {
        this.aliveUidSet.add(enemyList[i]!.uid);
      }
      let emitted = 0;
      for (let i = 0; i < this.prevVisibleLen; i++) {
        const prev = this.prevVisibleEnemies[i]!;
        if (!this.aliveUidSet.has(prev.uid)) {
          this.spawnDeathBurst(prev.x, prev.y, prev.radius, prev.isHeavy, prev.tint);
          emitted++;
          if (emitted >= MAX_BURSTS_PER_TICK) break;
        }
      }
    }

    // 0. Update & render ground dust particles before pickups/characters
    this.updateAndRenderDust(animDt);

    // 1. Pickups
    const pickups = state.pickups;
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i]!;
      if (
        p.x < cullLeft ||
        p.x > cullRight ||
        p.y < cullTop ||
        p.y > cullBottom
      ) {
        continue;
      }

      const bob = Math.sin(p.bobPhase + tick * 0.085) * 2.5;
      const isChest = p.kind === 'pickup' && p.itemId.startsWith('chest_');

      if (p.kind === 'passive') {
        const pid = p.itemId as PassiveId;
        if (hasAtlasPassiveFrame(this.scene.textures, pid)) {
          const sprite = this.pickupWorldPool.acquire();
          sprite.setTexture(ATLAS_WORLD, passiveAtlasFrame(pid));
          sprite.setOrigin(0.5, 0.5);
          sprite.setPosition(p.x, p.y - 4 + bob);
          const maxDim = Math.max(1, sprite.width, sprite.height);
          sprite.setScale(40 / maxDim);
          sprite.setAlpha(1);
          sprite.clearTint();
        } else {
          const key = passiveIconKey(pid);
          if (this.scene.textures.exists(key)) {
            const sprite = this.pickupPassivePool.acquire();
            sprite.setTexture(key);
            sprite.setOrigin(0.5, 0.5);
            sprite.setPosition(p.x, p.y - 4 + bob);
            sprite.setScale(0.42);
            sprite.setAlpha(1);
            sprite.clearTint();
          }
        }
        const shadow = this.shadowPool.acquire();
        shadow.setPosition(p.x, p.y + 13);
        shadow.setScale(0.52, 0.42);
        shadow.setAlpha(0.7);

        const glow = this.pickupGlowPool.acquire();
        glow.setPosition(p.x, p.y - 2);
        glow.setScale(0.56 + Math.sin(tick * 0.1 + p.bobPhase) * 0.06);
        glow.setAlpha(0.36);
        glow.setTint(0xffd447);
      } else if (p.kind === 'relic') {
        const sprite = this.pickupVfxPool.acquire();
        sprite.setTexture(ATLAS_VFX, p.itemId);
        sprite.setOrigin(0.5, 0.5);
        sprite.setPosition(p.x, p.y - 4 + bob);
        sprite.setScale(0.6);
        sprite.setAlpha(1);
        sprite.clearTint();

        const shadow = this.shadowPool.acquire();
        shadow.setPosition(p.x, p.y + 14);
        shadow.setScale(0.58, 0.46);
        shadow.setAlpha(0.75);

        const glow = this.pickupGlowPool.acquire();
        glow.setPosition(p.x, p.y - 2);
        glow.setScale(0.7 + Math.sin(tick * 0.1 + p.bobPhase) * 0.08);
        glow.setAlpha(0.45);
        glow.setTint(0xc77dff);
      } else if (isChest) {
        const frame = p.chestOpen ? `${p.itemId}_open` : p.itemId;
        const sprite = this.pickupWorldPool.acquire();
        sprite.setTexture(ATLAS_WORLD, frame);
        sprite.setOrigin(0.5, 0.68);
        sprite.setPosition(p.x, p.y + 4);
        sprite.setScale(0.56);
        sprite.setAlpha(1);
        sprite.clearTint();

        const shadow = this.shadowPool.acquire();
        shadow.setPosition(p.x, p.y + 14);
        shadow.setScale(0.84, 0.6);
        shadow.setAlpha(0.8);

        const glow = this.pickupGlowPool.acquire();
        glow.setPosition(p.x, p.y - 4);
        glow.setScale(0.72 + Math.sin(tick * 0.1) * 0.08);
        glow.setAlpha(p.itemId === 'chest_arcana' ? 0.44 : 0.38);
        glow.setTint(p.itemId === 'chest_arcana' ? 0xc26eff : 0xffbe3b);
      } else {
        const isXp = p.itemId.startsWith('xp_');
        const sprite = this.pickupVfxPool.acquire();
        sprite.setTexture(ATLAS_VFX, p.itemId);
        sprite.setOrigin(0.5, 0.5);
        sprite.setPosition(p.x, p.y + (p.magnetized ? 0 : bob * 0.65));
        const baseScale = isXp
          ? p.itemId === 'xp_gold'
            ? 0.48
            : p.itemId === 'xp_red'
              ? 0.42
              : 0.37
          : p.itemId === 'coin'
            ? 0.42
            : 0.5;
        sprite.setScale(baseScale);
        sprite.setAlpha(1);
        sprite.clearTint();

        if (!isXp || p.itemId === 'xp_gold') {
          const shadow = this.shadowPool.acquire();
          shadow.setPosition(p.x, p.y + 11);
          shadow.setScale(0.42, 0.34);
          shadow.setAlpha(0.6);
        }
      }
    }

    // 2. Props
    const props = state.props;
    for (let i = 0; i < props.length; i++) {
      const prop = props[i]!;
      if (
        prop.x < cullLeft ||
        prop.x > cullRight ||
        prop.y < cullTop ||
        prop.y > cullBottom
      ) {
        continue;
      }

      const sprite = this.propPool.acquire();
      if (prop.broken) {
        sprite.setTexture(ATLAS_WORLD, 'rubble');
        sprite.setOrigin(0.5, 0.65);
        sprite.setPosition(prop.x, prop.y + 4);
        sprite.setScale(0.54);
        sprite.setAlpha(0.84);
        sprite.clearTint();
      } else {
        sprite.setTexture(ATLAS_WORLD, prop.propId);
        sprite.setOrigin(0.5, 0.78);
        sprite.setPosition(prop.x, prop.y + 12);
        sprite.setScale(0.58);
        sprite.setAlpha(1);
        if (prop.hitFlash) {
          sprite.setTintFill(0xffffff);
        } else {
          sprite.clearTint();
        }

        const shadow = this.shadowPool.acquire();
        shadow.setPosition(prop.x, prop.y + 12);
        shadow.setScale(0.82, 0.56);
        shadow.setAlpha(0.75);

        if (highQuality && WARM_LIGHT_PROPS.has(prop.propId)) {
          const glow = this.pickupGlowPool.acquire();
          glow.setPosition(prop.x, prop.y - 16);
          glow.setScale(0.95 + Math.sin(tick * 0.14 + prop.uid) * 0.08);
          glow.setAlpha(0.2);
          glow.setTint(prop.propId === 'stained_pedestal' ? 0xff4769 : 0xff9a3d);
        }
      }
    }

    // 3. Regular Enemies + Bosses / Reapers (Horde LOD shadows for 1,200+ enemies)
    const enemies = state.enemies;
    const maxEnemyShadows = highQuality
      ? enemies.length > 420
        ? 180
        : 420
      : 120;
    let enemyShadowsDrawn = 0;
    const captureVisible = isFreshRun || tickAdvanced;
    if (captureVisible) {
      this.currVisibleLen = 0;
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      const snap = enemySnaps?.get(e.uid);
      const ex = snap ? interpolateValue(snap.prevX, snap.currX, alpha) : e.x;
      const ey = snap ? interpolateValue(snap.prevY, snap.currY, alpha) : e.y;
      const margin = e.isBoss || e.isReaper ? 140 : 40;
      if (
        ex + margin < cullLeft ||
        ex - margin > cullRight ||
        ey + margin < cullTop ||
        ey - margin > cullBottom
      ) {
        continue;
      }

      const frame = `${e.enemyId}_${e.animFrame}`;
      const isHeavy = e.isBoss || e.isReaper;
      const isFlying = FLYING_ENEMY_IDS.has(e.enemyId);

      // Procedural gait / hover kinematics: grounded enemies waddle & hop, flyers glide smoothly
      let enemyHopY = 0;
      let enemyRot = 0;
      let sqX = 1;
      let sqY = 1;
      let hopNorm = 0;

      if (!e.frozen) {
        if (isFlying) {
          const ph = tick * 0.17 + e.uid * 1.13;
          const hover = Math.sin(ph);
          enemyHopY = -3.5 + hover * (isHeavy ? 5.2 : 3.6);
          hopNorm = 0.5 + hover * 0.5;
          enemyRot = e.facingX * 0.04 + Math.cos(ph) * 0.045;
        } else {
          const ph = tick * 0.27 + e.uid * 1.618;
          const stepSin = Math.sin(ph);
          hopNorm = Math.abs(stepSin);
          enemyHopY = -hopNorm * (isHeavy ? 4.4 : 3.2);
          enemyRot = stepSin * (isHeavy ? 0.048 : 0.072);
          const sq = Math.cos(ph * 2) * 0.032;
          sqX = 1 + sq;
          sqY = 1 - sq;
        }
      }

      if (isHeavy || enemyShadowsDrawn < maxEnemyShadows) {
        enemyShadowsDrawn++;
        const shadow = this.shadowPool.acquire();
        shadow.setPosition(ex, ey + (isHeavy ? 18 : 11));
        const shadowBase = Math.max(0.42, e.radius / 22);
        const hopShrink = isFlying ? 0.9 - hopNorm * 0.12 : 1 - hopNorm * 0.15;
        shadow.setScale(shadowBase * hopShrink, shadowBase * 0.72 * hopShrink);
        shadow.setAlpha((isHeavy ? 0.85 : 0.68) * (isFlying ? 0.85 : 1 - hopNorm * 0.16));
      }

      const sprite = isHeavy ? this.bossPool.acquire() : this.enemyPool.acquire();
      if (sprite.frame.name !== frame) {
        sprite.setFrame(frame);
      }
      const baseScale = (isHeavy ? 0.533 : 0.64) * e.scale;
      sprite.setOrigin(0.5, 0.84);
      sprite.setPosition(ex, ey + (isHeavy ? 22.5 : 15) + enemyHopY);
      sprite.setScale(baseScale * sqX, baseScale * sqY);
      sprite.setRotation(enemyRot);
      sprite.setFlipX(e.facingX < 0);
      if (sprite.alpha !== 1) sprite.setAlpha(1);

      if (e.hitFlash) {
        sprite.setTintFill(0xffffff);
      } else if (e.frozen) {
        sprite.setTint(0x66e8ff);
      } else if (e.tint !== undefined) {
        sprite.setTint(e.tint);
      } else if (sprite.isTinted) {
        sprite.clearTint();
      }

      if (isHeavy) {
        this.renderBossAccent(
          ex,
          ey,
          e.radius,
          e.hp,
          e.maxHp,
          e.isReaper,
          tick,
          highQuality,
        );
      }

      if (captureVisible) {
        this.pushCurrVisibleEnemy(e.uid, ex, ey, e.radius, isHeavy, e.tint ?? 0);
      }
    }

    if (captureVisible) {
      const tmp = this.prevVisibleEnemies;
      this.prevVisibleEnemies = this.currVisibleEnemies;
      this.currVisibleEnemies = tmp;
      this.prevVisibleLen = this.currVisibleLen;
    }

    // 4. Death Pop bursts & Player
    this.updateAndRenderDeathBursts(animDt);
    this.renderPlayer(state, playerX, playerY, animDt, nowMs, highQuality);
    this.prevEntityTick = tick;

    this.shadowPool.endFrame();
    this.pickupGlowPool.endFrame();
    this.dustPool.endFrame();
    this.pickupVfxPool.endFrame();
    this.pickupWorldPool.endFrame();
    this.pickupPassivePool.endFrame();
    this.propPool.endFrame();
    this.afterimagePool.endFrame();
    this.enemyPool.endFrame();
    this.bossPool.endFrame();
    this.deathBurstPool.endFrame();
  }

  private renderBossAccent(
    x: number,
    y: number,
    radius: number,
    hp: number,
    maxHp: number,
    isReaper: boolean,
    tick: number,
    highQuality: boolean,
  ): void {
    const pulse = 0.5 + 0.5 * Math.sin(tick * 0.14);
    const auraR = radius * (1.35 + pulse * 0.25);
    const auraColor = isReaper ? 0xff1e4d : 0xd92638;

    this.bossAuraGraphics.lineStyle(3, auraColor, 0.45 + pulse * 0.35);
    this.bossAuraGraphics.strokeCircle(x, y + 6, auraR);
    this.bossAuraGraphics.fillStyle(auraColor, 0.12 + pulse * 0.1);
    this.bossAuraGraphics.fillCircle(x, y + 6, auraR);

    if (highQuality) {
      const glow = this.pickupGlowPool.acquire();
      glow.setPosition(x, y + 4);
      glow.setScale((auraR * 2.1) / 128);
      glow.setAlpha(0.28 + pulse * 0.18);
      glow.setTint(auraColor);
    }

    // Sleek boss HP bar right below boss feet (useful when multiple bosses spawn)
    if (hp < maxHp) {
      const barW = 54;
      const barH = 5;
      const bx = x - barW * 0.5;
      const by = y + 26;
      const ratio = Math.max(0, Math.min(1, hp / Math.max(1, maxHp)));
      this.bossHpGraphics.fillStyle(0x09070d, 0.9);
      this.bossHpGraphics.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      this.bossHpGraphics.fillStyle(0xc81d38, 1);
      this.bossHpGraphics.fillRect(bx, by, barW * ratio, barH);
    }
  }

  private resetTransientVisuals(playerX: number, playerY: number, nowMs: number): void {
    this.lastRenderPerfMs = nowMs;
    this.lastPlayerRenderX = playerX;
    this.lastPlayerRenderY = playerY;
    this.playerWalkPhase = 0;
    this.playerStrideBlend = 0;
    this.prevStepSign = 1;
    this.afterimageCooldown = 0;
    this.prevVisibleLen = 0;
    this.currVisibleLen = 0;
    for (let i = 0; i < this.dustParticles.length; i++) {
      this.dustParticles[i]!.active = false;
    }
    for (let i = 0; i < this.afterimages.length; i++) {
      this.afterimages[i]!.active = false;
    }
    for (let i = 0; i < this.deathBursts.length; i++) {
      this.deathBursts[i]!.active = false;
    }
  }

  private pushCurrVisibleEnemy(
    uid: number,
    x: number,
    y: number,
    radius: number,
    isHeavy: boolean,
    tint: number,
  ): void {
    const idx = this.currVisibleLen++;
    let slot = this.currVisibleEnemies[idx];
    if (!slot) {
      slot = { uid, x, y, radius, isHeavy, tint };
      this.currVisibleEnemies.push(slot);
    } else {
      slot.uid = uid;
      slot.x = x;
      slot.y = y;
      slot.radius = radius;
      slot.isHeavy = isHeavy;
      slot.tint = tint;
    }
  }

  private spawnDust(x: number, y: number, facingX: number): void {
    const slot = this.dustParticles[this.dustCursor]!;
    this.dustCursor = (this.dustCursor + 1) % MAX_DUST_PARTICLES;
    const jitter = ((this.dustCursor * 7) % 5) - 2;
    slot.active = true;
    slot.x = x - facingX * 5 + jitter;
    slot.y = y + 13;
    slot.vx = -facingX * (22 + (this.dustCursor % 3) * 8);
    slot.vy = -12 - (this.dustCursor % 3) * 5;
    slot.age = 0;
    slot.maxAge = 0.28 + (this.dustCursor % 3) * 0.03;
    slot.startScale = 0.12;
    slot.endScale = 0.25;
    slot.tint = 0xc9bba8;
  }

  private updateAndRenderDust(dt: number): void {
    for (let i = 0; i < this.dustParticles.length; i++) {
      const p = this.dustParticles[i]!;
      if (!p.active) continue;
      if (dt > 0) {
        p.age += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        if (p.age >= p.maxAge) {
          p.active = false;
          continue;
        }
      }
      const prog = p.age / p.maxAge;
      const img = this.dustPool.acquire();
      img.setPosition(p.x, p.y);
      img.setScale(interpolateValue(p.startScale, p.endScale, prog));
      img.setAlpha(0.46 * (1 - prog) * (1 - prog));
      img.setTint(p.tint);
    }
  }

  private spawnAfterimage(
    x: number,
    y: number,
    frame: string,
    flipX: boolean,
    rot: number,
    scaleX: number,
    scaleY: number,
  ): void {
    const slot = this.afterimages[this.afterimageCursor]!;
    this.afterimageCursor = (this.afterimageCursor + 1) % MAX_AFTERIMAGES;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.frame = frame;
    slot.flipX = flipX;
    slot.rot = rot;
    slot.scaleX = scaleX;
    slot.scaleY = scaleY;
    slot.age = 0;
    slot.maxAge = 0.18;
  }

  private updateAndRenderAfterimages(dt: number): void {
    for (let i = 0; i < this.afterimages.length; i++) {
      const g = this.afterimages[i]!;
      if (!g.active) continue;
      if (dt > 0) {
        g.age += dt;
        if (g.age >= g.maxAge) {
          g.active = false;
          continue;
        }
      }
      const prog = g.age / g.maxAge;
      const img = this.afterimagePool.acquire();
      if (img.frame.name !== g.frame) {
        img.setFrame(g.frame);
      }
      img.setOrigin(0.5, 0.84);
      img.setPosition(g.x, g.y);
      img.setFlipX(g.flipX);
      img.setRotation(g.rot);
      img.setScale(g.scaleX * (1 + prog * 0.08), g.scaleY * (1 + prog * 0.08));
      img.setTint(0xff9e5e);
      img.setAlpha(0.28 * (1 - prog));
    }
  }

  private spawnDeathBurst(
    x: number,
    y: number,
    radius: number,
    isHeavy: boolean,
    tint: number,
  ): void {
    const slot = this.deathBursts[this.deathBurstCursor]!;
    this.deathBurstCursor = (this.deathBurstCursor + 1) % MAX_DEATH_BURSTS;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.maxAge = isHeavy ? 0.34 : 0.21;
    slot.baseScale = Math.max(0.32, (radius / 26) * (isHeavy ? 0.72 : 0.44));
    slot.isHeavy = isHeavy;
    slot.tint = tint > 0 ? tint : isHeavy ? 0xffd166 : 0xff6e5a;
    slot.rot = ((x * 0.13 + y * 0.27) % (Math.PI * 2));
  }

  private updateAndRenderDeathBursts(dt: number): void {
    for (let i = 0; i < this.deathBursts.length; i++) {
      const b = this.deathBursts[i]!;
      if (!b.active) continue;
      if (dt > 0) {
        b.age += dt;
        if (b.age >= b.maxAge) {
          b.active = false;
          continue;
        }
      }
      const prog = b.age / b.maxAge;
      const fade = (1 - prog) * (1 - prog);
      const ring = this.deathBurstPool.acquire();
      ring.setTexture(ATLAS_VFX, b.isHeavy ? 'explosion_ring' : 'hit_spark');
      ring.setOrigin(0.5, 0.5);
      ring.setPosition(b.x, b.y);
      ring.setScale(b.baseScale * (0.55 + prog * 0.95));
      ring.setRotation(b.rot + prog * 0.8);
      ring.setTint(b.tint);
      ring.setAlpha((b.isHeavy ? 0.82 : 0.65) * fade);
    }
  }

  private renderPlayer(
    state: RenderFrameState,
    playerX: number,
    playerY: number,
    animDt: number,
    nowMs: number,
    highQuality: boolean,
  ): void {
    const p = state.player;
    const dist = Math.hypot(
      playerX - this.lastPlayerRenderX,
      playerY - this.lastPlayerRenderY,
    );
    this.lastPlayerRenderX = playerX;
    this.lastPlayerRenderY = playerY;

    if (p.isMoving && state.phase === 'playing') {
      const stepDelta = Math.max(animDt * 9.5, dist / 14.2);
      this.playerWalkPhase = (this.playerWalkPhase + stepDelta) % (Math.PI * 128);
      if (animDt > 0) {
        this.playerStrideBlend +=
          (1 - this.playerStrideBlend) * (1 - Math.exp(-animDt * 18));
      } else {
        this.playerStrideBlend = 1;
      }
    } else if (state.phase === 'playing' && animDt > 0) {
      this.playerStrideBlend *= Math.exp(-animDt * 16);
      if (this.playerStrideBlend < 0.01) {
        this.playerStrideBlend = 0;
      }
    } else if (!p.isMoving) {
      this.playerStrideBlend = 0;
    }

    const stepSin = Math.sin(this.playerWalkPhase);
    const stepSign = stepSin >= 0 ? 1 : -1;
    if (
      state.phase === 'playing' &&
      p.isMoving &&
      animDt > 0 &&
      stepSign !== this.prevStepSign &&
      this.playerStrideBlend > 0.35
    ) {
      this.spawnDust(playerX, playerY, p.facingX || 1);
    }
    this.prevStepSign = stepSign;

    const hop = Math.abs(stepSin) * this.playerStrideBlend;
    const hopY = -hop * 5.8;
    const velDirX = Math.abs(p.vx) > 6 ? Math.sign(p.vx) : (p.facingX || 1) * 0.5;
    const tilt = (stepSin * 0.095 + velDirX * 0.05) * this.playerStrideBlend;
    const squash = Math.cos(this.playerWalkPhase * 2) * 0.046 * this.playerStrideBlend;
    const idleW = 1 - this.playerStrideBlend;
    const breath = state.phase === 'playing' ? Math.sin(nowMs * 0.0032) : 0;
    const scaleX = PLAYER_BASE_SCALE * (1 - breath * 0.015 * idleW + squash);
    const scaleY = PLAYER_BASE_SCALE * (1 + breath * 0.022 * idleW - squash);

    const frame = `${p.heroId}_${p.animFrame}`;
    const flipX = p.facingX < 0;
    const spriteX = playerX;
    const spriteY = playerY + 18.5 + hopY;

    if (highQuality && state.phase === 'playing' && p.isMoving) {
      const speedMag = Math.hypot(p.vx, p.vy);
      if (speedMag >= 205) {
        this.afterimageCooldown -= animDt;
        if (this.afterimageCooldown <= 0) {
          this.afterimageCooldown = 0.065;
          this.spawnAfterimage(spriteX, spriteY, frame, flipX, tilt, scaleX, scaleY);
        }
      }
    }
    this.updateAndRenderAfterimages(animDt);

    const shadow = this.shadowPool.acquire();
    shadow.setPosition(playerX, playerY + 14);
    shadow.setScale(0.68 * (1 - hop * 0.16), 0.52 * (1 - hop * 0.16));
    shadow.setAlpha(0.78 * (1 - hop * 0.2));

    if (this.playerSprite.frame.name !== frame) {
      this.playerSprite.setFrame(frame);
    }
    this.playerSprite.setOrigin(0.5, 0.84);
    this.playerSprite.setPosition(spriteX, spriteY);
    this.playerSprite.setScale(scaleX, scaleY);
    this.playerSprite.setRotation(tilt);
    this.playerSprite.setFlipX(flipX);
    if (!this.playerSprite.visible) {
      this.playerSprite.setVisible(true);
    }

    if (p.hitFlash) {
      this.playerSprite.setTintFill(0xffffff);
      this.playerSprite.setAlpha(1);
    } else {
      this.playerSprite.clearTint();
      const flicker = p.invulnTimer > 0 && (state.tick & 2) !== 0;
      this.playerSprite.setAlpha(flicker ? 0.58 : 1);
    }

    // Subtle player HP bar anchored strictly on the ground beneath hero feet
    const barW = 40;
    const barH = 5;
    const bx = playerX - barW * 0.5;
    const by = playerY + 22;
    const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));

    this.playerHpGraphics.fillStyle(0x09070d, 0.88);
    this.playerHpGraphics.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    this.playerHpGraphics.fillStyle(0x281118, 0.9);
    this.playerHpGraphics.fillRect(bx, by, barW, barH);

    const lowHp = ratio <= 0.25;
    const fillColor = lowHp && (state.tick & 8) !== 0 ? 0xff4d6d : 0xd92638;
    this.playerHpGraphics.fillStyle(fillColor, 1);
    if (ratio > 0) {
      this.playerHpGraphics.fillRect(bx, by, Math.max(2, barW * ratio), barH);
    }
  }

  hideAll(): void {
    this.shadowPool.hideAll();
    this.pickupGlowPool.hideAll();
    this.dustPool.hideAll();
    this.pickupVfxPool.hideAll();
    this.pickupWorldPool.hideAll();
    this.pickupPassivePool.hideAll();
    this.propPool.hideAll();
    this.afterimagePool.hideAll();
    this.enemyPool.hideAll();
    this.bossPool.hideAll();
    this.deathBurstPool.hideAll();
    this.bossAuraGraphics.clear();
    this.bossHpGraphics.clear();
    this.playerHpGraphics.clear();
    this.playerSprite.setVisible(false);
  }

  destroy(): void {
    this.shadowPool.destroy();
    this.pickupGlowPool.destroy();
    this.dustPool.destroy();
    this.pickupVfxPool.destroy();
    this.pickupWorldPool.destroy();
    this.pickupPassivePool.destroy();
    this.propPool.destroy();
    this.afterimagePool.destroy();
    this.enemyPool.destroy();
    this.bossPool.destroy();
    this.deathBurstPool.destroy();
    this.bossAuraGraphics.destroy();
    this.bossHpGraphics.destroy();
    this.playerSprite.destroy();
    this.playerHpGraphics.destroy();
  }
}
