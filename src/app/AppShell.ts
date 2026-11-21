import type { AudioCue, Catalog } from '../contracts/index.ts';
import { AudioEngine } from '../audio/AudioEngine.ts';
import { SaveStore } from '../core/index.ts';
import { CATALOG } from '../data/index.ts';
import { ListenerBag } from './dom.ts';
import { BattleController } from './BattleController.ts';
import { renderAchievementsModal } from '../ui/AchievementsModal.ts';
import { renderBestiaryModal } from '../ui/BestiaryModal.ts';
import { renderCollectionModal } from '../ui/CollectionModal.ts';
import { renderHeroSelectScreen } from '../ui/HeroSelectScreen.ts';
import { renderPowerUpScreen } from '../ui/PowerUpScreen.ts';
import { renderSettingsModal } from '../ui/SettingsModal.ts';
import { renderStageSelectScreen } from '../ui/StageSelectScreen.ts';
import { renderTitleScreen } from '../ui/TitleScreen.ts';

type MenuScreenId = 'title' | 'hero_select' | 'stage_select' | 'powerups' | 'battle';

export class AppShell {
  readonly catalog: Catalog;
  readonly saveStore: SaveStore;
  readonly audio: AudioEngine;

  private readonly root: HTMLElement;
  private readonly listeners = new ListenerBag();
  private screen: MenuScreenId = 'title';
  private screenEl: HTMLElement | null = null;
  private overlayEl: HTMLElement | null = null;
  private battleController: BattleController | null = null;
  private audioUnlocked = false;

  constructor(root: HTMLElement, catalog: Catalog = CATALOG) {
    this.root = root;
    this.root.className = 'app-root';
    this.catalog = catalog;
    this.saveStore = new SaveStore(catalog);
    this.audio = new AudioEngine();
    this.audio.applySettings(this.saveStore.getState().settings);

    this.bindGlobalEvents();
    this.renderScreen('title');
    this.scheduleAssetPrefetch();
  }

