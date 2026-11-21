import type {
  AudioAndDisplaySettings,
  Catalog,
  RenderFrameState,
  RunPhase,
  RunStartConfig,
  SimulationAction,
} from '../contracts/index.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import { FIXED_DT, GameSimulation, type SaveStore } from '../core/index.ts';
import { BattleRenderer } from '../render/index.ts';
import { BattleHudView } from '../ui/BattleHud.ts';
import { renderChestModal, type ChestModalHandle } from '../ui/ChestModal.ts';
import { renderDraftModal } from '../ui/DraftModal.ts';
import { renderPauseModal, type PauseModalHandle } from '../ui/PauseModal.ts';
import { renderReviveModal } from '../ui/ReviveModal.ts';
import { renderSettlementModal } from '../ui/SettlementModal.ts';
import { VirtualJoystickView } from '../ui/VirtualJoystick.ts';
import { ListenerBag, el } from './dom.ts';
import { InputManager } from './InputManager.ts';

export interface BattleControllerDeps {
  container: HTMLElement;
  catalog: Catalog;
  saveStore: SaveStore;
  audio: AudioEngine;
  onExitToMenu: () => void;
}

export class BattleController {
  private readonly container: HTMLElement;
  private readonly catalog: Catalog;
  private readonly saveStore: SaveStore;
  private readonly audio: AudioEngine;
  private readonly onExitToMenu: () => void;

  private readonly sim: GameSimulation;
  private readonly renderer: BattleRenderer;
  private readonly hud: BattleHudView;
  private readonly joystickView: VirtualJoystickView;
  private readonly input = new InputManager();
  private readonly listeners = new ListenerBag();
  private readonly modalHost: HTMLElement;
  private readonly loadingOverlay: HTMLElement;
  private readonly loadingFill: HTMLElement;
  private readonly loadingSub: HTMLElement;

  private readonly achievementById: Map<string, Catalog['achievements'][number]>;
  private readonly seenAchievements = new Set<string>();

  private rafId: number | null = null;
  private lastTimestamp = 0;
  private accumulator = 0;
  private fpsSampleStart = 0;
  private fpsFrameCount = 0;
  private destroyed = false;
  private settlementRecorded = false;
  private startedLoop = false;

  private currentFrame: RenderFrameState;
  private lastModalKey = '';
  private chestHandle: ChestModalHandle | null = null;
  private pauseHandle: PauseModalHandle | null = null;

  constructor(deps: BattleControllerDeps) {
    this.container = deps.container;
    this.catalog = deps.catalog;
    this.saveStore = deps.saveStore;
    this.audio = deps.audio;
    this.onExitToMenu = deps.onExitToMenu;

    this.achievementById = new Map(this.catalog.achievements.map((a) => [a.id, a]));

    const save = this.saveStore.getState();
    const config: RunStartConfig = {
      heroId: save.selectedHeroId,
      stageId: save.selectedStageId,
      hyper:
        save.stageOptions.hyper &&
        save.unlockedHyper.includes(save.selectedStageId),
      hurry: save.stageOptions.hurry,
      arcanasEnabled:
        save.stageOptions.arcanasEnabled &&
        save.unlockedRelics.includes('relic_randomazzo'),
      limitBreakEnabled: save.stageOptions.limitBreakEnabled,
      endless: save.stageOptions.endless,
      seed: ((Date.now() ^ ((save.totalRuns + 1) * 2654435761)) >>> 0) || 1,
    };

    this.sim = new GameSimulation(config, save, this.catalog);

    const canvasHost = el('div', { className: 'battle-canvas-host' });
    this.modalHost = el('div');
    this.joystickView = new VirtualJoystickView();
    this.hud = new BattleHudView({
      catalog: this.catalog,
      isMuted: () => this.audio.isMuted(),
      onToggleMute: () => {
        const nextMuted = !this.saveStore.getState().settings.muted;
        this.saveStore.updateSettings({ muted: nextMuted });
        this.audio.applySettings(this.saveStore.getState().settings);
      },
      onTogglePause: () => {
        if (!this.renderer.isReady()) return;
        this.dispatch({ type: 'toggle_pause' });
      },
    });

    this.loadingFill = el('div', { className: 'battle-loading-fill' });
    this.loadingSub = el('p', {
      className: 'battle-loading-sub num-font',
      text: '正在载入战场纹理与图集… 0%',
    });
    this.loadingOverlay = el('div', {
      className: 'battle-loading-overlay',
      dataset: { testid: 'battle-loading' },
      children: [
        el('div', {
          className: 'battle-loading-card',
          children: [
            el('h2', {
              className: 'battle-loading-title',
              text: `${this.catalog.stages[config.stageId].name} · 踏入灰烬之夜`,
            }),
            this.loadingSub,
            el('div', {
              className: 'battle-loading-track',
              children: [this.loadingFill],
            }),
          ],
        }),
      ],
    });

    this.container.append(
      canvasHost,
      this.hud.element,
      this.joystickView.element,
      this.modalHost,
      this.loadingOverlay,
    );

    const width = Math.max(1, this.container.clientWidth || window.innerWidth || 1280);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight || 800);

