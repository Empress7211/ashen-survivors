import Phaser from 'phaser';
import type { RenderFrameState, StageId } from '../contracts/index';
import { EntityRenderer } from './EntityRenderer';
import { IndicatorRenderer } from './IndicatorRenderer';
import {
  TEX_VIGNETTE,
  createProceduralTextures,
  queueCorePreload,
  queueLazyPassiveIcons,
} from './RenderAssets';
import { FloatingTextPool } from './SpritePool';
import { VfxRenderer } from './VfxRenderer';
import { WorldRenderer } from './WorldRenderer';
import type { BattleRendererDisplayOptions } from './types';

interface LocalPlayerDmgText {
  uid: number;
  x: number;
  y: number;
  text: string;
  age: number;
  maxAge: number;
}

export interface BattleSceneCallbacks {
  onLoadProgress?: (progress: number) => void;
  onSceneReady: () => void;
  onSceneError: (error: unknown) => void;
}

export class BattleScene extends Phaser.Scene {
  private readonly initialStageId: StageId;
  private readonly callbacks: BattleSceneCallbacks;

  private worldRenderer: WorldRenderer | null = null;
  private entityRenderer: EntityRenderer | null = null;
  private vfxRenderer: VfxRenderer | null = null;
  private indicatorRenderer: IndicatorRenderer | null = null;
  private floatingTextPool: FloatingTextPool | null = null;
  private vignette: Phaser.GameObjects.Image | null = null;

  private viewW: number;
  private viewH: number;
  private camZoom = 1;
  private sceneReady = false;
  private destroyed = false;

  private highQuality = true;
  private screenShakeEnabled = true;
  private showDamageNumbers = true;

  private prevTick = -1;
  private prevPlayerHp = -1;
  private nextLocalTextUid = -1;
  private readonly localDmgTexts: LocalPlayerDmgText[] = [];

  constructor(
    initialStageId: StageId,
    viewW: number,
    viewH: number,
    display: Required<BattleRendererDisplayOptions>,
    callbacks: BattleSceneCallbacks,
  ) {
    super({ key: 'BattleScene' });
    this.initialStageId = initialStageId;
    this.viewW = Math.max(1, Math.floor(viewW));
    this.viewH = Math.max(1, Math.floor(viewH));
    this.highQuality = display.visualEffectsQuality === 'high';
    this.screenShakeEnabled = display.screenShakeEnabled;
    this.showDamageNumbers = display.showDamageNumbers;
    this.callbacks = callbacks;
  }

  preload(): void {
    this.load.on(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError, this);
    queueCorePreload(this.load, this.initialStageId);
  }

  create(): void {
    if (this.destroyed) return;
    this.load.off(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError, this);

    createProceduralTextures(this.textures);

    this.cameras.main.setBackgroundColor('#08060c');

    this.worldRenderer = new WorldRenderer(this, this.initialStageId);
    this.entityRenderer = new EntityRenderer(this);
    this.vfxRenderer = new VfxRenderer(this, this.viewW, this.viewH);
    this.indicatorRenderer = new IndicatorRenderer(this);
    this.floatingTextPool = new FloatingTextPool(this, 20, 220);

    this.vignette = this.add.image(
      this.viewW * 0.5,
      this.viewH * 0.5,
      TEX_VIGNETTE,
    );
    this.vignette.setOrigin(0.5, 0.5);
    this.vignette.setScrollFactor(0);
    this.vignette.setDepth(25);
    this.vignette.setAlpha(0.38);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.cleanup, this);

    this.sceneReady = true;
    this.handleResize(this.viewW, this.viewH);
    this.callbacks.onSceneReady();

