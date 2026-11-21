import type { StageId } from '../contracts/index';

export interface BattleRendererDisplayOptions {
  /** 'high' enables extra additive glow halos & motion trails; 'medium' reduces non-essential glow quads. */
  visualEffectsQuality?: 'high' | 'medium';
  /** Enables/disables micro camera shake on hits/explosions. */
  screenShakeEnabled?: boolean;
  /** Enables/disables floating damage, heal, and status numbers. */
  showDamageNumbers?: boolean;
}

export interface BattleRendererOptions extends BattleRendererDisplayOptions {
  /** Optional stage ID to preload right away (will still swap/load dynamically if state.stageId differs). */
  stageId?: StageId;
  /** Initial viewport width in CSS pixels (defaults to container.clientWidth || 1280). */
  width?: number;
  /** Initial viewport height in CSS pixels (defaults to container.clientHeight || 720). */
  height?: number;
  /** Callback invoked with preload progress in [0, 1]. */
  onLoadProgress?: (progress: number) => void;
  /** Callback invoked once the Phaser scene and atlases have finished preloading and setup. */
  onReady?: () => void;
  /** Optional error callback if WebGL/Phaser asset loading reports a failure. */
  onError?: (error: unknown) => void;
}

export interface InterpPosSnapshot {
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  seenTick: number;
}

export interface EntityRenderInterp {
  alpha?: number;
  playerX?: number;
  playerY?: number;
  enemySnaps?: ReadonlyMap<number, InterpPosSnapshot>;
}

export interface VfxRenderInterp {
  alpha?: number;
  playerX?: number;
  playerY?: number;
  projSnaps?: ReadonlyMap<number, InterpPosSnapshot>;
}