    this.renderer = new BattleRenderer(canvasHost, {
      stageId: config.stageId,
      width,
      height,
      visualEffectsQuality: save.settings.visualEffectsQuality,
      screenShakeEnabled: save.settings.screenShake,
      showDamageNumbers: save.settings.showDamageNumbers,
      onLoadProgress: (progress) => {
        if (this.destroyed) return;
        const clamped = Math.max(0, Math.min(1, progress));
        this.loadingFill.style.transform = `scaleX(${clamped.toFixed(3)})`;
        this.loadingSub.textContent = `正在载入战场纹理与图集… ${Math.round(clamped * 100)}%`;
      },
      onError: () => {
        if (this.destroyed) return;
        this.loadingSub.textContent = '部分资产载入异常，正在尝试继续进入战场…';
      },
    });

    this.currentFrame = this.sim.getRenderFrame();
  }

  start(): void {
    this.input.attach(this.container, {
      isPlaying: () => this.renderer.isReady() && this.currentFrame.phase === 'playing',
      onJoystickChange: (joy) => this.joystickView.update(joy),
      onGamepadPause: () => {
        if (!this.renderer.isReady()) return;
        if (this.currentFrame.phase === 'playing' || this.currentFrame.phase === 'paused') {
          this.dispatch({ type: 'toggle_pause' });
        }
      },
    });

    this.bindEvents();
    this.hud.update(this.currentFrame, this.audio.isMuted());

    const beginActiveBattle = (): void => {
      if (this.destroyed || this.startedLoop) return;
      this.startedLoop = true;

      this.loadingFill.style.transform = 'scaleX(1)';
      this.loadingOverlay.remove();

      const stageDef = this.catalog.stages[this.sim.config.stageId];
      this.audio.startBgm(stageDef.bgmTheme);

      this.syncFrame(this.currentFrame);
      const now = performance.now();
      this.lastTimestamp = now;
      this.fpsSampleStart = now;
      this.fpsFrameCount = 0;
      this.rafId = window.requestAnimationFrame(this.onAnimationFrame);
    };

    if (this.renderer.isReady()) {
      beginActiveBattle();
    } else {
      void this.renderer.ready().then(beginActiveBattle);
    }
  }

  private bindEvents(): void {
    this.listeners.on(window, 'resize', () => {
      if (this.destroyed) return;
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.renderer.resize(w, h);
    });

    this.listeners.on(document, 'visibilitychange', () => {
      if (
        document.hidden &&
        this.renderer.isReady() &&
        this.currentFrame.phase === 'playing'
      ) {
        this.dispatch({ type: 'toggle_pause' });
      }
    });

    this.listeners.on(window, 'keydown', (ev) => {
      if (this.destroyed || !this.renderer.isReady()) return;
      if (ev.repeat) return;

      const phase = this.currentFrame.phase;

      if (phase === 'playing') {
        if (ev.code === 'Space' || ev.code === 'Escape') {
          ev.preventDefault();
          this.dispatch({ type: 'toggle_pause' });
        }
        return;
      }

      if (phase === 'paused') {
        if (ev.code === 'Space' || ev.code === 'Escape') {
          ev.preventDefault();
          this.dispatch({ type: 'toggle_pause' });
        } else if (ev.code === 'KeyG') {
          ev.preventDefault();
          this.pauseHandle?.focusSection('grimoire');
        } else if (ev.code === 'KeyM') {
          ev.preventDefault();
          this.pauseHandle?.focusSection('map');
        }
        return;
      }

      if (phase === 'level_up' || phase === 'arcana_select') {
        const draft = this.currentFrame.draftModal;
        if (!draft) return;

        const numMatch = /^(?:Digit|Numpad)([1-4])$/.exec(ev.code);
        if (numMatch) {
          const idx = Number(numMatch[1]) - 1;
          const opt = draft.options[idx];
          if (opt) {
            ev.preventDefault();
            this.dispatch(
              draft.banishModeActive
                ? { type: 'banish_draft', optionId: opt.optionId }
                : { type: 'choose_draft', optionId: opt.optionId },
            );
          }
          return;
        }

        if (ev.code === 'KeyR') {
          ev.preventDefault();
          this.dispatch({ type: 'reroll_draft' });
        } else if (ev.code === 'KeyX' && phase === 'level_up') {
          ev.preventDefault();
          this.dispatch({ type: 'skip_draft' });
        } else if (ev.code === 'KeyB' && phase === 'level_up') {
          ev.preventDefault();
          this.dispatch({ type: 'toggle_banish_mode' });
        }
        return;
      }

      if (phase === 'chest') {
        if (ev.code === 'Space' || ev.code === 'Enter') {
          ev.preventDefault();
          if (this.chestHandle?.canSkipNow()) {
            this.dispatch({ type: 'close_chest' });
          }
        }
        return;
      }

      if (phase === 'revive') {
        if (ev.code === 'Enter' || ev.code === 'Space') {
          ev.preventDefault();
          this.dispatch({ type: 'confirm_revive' });
        }
        return;
      }

      if (phase === 'settlement') {
        if (ev.code === 'Enter' || ev.code === 'Escape') {
          ev.preventDefault();
          this.exitToMenu();
        }
      }
    });
  }

  private onAnimationFrame = (timestamp: number): void => {
    if (this.destroyed) return;

    this.fpsFrameCount += 1;
    const fpsSpan = timestamp - this.fpsSampleStart;
    if (fpsSpan >= 400) {
      this.hud.updateFps((this.fpsFrameCount * 1000) / fpsSpan);
      this.fpsSampleStart = timestamp;
      this.fpsFrameCount = 0;
    }

    const rawDt = Math.max(0, (timestamp - this.lastTimestamp) / 1000);
    this.lastTimestamp = timestamp;
    const clampedDt = Math.min(0.1, rawDt);

    if (this.currentFrame.phase === 'playing') {
      this.accumulator += clampedDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 6) {
        const move = this.input.pollMovement();
        const nextPhase = this.sim.stepTick(move.x, move.y, FIXED_DT);
        this.accumulator -= FIXED_DT;
        steps += 1;
        if (nextPhase !== 'playing') {
          this.accumulator = 0;
          break;
        }
      }
      if (steps > 0) {
        const frame = this.sim.getRenderFrame();
        this.syncFrame(frame);
      }
    } else {
      this.accumulator = 0;
    }

    this.rafId = window.requestAnimationFrame(this.onAnimationFrame);
  };

  private dispatch(action: SimulationAction): void {
    const prevPhase = this.currentFrame.phase;
    const next = this.sim.dispatch(action);
    this.syncFrame(next);

    if (prevPhase !== next.phase) {
      if (next.phase === 'paused') {
        this.audio.pauseBgm();
      } else if (next.phase === 'playing' && prevPhase === 'paused') {
        this.audio.resumeBgm();
      }
    }
  }

  private syncFrame(frame: RenderFrameState): void {
    this.currentFrame = frame;

    const isPlaying = frame.phase === 'playing';
    if (!isPlaying) {
      this.input.resetJoystick();
    }

    if (frame.audioCues.length > 0) {
      this.audio.playCues(frame.audioCues);
    }

    this.renderer.render(frame);
    this.renderer.setPaused(!isPlaying);
    this.hud.update(frame, this.audio.isMuted());
    this.checkAchievementToasts();
    this.syncModalForPhase(frame);

    if (frame.phase === 'settlement' && !this.settlementRecorded) {
      this.settlementRecorded = true;
      this.audio.stopBgm();
      const summary = this.sim.getRunSummaryForSave();
      this.saveStore.recordSettlement(summary.settlement, {
        runBestiaryKills: summary.runBestiaryKills,
        discoveredItems: summary.discoveredItems,
        unlockedRelics: summary.unlockedRelics,
        hyperEnabled: summary.hyperEnabled,
      });
    }
  }

  private checkAchievementToasts(): void {
    for (const achId of this.sim.progression.runUnlockedAchievements) {
      if (this.seenAchievements.has(achId)) continue;
      this.seenAchievements.add(achId);
      const def = this.achievementById.get(achId);
      if (def) {
        this.hud.pushAchievementToast(def);
        this.audio.playCue({ type: 'ui_buy' });
      }
    }
  }

  private computeModalKey(frame: RenderFrameState): string {
    const p: RunPhase = frame.phase;
    if (p === 'playing') return 'playing';
    if (p === 'level_up' || p === 'arcana_select') {
      const d = frame.draftModal;
      if (!d) return p;
      const opts = d.options.map((o) => o.optionId).join(',');
      return `${p}:${d.playerLevel}:${d.banishModeActive ? 1 : 0}:${d.rerollsRemaining}:${d.skipsRemaining}:${d.banishesRemaining}:${opts}`;
    }
    if (p === 'chest') {
      const c = frame.chestModal;
      return `chest:${c?.tier ?? ''}:${c?.itemCount ?? 0}:${c?.bonusGold ?? 0}`;
    }
    if (p === 'paused') {
      return `paused:${frame.tick}`;
    }
    if (p === 'revive') {
      return `revive:${frame.reviveModal?.revivalsRemaining ?? 0}`;
    }
    return `settlement:${frame.settlementModal?.elapsedSeconds ?? 0}`;
  }

  private syncModalForPhase(frame: RenderFrameState): void {
    const nextKey = this.computeModalKey(frame);
    if (nextKey === this.lastModalKey) return;
    this.lastModalKey = nextKey;

    this.clearActiveModal();

    switch (frame.phase) {
      case 'playing':
        break;

      case 'level_up':
      case 'arcana_select':
        if (frame.draftModal) {
          this.modalHost.appendChild(
            renderDraftModal({
              catalog: this.catalog,
              draft: frame.draftModal,
              hud: frame.hud,
              onChoose: (optionId) => this.dispatch({ type: 'choose_draft', optionId }),
              onBanish: (optionId) => this.dispatch({ type: 'banish_draft', optionId }),
              onReroll: () => this.dispatch({ type: 'reroll_draft' }),
              onSkip: () => this.dispatch({ type: 'skip_draft' }),
              onToggleBanish: () => this.dispatch({ type: 'toggle_banish_mode' }),
            }),
          );
        }
        break;

      case 'chest':
        if (frame.chestModal) {
          this.chestHandle = renderChestModal({
            chest: frame.chestModal,
            onClose: () => this.dispatch({ type: 'close_chest' }),
          });
          this.modalHost.appendChild(this.chestHandle.element);
        }
        break;

      case 'paused':
        if (frame.pauseSnapshot) {
          this.pauseHandle = renderPauseModal({
            catalog: this.catalog,
            frame,
            pause: frame.pauseSnapshot,
            settings: this.saveStore.getState().settings,
            onUpdateSettings: (opts: Partial<AudioAndDisplaySettings>) => {
              this.saveStore.updateSettings(opts);
              const nextSettings = this.saveStore.getState().settings;
              this.audio.applySettings(nextSettings);
              this.renderer.setDisplayOptions({
                visualEffectsQuality: nextSettings.visualEffectsQuality,
                screenShakeEnabled: nextSettings.screenShake,
                showDamageNumbers: nextSettings.showDamageNumbers,
              });
            },
            onResume: () => this.dispatch({ type: 'toggle_pause' }),
            onRetire: () => this.dispatch({ type: 'end_run' }),
          });
          this.modalHost.appendChild(this.pauseHandle.element);
        }
        break;

      case 'revive':
        if (frame.reviveModal) {
          this.modalHost.appendChild(
            renderReviveModal({
              heroId: frame.player.heroId,
              revive: frame.reviveModal,
              onRevive: () => this.dispatch({ type: 'confirm_revive' }),
              onForfeit: () => this.dispatch({ type: 'forfeit_revive' }),
            }),
          );
        }
        break;

      case 'settlement':
        if (frame.settlementModal) {
          this.modalHost.appendChild(
            renderSettlementModal({
              catalog: this.catalog,
              settlement: frame.settlementModal,
              onReturnMenu: () => this.exitToMenu(),
            }),
          );
        }
        break;
    }
  }

  private clearActiveModal(): void {
    if (this.chestHandle) {
      this.chestHandle.dispose();
      this.chestHandle = null;
    }
    this.pauseHandle = null;
    this.modalHost.replaceChildren();
  }

  private exitToMenu(): void {
    this.audio.playCue({ type: 'ui_click' });
    this.onExitToMenu();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.clearActiveModal();
    this.input.detach();
    this.listeners.clear();
    this.renderer.destroy();
    this.audio.stopBgm();
  }
}
