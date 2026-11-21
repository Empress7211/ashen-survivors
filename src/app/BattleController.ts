import type {
  AudioAndDisplaySettings,
  AutoLevelUpMode,
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
import { GamepadMenuNavigator, InputManager } from './InputManager.ts';

export interface BattleControllerDeps {
  container: HTMLElement;
  catalog: Catalog;
  saveStore: SaveStore;
  audio: AudioEngine;
  onRestartBattle?: () => void;
  onExitToMenu: () => void;
}

export class BattleController {
  private readonly container: HTMLElement;
  private readonly catalog: Catalog;
  private readonly saveStore: SaveStore;
  private readonly audio: AudioEngine;
  private readonly onRestartBattle?: () => void;
  private readonly onExitToMenu: () => void;

  private readonly sim: GameSimulation;
  private readonly renderer: BattleRenderer;
  private readonly hud: BattleHudView;
  private readonly joystickView: VirtualJoystickView;
  private readonly input = new InputManager();
  private readonly menuNav = new GamepadMenuNavigator();
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
  private lastSyncedPhase: RunPhase = 'playing';
  private lastModalKey = '';
  private chestHandle: ChestModalHandle | null = null;
  private pauseHandle: PauseModalHandle | null = null;

  constructor(deps: BattleControllerDeps) {
    this.container = deps.container;
    this.catalog = deps.catalog;
    this.saveStore = deps.saveStore;
    this.audio = deps.audio;
    this.onRestartBattle = deps.onRestartBattle;
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
      funMode: this.saveStore.getFunMode(),
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
      onToggleMouseFollow: () => {
        if (!this.renderer.isReady()) return;
        this.toggleMouseFollow();
      },
      onDisableAutoLevelUp: () => {
        if (!this.renderer.isReady()) return;
        this.applyAutoLevelUpMode('off');
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
    this.input.setMouseFollow(Boolean(this.saveStore.getState().settings.mouseFollow));
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
    const initialSettings = this.saveStore.getState().settings;
    this.hud.update(this.currentFrame, this.audio.isMuted(), {
      showMinimap: initialSettings.showMinimap,
      mouseFollow: initialSettings.mouseFollow,
    });

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
    this.listeners.on(
      window,
      'pointerdown',
      () => {
        if (this.menuNav.isActive()) {
          this.menuNav.clearFocus(true);
        }
      },
      { passive: true },
    );

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
      if (ev.repeat || ev.metaKey || ev.ctrlKey || ev.altKey) return;

      const phase = this.currentFrame.phase;

      if (phase === 'playing') {
        if (ev.code === 'Space' || ev.code === 'Escape') {
          ev.preventDefault();
          this.dispatch({ type: 'toggle_pause' });
        } else if (ev.code === 'KeyF') {
          ev.preventDefault();
          this.toggleMouseFollow();
        } else if (ev.code === 'KeyT') {
          ev.preventDefault();
          const cur = this.currentFrame.hud.autoLevelUpMode ?? 'off';
          this.applyAutoLevelUpMode(cur === 'off' ? 'smart' : 'off');
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
        } else if (ev.code === 'KeyT' && phase === 'level_up') {
          ev.preventDefault();
          this.applyAutoLevelUpMode('smart');
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
        const shareBackdrop = document.querySelector<HTMLElement>('[data-testid="modal-share-card"]');
        if (shareBackdrop) {
          if (ev.code === 'Escape') {
            ev.preventDefault();
            const closeBtn = shareBackdrop.querySelector<HTMLButtonElement>(
              '[data-testid="btn-close-share-card"]',
            );
            if (closeBtn) {
              closeBtn.click();
            } else {
              shareBackdrop.remove();
            }
          }
          return;
        }
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
      const alpha =
        this.sim.phase === 'playing'
          ? Math.max(0, Math.min(1, this.accumulator / FIXED_DT))
          : 1;
      if (steps > 0) {
        const frame = this.sim.getRenderFrame();
        this.syncFrame(frame, alpha);
      } else {
        this.renderer.render(this.currentFrame, alpha);
      }
    } else {
      this.accumulator = 0;
      if (this.renderer.isReady()) {
        this.pollModalGamepadNavigation(timestamp);
      }
    }

    this.rafId = window.requestAnimationFrame(this.onAnimationFrame);
  };

  private pollModalGamepadNavigation(timestamp: number): void {
    const res = this.menuNav.poll(timestamp);
    const phase = this.currentFrame.phase;

    if (res.direction) {
      this.menuNav.moveFocus(this.modalHost, res.direction);
      this.audio.playCue({ type: 'ui_hover' });
    } else if (res.confirmPressed) {
      const activated = this.menuNav.activateFocused(this.modalHost);
      if (!activated) {
        if (phase === 'chest' && this.chestHandle?.canSkipNow()) {
          this.dispatch({ type: 'close_chest' });
        } else if (phase === 'revive') {
          this.dispatch({ type: 'confirm_revive' });
        } else if (phase === 'settlement') {
          this.exitToMenu();
        }
      }
    } else if (res.cancelPressed) {
      if (phase === 'paused') {
        this.dispatch({ type: 'toggle_pause' });
      } else if (phase === 'chest' && this.chestHandle?.canSkipNow()) {
        this.dispatch({ type: 'close_chest' });
      } else if (phase === 'settlement') {
        this.exitToMenu();
      } else if (phase === 'level_up' && this.currentFrame.draftModal?.banishModeActive) {
        this.dispatch({ type: 'toggle_banish_mode' });
      }
    } else if (res.startPressed) {
      if (phase === 'paused') {
        this.dispatch({ type: 'toggle_pause' });
      }
    } else if (phase === 'level_up' || phase === 'arcana_select') {
      if (res.xPressed) {
        this.dispatch({ type: 'reroll_draft' });
      } else if (res.yPressed && phase === 'level_up') {
        const draft = this.currentFrame.draftModal;
        if (draft && (draft.banishModeActive || draft.banishesRemaining > 0)) {
          this.dispatch({ type: 'toggle_banish_mode' });
        } else if (draft && draft.skipsRemaining > 0) {
          this.dispatch({ type: 'skip_draft' });
        }
      }
    }

    if (this.menuNav.isActive() && this.currentFrame.phase !== 'playing') {
      this.menuNav.syncFocus(this.modalHost);
    }
  }

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

  private syncFrame(frame: RenderFrameState, alpha = 1): void {
    const prevPhase = this.lastSyncedPhase;
    this.currentFrame = frame;
    this.lastSyncedPhase = frame.phase;

    const isPlaying = frame.phase === 'playing';
    if (!isPlaying) {
      this.input.resetJoystick();
      if (prevPhase === 'playing') {
        this.menuNav.syncFromHardware();
      }
    } else if (prevPhase !== 'playing') {
      this.menuNav.clearFocus(false);
      this.input.syncGamepadPauseButton();
    }

    if (frame.audioCues.length > 0) {
      this.audio.playCues(frame.audioCues);
    }

    this.renderer.render(frame, alpha);
    this.renderer.setPaused(!isPlaying);
    const currentSettings = this.saveStore.getState().settings;
    this.hud.update(frame, this.audio.isMuted(), {
      showMinimap: currentSettings.showMinimap,
      mouseFollow: currentSettings.mouseFollow,
    });
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
              onSetAutoMode: (mode) => this.applyAutoLevelUpMode(mode),
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
            autoLevelUpMode: frame.hud.autoLevelUpMode,
            onUpdateSettings: (opts: Partial<AudioAndDisplaySettings>) => {
              this.saveStore.updateSettings(opts);
              const nextSettings = this.saveStore.getState().settings;
              this.audio.applySettings(nextSettings);
              this.input.setMouseFollow(Boolean(nextSettings.mouseFollow));
              this.renderer.setDisplayOptions({
                visualEffectsQuality: nextSettings.visualEffectsQuality,
                screenShakeEnabled: nextSettings.screenShake,
                showDamageNumbers: nextSettings.showDamageNumbers,
              });
              this.hud.update(this.currentFrame, this.audio.isMuted(), {
                showMinimap: nextSettings.showMinimap,
                mouseFollow: nextSettings.mouseFollow,
              });
            },
            onSetAutoLevelUp: (mode) => this.applyAutoLevelUpMode(mode, false),
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
              runMeta: {
                hyper: frame.hud.hyper,
                hurry: frame.hud.hurry,
                endless: frame.hud.endless,
                endlessCycle: frame.hud.endlessCycle,
                funMode: frame.hud.funMode,
              },
              onCue: (cue) => this.audio.playCue(cue),
              onRetryCasual: () => {
                this.audio.playCue({ type: 'ui_buy' });
                this.saveStore.setFunPreset('casual');
                if (this.onRestartBattle) {
                  this.onRestartBattle();
                } else {
                  this.onExitToMenu();
                }
              },
              onReturnMenu: () => this.exitToMenu(),
            }),
          );
        }
        break;
    }

    if (frame.phase !== 'playing' && this.menuNav.isActive()) {
      this.menuNav.syncFocus(this.modalHost);
    }
  }

  private clearActiveModal(): void {
    if (this.chestHandle) {
      this.chestHandle.dispose();
      this.chestHandle = null;
    }
    this.pauseHandle = null;
    this.menuNav.clearFocus(false);
    this.modalHost.replaceChildren();
  }

  private toggleMouseFollow(): void {
    const cur = Boolean(this.saveStore.getState().settings.mouseFollow);
    const next = !cur;
    this.saveStore.updateSettings({ mouseFollow: next });
    this.input.setMouseFollow(next);
    const settings = this.saveStore.getState().settings;
    this.hud.update(this.currentFrame, this.audio.isMuted(), {
      showMinimap: settings.showMinimap,
      mouseFollow: settings.mouseFollow,
    });
    this.audio.playCue({ type: 'ui_click' });
    this.hud.pushInfoToast(
      next ? '🖱️ 单手鼠标跟随：已开启' : '🖱️ 单手鼠标跟随：已关闭',
      next ? '移动鼠标即可单手走位，悬停在角色附近停步（按 F 切换）' : '已切回键盘 WASD / 摇杆控制',
    );
  }

  private applyAutoLevelUpMode(mode: AutoLevelUpMode, showToast = true): void {
    this.dispatch({ type: 'set_auto_level_up', mode });
    if (!showToast) return;
    if (mode === 'off') {
      this.hud.pushInfoToast('升级自动托管已关闭', '后续升级将恢复弹窗供你手动挑选（按 T 再次开启）');
    } else if (mode === 'gold_bag') {
      this.hud.pushInfoToast('🪙 自动托管：总是选择钱袋', '后续满级升级将自动拾取金币（按 T 或点右上胶囊关闭）');
    } else if (mode === 'roast_chicken') {
      this.hud.pushInfoToast('🍗 自动托管：总是选择烤鸡', '后续满级升级将自动回血续航（按 T 或点右上胶囊关闭）');
    } else {
      this.hud.pushInfoToast('⚡ 智能自动选牌：已开启', '优先超武共鸣与高阶强化；满级后自动回血/拿钱');
    }
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
    this.menuNav.clearFocus(true);
    this.input.detach();
    this.listeners.clear();
    this.renderer.destroy();
    this.audio.stopBgm();
  }
}
