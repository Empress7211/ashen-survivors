import Phaser from 'phaser';
import type { StageCorridorBounds, StageId } from '../contracts/index';
import {
  ATLAS_WORLD,
  TEX_GLOW_DISC,
  stageTextureKey,
  stageTexturePath,
} from './RenderAssets';
import { ImagePool } from './SpritePool';

export class WorldRenderer {
  private readonly scene: Phaser.Scene;
  private readonly floorTile: Phaser.GameObjects.TileSprite;
  private readonly corridorGraphics: Phaser.GameObjects.Graphics;
  private readonly wallPool: ImagePool;
  private readonly wallGlowPool: ImagePool;

  private activeStageId: StageId;
  private loadingStageIds = new Set<StageId>();

  constructor(scene: Phaser.Scene, initialStageId: StageId) {
    this.scene = scene;
    this.activeStageId = initialStageId;

    const texKey = scene.textures.exists(stageTextureKey(initialStageId))
      ? stageTextureKey(initialStageId)
      : stageTextureKey('mad_forest');

    this.floorTile = scene.add.tileSprite(0, 0, 1440, 960, texKey);
    this.floorTile.setOrigin(0.5, 0.5);
    this.floorTile.setDepth(0);

    this.corridorGraphics = scene.add.graphics();
    this.corridorGraphics.setDepth(2);

    this.wallPool = new ImagePool(scene, ATLAS_WORLD, 9, 48);
    this.wallGlowPool = new ImagePool(
      scene,
      TEX_GLOW_DISC,
      5,
      16,
      Phaser.BlendModes.ADD,
    );
  }

  ensureStageTexture(stageId: StageId): void {
    if (stageId === this.activeStageId) return;
    this.activeStageId = stageId;

    const key = stageTextureKey(stageId);
    if (this.scene.textures.exists(key)) {
      this.floorTile.setTexture(key);
      return;
    }

    if (this.loadingStageIds.has(stageId)) return;
    this.loadingStageIds.add(stageId);

    const onFileDone = (loadedKey: string): void => {
      if (loadedKey !== key) return;
      this.scene.load.off(Phaser.Loader.Events.FILE_COMPLETE, onFileDone);
      this.loadingStageIds.delete(stageId);
      if (this.activeStageId === stageId && this.scene.textures.exists(key)) {
        this.floorTile.setTexture(key);
      }
    };
    this.scene.load.on(Phaser.Loader.Events.FILE_COMPLETE, onFileDone);
    this.scene.load.image(key, stageTexturePath(stageId));
    if (!this.scene.load.isLoading()) {
      this.scene.load.start();
    }
  }

  update(
    stageId: StageId,
    corridorBounds: StageCorridorBounds | undefined,
    camCenterX: number,
    camCenterY: number,
    visW: number,
    visH: number,
    tick: number,
    highQuality: boolean,
  ): void {
    this.ensureStageTexture(stageId);

    const tileW = Math.ceil(visW + 128);
    const tileH = Math.ceil(visH + 128);
    if (this.floorTile.width !== tileW || this.floorTile.height !== tileH) {
      this.floorTile.setSize(tileW, tileH);
    }
    this.floorTile.setPosition(camCenterX, camCenterY);
    this.floorTile.tilePositionX = camCenterX - tileW * 0.5;
    this.floorTile.tilePositionY = camCenterY - tileH * 0.5;

    this.corridorGraphics.clear();
    this.wallPool.beginFrame();
    this.wallGlowPool.beginFrame();

    if (corridorBounds) {
      this.renderCorridorWalls(
        corridorBounds,
        camCenterX,
        camCenterY,
        visW,
        visH,
        tick,
        highQuality,
      );
    }

    this.wallPool.endFrame();
    this.wallGlowPool.endFrame();
  }

  private renderCorridorWalls(
    bounds: StageCorridorBounds,
    camCenterX: number,
    camCenterY: number,
    visW: number,
    visH: number,
    tick: number,
    highQuality: boolean,
  ): void {
    const g = this.corridorGraphics;
    const left = camCenterX - visW * 0.5 - 120;
    const right = camCenterX + visW * 0.5 + 120;
    const top = camCenterY - visH * 0.5 - 120;
    const bottom = camCenterY + visH * 0.5 + 120;
    const totalW = right - left;
    const totalH = bottom - top;

    // Horizontal corridor (e.g., Inlaid Library y in [-360, 360])
    if (bounds.minY !== undefined && top < bounds.minY) {
      const wallH = Math.max(0, bounds.minY - top);
      g.fillStyle(0x0b0812, 0.98);
      g.fillRect(left, top, totalW, wallH);

      // Soft cast shadow onto floor
      g.fillStyle(0x040308, 0.42);
      g.fillRect(left, bounds.minY, totalW, 14);
      g.fillStyle(0x040308, 0.22);
      g.fillRect(left, bounds.minY + 14, totalW, 18);

      // Carved trim bar along top wall border
      g.fillStyle(0x2d1e25, 1);
      g.fillRect(left, bounds.minY - 8, totalW, 8);
      g.fillStyle(0x6b4e40, 0.9);
      g.fillRect(left, bounds.minY - 2, totalW, 2);

      const step = 56;
      const startIdx = Math.floor(left / step) - 1;
      const endIdx = Math.ceil(right / step) + 1;
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const wx = idx * step;
        const shelf = this.wallPool.acquire();
        shelf.setTexture(ATLAS_WORLD, 'bookshelf');
        shelf.setOrigin(0.5, 1.0);
        shelf.setPosition(wx, bounds.minY - 2);
        shelf.setScale(0.64);
        shelf.setAlpha(1);
        shelf.setFlipX(false);
        shelf.setTint(0xdcd2e0);

        if (highQuality && ((idx % 5) + 5) % 5 === 2) {
          const glow = this.wallGlowPool.acquire();
          glow.setPosition(wx, bounds.minY + 10);
          const flicker = 0.16 + Math.sin(tick * 0.13 + idx) * 0.035;
          glow.setScale(1.15);
          glow.setAlpha(flicker);
          glow.setTint(0xff943d);
        }
      }
    }

