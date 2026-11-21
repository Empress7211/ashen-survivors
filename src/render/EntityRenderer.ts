import Phaser from 'phaser';
import type { PassiveId, RenderFrameState } from '../contracts/index';
import {
  ATLAS_ENTITIES,
  ATLAS_VFX,
  ATLAS_WORLD,
  TEX_GLOW_DISC,
  TEX_SHADOW_ELLIPSE,
  passiveIconKey,
} from './RenderAssets';
import { ImagePool } from './SpritePool';

const WARM_LIGHT_PROPS = new Set<string>([
  'brazier',
  'candelabra',
  'streetlamp',
  'stained_pedestal',
]);

export class EntityRenderer {
  private readonly scene: Phaser.Scene;
  private readonly shadowPool: ImagePool;
  private readonly pickupGlowPool: ImagePool;
  private readonly pickupVfxPool: ImagePool;
  private readonly pickupWorldPool: ImagePool;
  private readonly pickupPassivePool: ImagePool;
  private readonly propPool: ImagePool;
  private readonly enemyPool: ImagePool;
  private readonly bossPool: ImagePool;
  private readonly bossAuraGraphics: Phaser.GameObjects.Graphics;
  private readonly bossHpGraphics: Phaser.GameObjects.Graphics;
  private readonly playerSprite: Phaser.GameObjects.Image;
  private readonly playerHpGraphics: Phaser.GameObjects.Graphics;

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

    this.bossAuraGraphics = scene.add.graphics();
    this.bossAuraGraphics.setDepth(7);
    this.bossAuraGraphics.setBlendMode(Phaser.BlendModes.ADD);

    // Pickups (depth 10)
    this.pickupVfxPool = new ImagePool(scene, ATLAS_VFX, 10, 260);
    this.pickupWorldPool = new ImagePool(scene, ATLAS_WORLD, 10, 12);
    this.pickupPassivePool = new ImagePool(scene, TEX_GLOW_DISC, 10, 8);

    // Props (depth 11)
    this.propPool = new ImagePool(scene, ATLAS_WORLD, 11, 64);

    // Regular Enemies (depth 12 — single WebGL batch!)
    this.enemyPool = new ImagePool(scene, ATLAS_ENTITIES, 12, 320);

    // Player (depth 13)
    this.playerSprite = scene.add.image(0, 0, ATLAS_ENTITIES);
    this.playerSprite.setOrigin(0.5, 0.76);
    this.playerSprite.setScale(0.52);
    this.playerSprite.setDepth(13);
    this.playerSprite.setVisible(false);

    this.playerHpGraphics = scene.add.graphics();
    this.playerHpGraphics.setDepth(14);

