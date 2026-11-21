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

  private glContext: WebGL2RenderingContext | null = null;
  private canvasEl: HTMLCanvasElement | null = null;
  private resolveReady!: () => void;
  private sceneIsReady = false;
  private destroyed = false;
  private pendingState: RenderFrameState | null = null;
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
        onSceneReady: () => {
          if (this.destroyed) {
            this.resolveReady();
            return;
          }
          this.sceneIsReady = true;
          this.scene.handleResize(this.width, this.height);
          if (this.pendingState) {
            this.scene.applyFrameState(this.pendingState);
            this.pendingState = null;
          }
          options.onReady?.();
          this.resolveReady();
        },
        onSceneError: (err) => {
          options.onError?.(err);
        },
      },
    );

    // Prefer explicit WebGL2 context for Phaser 3.90 WebGL2 rendering; fall back to AUTO if unavailable
    const probeCanvas = document.createElement('canvas');
    probeCanvas.width = this.width;
    probeCanvas.height = this.height;
    probeCanvas.style.display = 'block';
    probeCanvas.style.width = '100%';
    probeCanvas.style.height = '100%';

    let gl2: WebGL2RenderingContext | null = null;
    try {
      gl2 = probeCanvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
      });
    } catch {
      gl2 = null;
    }

    const baseConfig: Phaser.Types.Core.GameConfig = {
      width: this.width,
      height: this.height,
      backgroundColor: '#08060c',
      antialias: true,
      antialiasGL: true,
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
    };

    if (gl2) {
      this.glContext = gl2;
      this.canvasEl = probeCanvas;
      this.container.appendChild(probeCanvas);
      this.game = new Phaser.Game({
        ...baseConfig,
        type: Phaser.WEBGL,
        canvas: probeCanvas,
        context: gl2 as unknown as CanvasRenderingContext2D,
      });
    } else {
      this.game = new Phaser.Game({
        ...baseConfig,
        type: Phaser.AUTO,
        parent: this.container,
      });
      this.canvasEl = this.game.canvas ?? null;
      if (this.canvasEl) {
        this.canvasEl.style.display = 'block';
        this.canvasEl.style.width = '100%';
        this.canvasEl.style.height = '100%';
      }
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

  setDisplayOptions(options: BattleRendererDisplayOptions): void {
    if (this.destroyed) return;
    this.scene.setDisplayOptions(options);
  }

  render(state: RenderFrameState): void {
    if (this.destroyed) return;
    if (!this.sceneIsReady) {
      this.pendingState = state;
      return;
    }
    this.scene.applyFrameState(state);
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
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.sceneIsReady = false;
    this.pendingState = null;

    const gl = this.glContext;
    const canvas = this.canvasEl ?? this.game.canvas;
    this.glContext = null;
    this.canvasEl = null;

    try {
      this.game.destroy(true, false);
      // Phaser.Game.destroy sets pendingDestroy=true and defers runDestroy() to next step;
      // step synchronously if needed so textures, GL wrappers, listeners, and canvas are freed immediately.
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
      if (gl && !gl.isContextLost()) {
        try {
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } catch {
          // ignore cleanup extension errors
        }
      }
      this.resolveReady();
    }
  }
}