    // Non-blocking lazy preload of stage passive icons in background
    queueLazyPassiveIcons(this.load, this.textures);
  }

  setDisplayOptions(options: BattleRendererDisplayOptions): void {
    if (options.visualEffectsQuality !== undefined) {
      this.highQuality = options.visualEffectsQuality === 'high';
    }
    if (options.screenShakeEnabled !== undefined) {
      this.screenShakeEnabled = options.screenShakeEnabled;
    }
    if (options.showDamageNumbers !== undefined) {
      this.showDamageNumbers = options.showDamageNumbers;
      if (!this.showDamageNumbers) {
        this.floatingTextPool?.hideAll();
      }
    }
  }

  handleResize(width: number, height: number): void {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.viewW = w;
    this.viewH = h;

    if (!this.sceneReady || this.destroyed) return;

    const cam = this.cameras.main;
    cam.setViewport(0, 0, w, h);

    // Keep standard desktop 1280x800..1600x960 at crisp 1.0 zoom; adapt gently at extremes
    let zoom = 1;
    if (w > 1680 || h > 980) {
      zoom = Math.min(1.35, Math.max(w / 1560, h / 920));
    } else if (w < 920) {
      zoom = Math.max(0.66, w / 1040);
    }
    this.camZoom = zoom;
    cam.setZoom(zoom);

    if (this.vignette) {
      const invZoom = 1 / zoom;
      this.vignette.setPosition(w * 0.5, h * 0.5);
      this.vignette.setDisplaySize(w * invZoom + 6, h * invZoom + 6);
    }

    this.vfxRenderer?.resizeOverlay(w, h, zoom);
    this.indicatorRenderer?.resize(w, h, zoom);
  }

  applyFrameState(state: RenderFrameState): void {
    if (!this.sceneReady || this.destroyed) return;

    const cam = this.cameras.main;
    const visW = this.viewW / this.camZoom;
    const visH = this.viewH / this.camZoom;

    // Reset local damage markers if a new run started on same instance
    if (state.tick < this.prevTick) {
      this.localDmgTexts.length = 0;
      this.prevPlayerHp = state.player.hp;
    }

    // Track local player contact damage text when HP drops cleanly
    if (this.prevTick >= 0 && state.tick > this.prevTick) {
      const dt = Math.min(0.1, (state.tick - this.prevTick) / 60);
      this.advanceLocalDamageTexts(dt);

      if (
        this.prevPlayerHp > 0 &&
        state.player.hp < this.prevPlayerHp &&
        state.phase === 'playing'
      ) {
        const lost = Math.round(this.prevPlayerHp - state.player.hp);
        if (lost > 0) {
          this.localDmgTexts.push({
            uid: this.nextLocalTextUid--,
            x: state.player.x,
            y: state.player.y - 26,
            text: `-${lost}`,
            age: 0,
            maxAge: 0.72,
          });
        }
      }
    }
    this.prevTick = state.tick;
    this.prevPlayerHp = state.player.hp;

    // Micro camera shake
    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShakeEnabled && state.screenShake > 0.05) {
      const amp = Math.min(11, state.screenShake);
      shakeX = Math.sin(state.tick * 2.71) * amp;
      shakeY = Math.cos(state.tick * 3.37) * amp * 0.85;
    }

    const camCenterX = state.player.x + shakeX;
    const camCenterY = state.player.y + shakeY;
    cam.setScroll(camCenterX - this.viewW * 0.5, camCenterY - this.viewH * 0.5);

    // Render ordered layers
    this.worldRenderer?.update(
      state.stageId,
      state.corridorBounds,
      camCenterX,
      camCenterY,
      visW,
      visH,
      state.tick,
      this.highQuality,
    );

    this.entityRenderer?.render(
      state,
      camCenterX,
      camCenterY,
      visW,
      visH,
      this.highQuality,
    );

    this.vfxRenderer?.render(
      state,
      camCenterX,
      camCenterY,
      visW,
      visH,
      this.highQuality,
    );

    this.indicatorRenderer?.render(
      this,
      state,
      camCenterX,
      camCenterY,
      this.viewW,
      this.viewH,
      this.camZoom,
    );

    this.renderFloatingTexts(state);
  }

  private advanceLocalDamageTexts(dt: number): void {
    let i = 0;
    while (i < this.localDmgTexts.length) {
      const t = this.localDmgTexts[i]!;
      t.age += dt;
      t.y -= 32 * dt;
      if (t.age >= t.maxAge) {
        const last = this.localDmgTexts.pop()!;
        if (i < this.localDmgTexts.length) {
          this.localDmgTexts[i] = last;
        }
      } else {
        i++;
      }
    }
  }

  private renderFloatingTexts(state: RenderFrameState): void {
    const pool = this.floatingTextPool;
    if (!pool) return;

    if (!this.showDamageNumbers) {
      pool.hideAll();
      return;
    }

    pool.beginFrame();
    const list = state.floatingTexts;
    for (let i = 0; i < list.length; i++) {
      const ft = list[i]!;
      pool.renderItem(ft.uid, ft.x, ft.y, ft.text, ft.kind, ft.progress);
    }
    for (let i = 0; i < this.localDmgTexts.length; i++) {
      const lt = this.localDmgTexts[i]!;
      pool.renderItem(
        lt.uid,
        lt.x,
        lt.y,
        lt.text,
        'player_damage',
        Math.min(1, lt.age / lt.maxAge),
      );
    }
    pool.endFrame();
  }

  private handleLoadProgress = (value: number): void => {
    this.callbacks.onLoadProgress?.(value);
  };

  private handleLoadError(file: Phaser.Loader.File): void {
    this.callbacks.onSceneError(
      new Error(`Failed to load render asset: ${file.key} (${String(file.url)})`),
    );
  }

  private cleanup(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sceneReady = false;
    this.load.off(Phaser.Loader.Events.PROGRESS, this.handleLoadProgress, this);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError, this);

    this.worldRenderer?.destroy();
    this.worldRenderer = null;

    this.entityRenderer?.destroy();
    this.entityRenderer = null;

    this.vfxRenderer?.destroy();
    this.vfxRenderer = null;

    this.indicatorRenderer?.destroy();
    this.indicatorRenderer = null;

    this.floatingTextPool?.destroy();
    this.floatingTextPool = null;

    this.vignette?.destroy();
    this.vignette = null;

    this.localDmgTexts.length = 0;
  }
}