    // Bosses & Reapers (depth 14)
    this.bossPool = new ImagePool(scene, ATLAS_ENTITIES, 14, 12);
    this.bossHpGraphics = scene.add.graphics();
    this.bossHpGraphics.setDepth(15);
  }

  render(
    state: RenderFrameState,
    camCenterX: number,
    camCenterY: number,
    visW: number,
    visH: number,
    highQuality: boolean,
  ): void {
    this.shadowPool.beginFrame();
    this.pickupGlowPool.beginFrame();
    this.pickupVfxPool.beginFrame();
    this.pickupWorldPool.beginFrame();
    this.pickupPassivePool.beginFrame();
    this.propPool.beginFrame();
    this.enemyPool.beginFrame();
    this.bossPool.beginFrame();
    this.bossAuraGraphics.clear();
    this.bossHpGraphics.clear();
    this.playerHpGraphics.clear();

    const cullLeft = camCenterX - visW * 0.5 - 180;
    const cullRight = camCenterX + visW * 0.5 + 180;
    const cullTop = camCenterY - visH * 0.5 - 180;
    const cullBottom = camCenterY + visH * 0.5 + 180;
    const tick = state.tick;

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
        const key = passiveIconKey(p.itemId as PassiveId);
        if (this.scene.textures.exists(key)) {
          const sprite = this.pickupPassivePool.acquire();
          sprite.setTexture(key);
          sprite.setOrigin(0.5, 0.5);
          sprite.setPosition(p.x, p.y - 4 + bob);
          sprite.setScale(0.42);
          sprite.setAlpha(1);
          sprite.clearTint();
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

    // 3. Regular Enemies + Bosses / Reapers
    const enemies = state.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      const margin = e.isBoss || e.isReaper ? 140 : 40;
      if (
        e.x + margin < cullLeft ||
        e.x - margin > cullRight ||
        e.y + margin < cullTop ||
        e.y - margin > cullBottom
      ) {
        continue;
      }

      const frame = `${e.enemyId}_${e.animFrame}`;
      const isHeavy = e.isBoss || e.isReaper;

      const shadow = this.shadowPool.acquire();
      shadow.setPosition(e.x, e.y + (isHeavy ? 18 : 11));
      const shadowScale = Math.max(0.42, e.radius / 22);
      shadow.setScale(shadowScale, shadowScale * 0.72);
      shadow.setAlpha(isHeavy ? 0.85 : 0.68);

      const sprite = isHeavy ? this.bossPool.acquire() : this.enemyPool.acquire();
      sprite.setTexture(ATLAS_ENTITIES, frame);
      sprite.setOrigin(0.5, 0.78);
      sprite.setPosition(e.x, e.y + (isHeavy ? 18 : 11));
      sprite.setScale((isHeavy ? 0.4 : 0.48) * e.scale);
      sprite.setFlipX(e.facingX < 0);
      sprite.setAlpha(1);

      if (e.hitFlash) {
        sprite.setTintFill(0xffffff);
      } else if (e.frozen) {
        sprite.setTint(0x66e8ff);
      } else if (e.tint !== undefined) {
        sprite.setTint(e.tint);
      } else {
        sprite.clearTint();
      }

      if (isHeavy) {
        this.renderBossAccent(
          e.x,
          e.y,
          e.radius,
          e.hp,
          e.maxHp,
          e.isReaper,
          tick,
          highQuality,
        );
      }
    }

    // 4. Player
    this.renderPlayer(state);

    this.shadowPool.endFrame();
    this.pickupGlowPool.endFrame();
    this.pickupVfxPool.endFrame();
    this.pickupWorldPool.endFrame();
    this.pickupPassivePool.endFrame();
    this.propPool.endFrame();
    this.enemyPool.endFrame();
    this.bossPool.endFrame();
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

  private renderPlayer(state: RenderFrameState): void {
    const p = state.player;
    const shadow = this.shadowPool.acquire();
    shadow.setPosition(p.x, p.y + 13);
    shadow.setScale(0.68, 0.52);
    shadow.setAlpha(0.78);

    const frame = `${p.heroId}_${p.animFrame}`;
    this.playerSprite.setTexture(ATLAS_ENTITIES, frame);
    this.playerSprite.setPosition(p.x, p.y + 13);
    this.playerSprite.setFlipX(p.facingX < 0);
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

    // Subtle player HP bar right beneath hero feet
    const barW = 40;
    const barH = 5;
    const bx = p.x - barW * 0.5;
    const by = p.y + 22;
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
    this.pickupVfxPool.hideAll();
    this.pickupWorldPool.hideAll();
    this.pickupPassivePool.hideAll();
    this.propPool.hideAll();
    this.enemyPool.hideAll();
    this.bossPool.hideAll();
    this.bossAuraGraphics.clear();
    this.bossHpGraphics.clear();
    this.playerHpGraphics.clear();
    this.playerSprite.setVisible(false);
  }

  destroy(): void {
    this.shadowPool.destroy();
    this.pickupGlowPool.destroy();
    this.pickupVfxPool.destroy();
    this.pickupWorldPool.destroy();
    this.pickupPassivePool.destroy();
    this.propPool.destroy();
    this.enemyPool.destroy();
    this.bossPool.destroy();
    this.bossAuraGraphics.destroy();
    this.bossHpGraphics.destroy();
    this.playerSprite.destroy();
    this.playerHpGraphics.destroy();
  }
}
