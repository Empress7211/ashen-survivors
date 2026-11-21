import Phaser from 'phaser';
import type { RenderFrameState, StageId } from '../contracts/index';
import { BattleScene } from './BattleScene';
import type {
  BattleRendererDisplayOptions,
  BattleRendererOptions,
} from './types';

export class BattleRenderer {
  private readonly container: HTMLElement;
  private readonly scene: BattleScene;
  private readonly game: Phaser.Game;
  private readonly readyPromise: Promise<void>;

  private canvasEl: HTMLCanvasElement | null = null;
  private resolveReady!: () => void;
  private sceneIsReady = false;
  private destroyed = false;
  private paused = false;
  private pendingState: RenderFrameState | null = null;
  private pendingAlpha = 1;
  private width: number;
  private height: number;

  constructor(container: HTMLElement, options: BattleRendererOptions = {}) {
    this.container = container;
    this.width = Math.max(
      1,
      Math.floor(options.width ?? (container.clientWidth || 1280)),
    );
    this.height = Math.max(
      1,
      Math.floor(options.height ?? (container.clientHeight || 720)),
    );

    const initialStageId: StageId = options.stageId ?? 'mad_forest';
    const display: Required<BattleRendererDisplayOptions> = {
      visualEffectsQuality: options.visualEffectsQuality ?? 'high',
      screenShakeEnabled: options.screenShakeEnabled ?? true,
      showDamageNumbers: options.showDamageNumbers ?? true,
    };

    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });

    this.scene = new BattleScene(
      initialStageId,
      this.width,
      this.height,
      display,
      {
        onLoadProgress: options.onLoadProgress,
        onSceneReady: () => {
          if (this.destroyed) {
            this.resolveReady();
            return;
          }
          this.sceneIsReady = true;
          this.scene.handleResize(this.width, this.height);
          if (this.pendingState) {
            this.scene.applyFrameState(this.pendingState, this.pendingAlpha);
            this.pendingState = null;
            this.pendingAlpha = 1;
          }
          options.onReady?.();
          this.resolveReady();
        },
        onSceneError: (err) => {
          options.onError?.(err);
        },
      },
    );

    // Let Phaser 3.90 initialize its native WebGL1 / Canvas renderer cleanly
    // (manual WebGL2 injection breaks Phaser's extension & DST_ALPHA state on hardware GPUs)
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width: this.width,
      height: this.height,
      backgroundColor: '#08060c',
      transparent: false,
      antialias: true,
      antialiasGL: false,
      roundPixels: false,
      powerPreference: 'high-performance',
      batchSize: 4096,
      banner: false,
      autoFocus: false,
      disableContextMenu: true,
      input: false,
      audio: { noAudio: true },
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
      },
      scene: this.scene,
    });

    this.canvasEl = this.game.canvas ?? null;
    if (this.canvasEl) {
      this.canvasEl.style.display = 'block';
      this.canvasEl.style.width = '100%';
      this.canvasEl.style.height = '100%';
    }
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  isReady(): boolean {
    return this.sceneIsReady && !this.destroyed;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  setPaused(paused: boolean): void {
    if (this.destroyed || this.paused === paused) return;
    this.paused = paused;
    if (!this.sceneIsReady) return;

    if (paused) {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
      if (this.game.loop.running) {
        this.game.events.once(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
      }
    } else {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
      if (!this.game.loop.running) {
        this.game.loop.wake();
      }
    }
  }

  private sleepOnPostRender = (): void => {
    if (!this.destroyed && this.paused && this.game.loop && this.game.loop.running) {
      this.game.loop.sleep();
    }
  };

  setDisplayOptions(options: BattleRendererDisplayOptions): void {
    if (this.destroyed) return;
    this.scene.setDisplayOptions(options);
  }

  render(state: RenderFrameState, alpha = 1): void {
    if (this.destroyed) return;
    if (!this.sceneIsReady) {
      this.pendingState = state;
      this.pendingAlpha = alpha;
      return;
    }
    this.scene.applyFrameState(state, alpha);
    if (this.paused && !this.game.loop.running) {
      this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
      this.game.events.once(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
      this.game.loop.wake();
    }
  }

  resize(width: number, height: number): void {
    if (this.destroyed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    if (w === this.width && h === this.height) return;

    this.width = w;
    this.height = h;

    if (this.game.scale) {
      this.game.scale.resize(w, h);
    }
    if (this.canvasEl) {
      this.canvasEl.style.width = '100%';
      this.canvasEl.style.height = '100%';
    }
    if (this.sceneIsReady) {
      this.scene.handleResize(w, h);
      if (this.paused && !this.game.loop.running) {
        this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
        this.game.events.once(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
        this.game.loop.wake();
      }
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sceneIsReady = false;
    this.pendingState = null;
    this.pendingAlpha = 1;

    this.game.events.off(Phaser.Core.Events.POST_RENDER, this.sleepOnPostRender);
    const canvas = this.canvasEl ?? this.game.canvas;
    this.canvasEl = null;

    try {
      this.game.destroy(true, false);
      const internalGame = this.game as unknown as {
        pendingDestroy?: boolean;
        step?: (time: number, delta: number) => void;
      };
      if (internalGame.pendingDestroy && typeof internalGame.step === 'function') {
        internalGame.step(0, 0);
      }
    } finally {
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      this.resolveReady();
    }
  }
}