    if (bounds.maxY !== undefined && bottom > bounds.maxY) {
      const wallH = Math.max(0, bottom - bounds.maxY);
      g.fillStyle(0x09070e, 0.98);
      g.fillRect(left, bounds.maxY, totalW, wallH);

      // Floor inner edge shadow
      g.fillStyle(0x040308, 0.34);
      g.fillRect(left, bounds.maxY - 16, totalW, 16);

      // Carved lower parapet rail
      g.fillStyle(0x2a1c24, 1);
      g.fillRect(left, bounds.maxY, totalW, 10);
      g.fillStyle(0x705344, 0.85);
      g.fillRect(left, bounds.maxY, totalW, 2);

      const step = 56;
      const startIdx = Math.floor(left / step) - 1;
      const endIdx = Math.ceil(right / step) + 1;
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const wx = idx * step;
        const shelf = this.wallPool.acquire();
        shelf.setTexture(ATLAS_WORLD, 'bookshelf');
        shelf.setOrigin(0.5, 0.12);
        shelf.setPosition(wx, bounds.maxY + 8);
        shelf.setScale(0.64);
        shelf.setAlpha(0.88);
        shelf.setFlipX(false);
        shelf.setTint(0x9a8ba6);
      }
    }

    // Vertical corridor (e.g., Gallo Tower x in [-380, 380])
    if (bounds.minX !== undefined && left < bounds.minX) {
      const wallW = Math.max(0, bounds.minX - left);
      g.fillStyle(0x08090f, 0.98);
      g.fillRect(left, top, wallW, totalH);

      // Inner shadow cast onto tower floor
      g.fillStyle(0x04050a, 0.42);
      g.fillRect(bounds.minX, top, 16, totalH);
      g.fillStyle(0x04050a, 0.2);
      g.fillRect(bounds.minX + 16, top, 18, totalH);

      // Stone masonry edge beam
      g.fillStyle(0x2a303f, 1);
      g.fillRect(bounds.minX - 10, top, 10, totalH);
      g.fillStyle(0x636f8a, 0.85);
      g.fillRect(bounds.minX - 2, top, 2, totalH);

      const step = 108;
      const startIdx = Math.floor(top / step) - 1;
      const endIdx = Math.ceil(bottom / step) + 1;
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const wy = idx * step;
        const pillar = this.wallPool.acquire();
        pillar.setTexture(ATLAS_WORLD, 'stone_pillar');
        pillar.setOrigin(0.5, 0.5);
        pillar.setPosition(bounds.minX - 22, wy);
        pillar.setScale(0.72);
        pillar.setAlpha(1);
        pillar.setFlipX(false);
        pillar.setTint(0xd4dae8);

        if (highQuality && ((idx % 3) + 3) % 3 === 1) {
          const glow = this.wallGlowPool.acquire();
          glow.setPosition(bounds.minX + 6, wy - 12);
          glow.setScale(1.1);
          glow.setAlpha(0.16 + Math.sin(tick * 0.12 + idx * 1.7) * 0.035);
          glow.setTint(0xff943d);
        }
      }
    }

    if (bounds.maxX !== undefined && right > bounds.maxX) {
      const wallW = Math.max(0, right - bounds.maxX);
      g.fillStyle(0x08090f, 0.98);
      g.fillRect(bounds.maxX, top, wallW, totalH);

      // Inner shadow cast onto tower floor
      g.fillStyle(0x04050a, 0.42);
      g.fillRect(bounds.maxX - 16, top, 16, totalH);
      g.fillStyle(0x04050a, 0.2);
      g.fillRect(bounds.maxX - 34, top, 18, totalH);

      // Stone masonry edge beam
      g.fillStyle(0x2a303f, 1);
      g.fillRect(bounds.maxX, top, 10, totalH);
      g.fillStyle(0x636f8a, 0.85);
      g.fillRect(bounds.maxX, top, 2, totalH);

      const step = 108;
      const startIdx = Math.floor(top / step) - 1;
      const endIdx = Math.ceil(bottom / step) + 1;
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const wy = idx * step;
        const pillar = this.wallPool.acquire();
        pillar.setTexture(ATLAS_WORLD, 'stone_pillar');
        pillar.setOrigin(0.5, 0.5);
        pillar.setPosition(bounds.maxX + 22, wy);
        pillar.setScale(0.72);
        pillar.setAlpha(1);
        pillar.setFlipX(true);
        pillar.setTint(0xd4dae8);

        if (highQuality && ((idx % 3) + 3) % 3 === 1) {
          const glow = this.wallGlowPool.acquire();
          glow.setPosition(bounds.maxX - 6, wy - 12);
          glow.setScale(1.1);
          glow.setAlpha(0.16 + Math.cos(tick * 0.12 + idx * 1.7) * 0.035);
          glow.setTint(0xff943d);
        }
      }
    }
  }

  destroy(): void {
    this.floorTile.destroy();
    this.corridorGraphics.destroy();
    this.wallPool.destroy();
    this.wallGlowPool.destroy();
  }
}