  private scheduleAssetPrefetch(): void {
    const warm = (): void => {
      const urls = [
        '/assets/atlases/entities.png',
        '/assets/atlases/entities.json',
        '/assets/atlases/vfx.png',
        '/assets/atlases/vfx.json',
        '/assets/atlases/world.png',
        '/assets/atlases/world.json',
        '/assets/stages/mad_forest.jpg',
      ];
      for (const url of urls) {
        void fetch(url).catch(() => undefined);
      }
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    if (typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(warm, { timeout: 1200 });
    } else {
      window.setTimeout(warm, 200);
    }
  }

  private bindGlobalEvents(): void {
    const unlockOnce = (): void => {
      if (!this.audioUnlocked) {
        this.audioUnlocked = true;
        void this.audio.unlock().then(() => {
          if (this.screen !== 'battle' && !this.audio.getCurrentStageBgm()) {
            this.audio.startBgm('title');
          }
        });
      } else if (this.screen !== 'battle' && !this.audio.getCurrentStageBgm()) {
        this.audio.startBgm('title');
      }
    };

    this.listeners.on(window, 'pointerdown', unlockOnce, { passive: true });
    this.listeners.on(window, 'keydown', (ev) => {
      unlockOnce();
      if (ev.code === 'Escape' && this.screen !== 'battle') {
        if (this.overlayEl) {
          this.closeOverlay();
        } else if (this.screen === 'stage_select') {
          this.renderScreen('hero_select');
        } else if (this.screen === 'hero_select' || this.screen === 'powerups') {
          this.renderScreen('title');
        }
      }
    });
  }

  private playCue = (cue: AudioCue): void => {
    this.audio.playCue(cue);
  };

  private renderScreen(next: MenuScreenId): void {
    this.closeOverlay();
    if (this.battleController) {
      this.battleController.destroy();
      this.battleController = null;
    }

    this.screen = next;
    this.root.replaceChildren();

    if (next !== 'battle') {
      if (this.audioUnlocked && this.audio.getCurrentStageBgm() !== 'title') {
        this.audio.startBgm('title');
      }
    }

    switch (next) {
      case 'title':
        this.screenEl = this.buildTitleScreenElement();
        this.root.appendChild(this.screenEl);
        break;

      case 'hero_select':
        this.screenEl = renderHeroSelectScreen({
          catalog: this.catalog,
          saveStore: this.saveStore,
          onBack: () => this.renderScreen('title'),
          onProceedStage: () => this.renderScreen('stage_select'),
          onCue: this.playCue,
        });
        this.root.appendChild(this.screenEl);
        break;

      case 'stage_select':
        this.screenEl = renderStageSelectScreen({
          catalog: this.catalog,
          saveStore: this.saveStore,
          onBackToHeroes: () => this.renderScreen('hero_select'),
          onStartBattle: () => this.renderScreen('battle'),
          onCue: this.playCue,
        });
        this.root.appendChild(this.screenEl);
        break;

      case 'powerups':
        this.screenEl = renderPowerUpScreen({
          catalog: this.catalog,
          saveStore: this.saveStore,
          onBack: () => this.renderScreen('title'),
          onCue: this.playCue,
        });
        this.root.appendChild(this.screenEl);
        break;

      case 'battle': {
        const container = document.createElement('div');
        container.className = 'battle-screen';
        container.dataset.testid = 'screen-battle';
        this.screenEl = container;
        this.root.appendChild(container);

        this.battleController = new BattleController({
          container,
          catalog: this.catalog,
          saveStore: this.saveStore,
          audio: this.audio,
          onExitToMenu: () => this.renderScreen('title'),
        });
        this.battleController.start();
        break;
      }
    }
  }

  private openOverlay(el: HTMLElement): void {
    this.closeOverlay();
    this.overlayEl = el;
    this.root.appendChild(el);
  }

  private closeOverlay(): void {
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
  }

  private openCollectionOverlay(): void {
    this.openOverlay(
      renderCollectionModal({
        catalog: this.catalog,
        saveState: this.saveStore.getState(),
        onClose: () => this.closeOverlay(),
        onCue: this.playCue,
      }),
    );
  }

  private openBestiaryOverlay(): void {
    this.openOverlay(
      renderBestiaryModal({
        catalog: this.catalog,
        saveState: this.saveStore.getState(),
        onClose: () => this.closeOverlay(),
        onCue: this.playCue,
      }),
    );
  }

  private openAchievementsOverlay(): void {
    this.openOverlay(
      renderAchievementsModal({
        catalog: this.catalog,
        saveState: this.saveStore.getState(),
        onClose: () => this.closeOverlay(),
        onCue: this.playCue,
      }),
    );
  }

  private buildTitleScreenElement(): HTMLElement {
    return renderTitleScreen({
      saveState: this.saveStore.getState(),
      onStartHunt: () => this.renderScreen('hero_select'),
      onOpenPowerUps: () => this.renderScreen('powerups'),
      onOpenCollection: () => this.openCollectionOverlay(),
      onOpenBestiary: () => this.openBestiaryOverlay(),
      onOpenAchievements: () => this.openAchievementsOverlay(),
      onOpenSettings: () => this.openSettingsOverlay(),
      onCue: this.playCue,
    });
  }

  private refreshTitleInPlace(): void {
    if (this.screen !== 'title') return;
    const nextTitle = this.buildTitleScreenElement();
    if (this.screenEl && this.screenEl.parentNode === this.root) {
      this.screenEl.replaceWith(nextTitle);
    } else {
      this.root.prepend(nextTitle);
    }
    this.screenEl = nextTitle;
  }

  private openSettingsOverlay(): void {
    this.openOverlay(
      renderSettingsModal({
        saveStore: this.saveStore,
        onSettingsChanged: () => {
          this.audio.applySettings(this.saveStore.getState().settings);
        },
        onSaveChanged: () => {
          this.refreshTitleInPlace();
        },
        onClose: () => this.closeOverlay(),
        onCue: this.playCue,
      }),
    );
  }

  dispose(): void {
    this.listeners.clear();
    if (this.battleController) {
      this.battleController.destroy();
      this.battleController = null;
    }
    this.audio.dispose();
  }
}
