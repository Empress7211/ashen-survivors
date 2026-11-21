import type {
  AchievementDef,
  Catalog,
  HudSnapshot,
  RenderFrameState,
} from '../contracts/index.ts';
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from '../core/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatClock, formatInt, iconUrl } from '../app/formatters.ts';

export interface BattleHudDeps {
  catalog: Catalog;
  isMuted: () => boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
}

export class BattleHudView {
  readonly element: HTMLElement;

  private readonly catalog: Catalog;
  private readonly xpFill: HTMLElement;
  private readonly lvBadge: HTMLElement;
  private readonly weaponStrip: HTMLElement;
  private readonly passiveStrip: HTMLElement;
  private readonly arcanaStrip: HTMLElement;
  private readonly bossBar: HTMLElement;
  private readonly bossIcon: HTMLImageElement;
  private readonly bossName: HTMLElement;
  private readonly bossHpText: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly modeTagsEl: HTMLElement;
  private readonly killsEl: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly enemyCountEl: HTMLElement;
  private readonly hpTextEl: HTMLElement;
  private readonly hpFillEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly toastStack: HTMLElement;

  private lastWeaponsKey = '';
  private lastPassivesKey = '';
  private lastArcanasKey = '';
  private lastModeKey = '';
  private lastBossId = '';
  private lastBossVisible = false;
  private lastBossHpText = '';
  private lastBossRatioKey = '';
  private lastXpRatioKey = '';
  private lastLevelText = '';
  private lastTimerText = '';
  private lastKillsText = '';
  private lastGoldText = '';
  private lastEnemyText = '';
  private lastHpRatioKey = '';
  private lastHpText = '';
  private lastMuted: boolean | null = null;
  private lastFpsText = '';

  constructor(deps: BattleHudDeps) {
    this.catalog = deps.catalog;

    this.xpFill = el('div', { className: 'hud-xp-fill' });
    this.lvBadge = el('div', {
      className: 'hud-lv-badge',
      dataset: { testid: 'hud-level' },
      text: 'Lv. 1',
    });

    this.weaponStrip = el('div', { className: 'hud-slot-strip', dataset: { testid: 'hud-weapons' } });
    this.passiveStrip = el('div', { className: 'hud-slot-strip', dataset: { testid: 'hud-passives' } });
    this.arcanaStrip = el('div', { className: 'hud-slot-strip', dataset: { testid: 'hud-arcanas' } });
    this.arcanaStrip.style.display = 'none';

    this.bossIcon = imgIcon(iconUrl('boss_giant_bat'), '首领');
    this.bossName = el('span', { text: '' });
    this.bossHpText = el('span', { className: 'num-font', text: '' });
    this.bossFill = el('div', { className: 'hud-boss-fill' });
    this.bossBar = el('div', {
      className: 'hud-boss-bar',
      dataset: { testid: 'hud-boss-bar' },
      children: [
        el('div', {
          className: 'hud-boss-head',
          children: [
            el('div', {
              className: 'hud-boss-head-left',
              children: [this.bossIcon, this.bossName],
            }),
            this.bossHpText,
          ],
        }),
        el('div', {
          className: 'hud-boss-track',
          children: [this.bossFill],
        }),
      ],
    });
    this.bossBar.style.display = 'none';

    this.timerEl = el('div', {
      className: 'hud-timer',
      dataset: { testid: 'hud-timer' },
      text: '00:00',
    });
    this.modeTagsEl = el('div', { className: 'title-meta-pills' });

    this.muteBtn = el('button', {
      className: 'hud-icon-btn',
      text: deps.isMuted() ? '🔇' : '🔊',
      attrs: { title: '静音开关', 'aria-label': '静音开关' },
      dataset: { testid: 'btn-hud-mute' },
      onClick: () => {
        deps.onToggleMute();
        const muted = deps.isMuted();
        this.lastMuted = muted;
        this.muteBtn.textContent = muted ? '🔇' : '🔊';
      },
    });

    const pauseBtn = el('button', {
      className: 'hud-icon-btn',
      text: '⏸',
      attrs: { title: '暂停 (Space / Esc)', 'aria-label': '暂停游戏' },
      dataset: { testid: 'btn-hud-pause' },
      onClick: () => deps.onTogglePause(),
    });

    this.killsEl = el('span', { text: '0' });
    this.goldEl = el('span', { text: '0' });
    this.enemyCountEl = el('span', { text: '0' });
    this.hpTextEl = el('span', { className: 'num-font', text: '100/100' });
    this.hpFillEl = el('div', { className: 'hud-hp-mini-fill' });
    this.fpsEl = el('span', {
      className: 'hud-fps-pill',
      dataset: { testid: 'hud-fps' },
      text: '60 FPS',
    });

    this.toastStack = el('div', { className: 'achievement-toast-stack' });

    this.element = el('div', {
      className: 'battle-hud',
      dataset: { testid: 'battle-hud' },
      children: [
        el('div', {
          className: 'hud-xp-bar-wrap',
          children: [this.xpFill, this.lvBadge],
        }),
        el('div', {
          className: 'hud-top-row',
          children: [
            el('div', {
              className: 'hud-slots-column',
              children: [this.weaponStrip, this.passiveStrip, this.arcanaStrip],
            }),
            el('div', {
              className: 'hud-center-column',
              children: [this.bossBar],
            }),
            el('div', {
              className: 'hud-right-column',
              children: [
                el('div', {
                  className: 'hud-clock-row',
                  children: [this.timerEl, this.muteBtn, pauseBtn],
                }),
                el('div', {
                  className: 'title-meta-pills',
                  children: [this.modeTagsEl, this.fpsEl],
                }),
                el('div', {
                  className: 'hud-counters-row',
                  children: [
                    el('span', {
                      className: 'hud-counter-item',
                      dataset: { testid: 'hud-kills' },
                      children: ['💀 ', this.killsEl],
                    }),
                    el('span', {
                      className: 'hud-counter-item',
                      dataset: { testid: 'hud-gold' },
                      children: [imgIcon(iconUrl('coin'), '金币'), this.goldEl],
                    }),
                    el('span', {
                      className: 'hud-counter-item',
                      dataset: { testid: 'hud-enemies' },
                      children: ['魔潮 ', this.enemyCountEl],
                    }),
                  ],
                }),
                el('div', {
                  className: 'hud-hp-pill',
                  dataset: { testid: 'hud-hp' },
                  children: [
                    el('span', { text: 'HP' }),
                    el('div', { className: 'hud-hp-mini-track', children: [this.hpFillEl] }),
                    this.hpTextEl,
                  ],
                }),
              ],
            }),
          ],
        }),
        this.toastStack,
      ],
    });
  }

  updateFps(fps: number): void {
    const rounded = Math.max(0, Math.round(fps));
    const text = `${rounded} FPS`;
    if (text !== this.lastFpsText) {
      this.lastFpsText = text;
      this.fpsEl.textContent = text;
    }
  }

  update(frame: RenderFrameState, muted: boolean): void {
    const { hud, bossBar } = frame;

    const xpRatio = hud.xpToNextLevel > 0 ? Math.max(0, Math.min(1, hud.xp / hud.xpToNextLevel)) : 0;
    const xpKey = xpRatio.toFixed(3);
    if (xpKey !== this.lastXpRatioKey) {
      this.lastXpRatioKey = xpKey;
      this.xpFill.style.transform = `scaleX(${xpKey})`;
    }

    const lvText = `Lv. ${hud.level}`;
    if (lvText !== this.lastLevelText) {
      this.lastLevelText = lvText;
      this.lvBadge.textContent = lvText;
    }

    const timerText = formatClock(hud.elapsedSeconds);
    if (timerText !== this.lastTimerText) {
      this.lastTimerText = timerText;
      this.timerEl.textContent = timerText;
    }

    const killsText = formatInt(hud.kills);
    if (killsText !== this.lastKillsText) {
      this.lastKillsText = killsText;
      this.killsEl.textContent = killsText;
    }

    const goldText = formatInt(hud.goldEarned);
    if (goldText !== this.lastGoldText) {
      this.lastGoldText = goldText;
      this.goldEl.textContent = goldText;
    }

    const enemyText = formatInt(hud.activeEnemyCount);
    if (enemyText !== this.lastEnemyText) {
      this.lastEnemyText = enemyText;
      this.enemyCountEl.textContent = enemyText;
    }

    const hpRatio = hud.maxHp > 0 ? Math.max(0, Math.min(1, hud.hp / hud.maxHp)) : 0;
    const hpKey = hpRatio.toFixed(3);
    if (hpKey !== this.lastHpRatioKey) {
      this.lastHpRatioKey = hpKey;
      this.hpFillEl.style.transform = `scaleX(${hpKey})`;
    }

    const hpText = `${Math.ceil(hud.hp)}/${Math.round(hud.maxHp)}`;
    if (hpText !== this.lastHpText) {
      this.lastHpText = hpText;
      this.hpTextEl.textContent = hpText;
    }

    if (muted !== this.lastMuted) {
      this.lastMuted = muted;
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
    }

    this.syncModeTags(hud);
    this.syncWeaponSlots(hud);
    this.syncPassiveSlots(hud);
    this.syncArcanaSlots(hud);

    if (bossBar) {
      if (!this.lastBossVisible) {
        this.lastBossVisible = true;
        this.bossBar.style.display = 'flex';
      }
      if (this.lastBossId !== bossBar.enemyId) {
        this.lastBossId = bossBar.enemyId;
        this.bossIcon.src = iconUrl(bossBar.enemyId);
        this.bossName.textContent = bossBar.name;
      }
      const bRatio = bossBar.maxHp > 0 ? Math.max(0, Math.min(1, bossBar.hp / bossBar.maxHp)) : 0;
      const bKey = bRatio.toFixed(3);
      if (bKey !== this.lastBossRatioKey) {
        this.lastBossRatioKey = bKey;
        this.bossFill.style.transform = `scaleX(${bKey})`;
      }
      const bText = `${formatInt(bossBar.hp)} / ${formatInt(bossBar.maxHp)}`;
      if (bText !== this.lastBossHpText) {
        this.lastBossHpText = bText;
        this.bossHpText.textContent = bText;
      }
    } else if (this.lastBossVisible) {
      this.lastBossVisible = false;
      this.bossBar.style.display = 'none';
    }
  }

  pushAchievementToast(ach: AchievementDef): void {
    const toast = el('div', {
      className: 'achievement-toast',
      dataset: { testid: `toast-achievement-${ach.id}` },
      children: [
        imgIcon(iconUrl('relic_grimoire'), ach.name, 'codex-icon'),
        el('div', {
          className: 'codex-info',
          children: [
            el('span', { className: 'tag-badge tag-badge-gold', text: '成就达成' }),
            el('span', { className: 'codex-name', text: ach.name }),
            el('span', { className: 'codex-desc', text: ach.description }),
          ],
        }),
      ],
    });
    this.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 4500);
  }

  private syncModeTags(hud: HudSnapshot): void {
    const key = `${hud.hyper}-${hud.hurry}-${hud.endless}-${hud.endlessCycle}`;
    if (key === this.lastModeKey) return;
    this.lastModeKey = key;
    this.modeTagsEl.replaceChildren();
    if (hud.hyper) this.modeTagsEl.appendChild(el('span', { className: 'tag-badge tag-badge-crimson', text: 'HYPER' }));
    if (hud.hurry) this.modeTagsEl.appendChild(el('span', { className: 'tag-badge tag-badge-gold', text: 'HURRY' }));
    if (hud.endless) {
      this.modeTagsEl.appendChild(
        el('span', {
          className: 'tag-badge tag-badge-arcana',
          text: hud.endlessCycle > 0 ? `无尽 +${hud.endlessCycle}` : '无尽模式',
        }),
      );
    }
  }

  private syncWeaponSlots(hud: HudSnapshot): void {
    const key = hud.weapons
      .map((w) => `${w.weaponId}:${w.level}:${w.limitBreakLevel}:${w.isEvolved ? 1 : 0}`)
      .join('|');
    if (key === this.lastWeaponsKey) return;
    this.lastWeaponsKey = key;
    this.weaponStrip.replaceChildren();

    const total = Math.max(MAX_WEAPON_SLOTS, hud.weapons.length);
    for (let i = 0; i < total; i++) {
      const slot = hud.weapons[i];
      if (!slot) {
        this.weaponStrip.appendChild(el('div', { className: 'hud-slot' }));
        continue;
      }
      const def = this.catalog.weapons[slot.weaponId];
      const pips = el('div', { className: 'hud-slot-pips' });
      for (let lv = 0; lv < slot.maxLevel; lv++) {
        pips.appendChild(el('span', { className: `hud-slot-pip ${lv < slot.level ? 'on' : ''}` }));
      }
      this.weaponStrip.appendChild(
        el('div', {
          className: `hud-slot filled ${slot.isEvolved ? 'evolved' : ''}`,
          attrs: { title: `${def.name} Lv.${slot.level}` },
          children: [
            imgIcon(iconUrl(slot.weaponId), def.name),
            pips,
            slot.limitBreakLevel > 0
              ? el('span', { className: 'hud-slot-lb', text: `+${slot.limitBreakLevel}` })
              : null,
          ],
        }),
      );
    }
  }

  private syncPassiveSlots(hud: HudSnapshot): void {
    const key = hud.passives.map((p) => `${p.passiveId}:${p.level}`).join('|');
    if (key === this.lastPassivesKey) return;
    this.lastPassivesKey = key;
    this.passiveStrip.replaceChildren();

    const total = Math.max(MAX_PASSIVE_SLOTS, hud.passives.length);
    for (let i = 0; i < total; i++) {
      const slot = hud.passives[i];
      if (!slot) {
        this.passiveStrip.appendChild(el('div', { className: 'hud-slot' }));
        continue;
      }
      const def = this.catalog.passives[slot.passiveId];
      const pips = el('div', { className: 'hud-slot-pips' });
      for (let lv = 0; lv < slot.maxLevel; lv++) {
        pips.appendChild(el('span', { className: `hud-slot-pip ${lv < slot.level ? 'on' : ''}` }));
      }
      this.passiveStrip.appendChild(
        el('div', {
          className: 'hud-slot filled',
          attrs: { title: `${def.name} Lv.${slot.level}` },
          children: [imgIcon(iconUrl(slot.passiveId), def.name), pips],
        }),
      );
    }
  }

  private syncArcanaSlots(hud: HudSnapshot): void {
    const key = hud.arcanas.join('|');
    if (key === this.lastArcanasKey) return;
    this.lastArcanasKey = key;
    this.arcanaStrip.replaceChildren();
    if (hud.arcanas.length === 0) {
      this.arcanaStrip.style.display = 'none';
      return;
    }
    this.arcanaStrip.style.display = 'flex';
    for (const aId of hud.arcanas) {
      const def = this.catalog.arcanas[aId];
      this.arcanaStrip.appendChild(
        el('div', {
          className: 'hud-slot filled',
          attrs: { title: `${def.roman} · ${def.name}` },
          children: [imgIcon(iconUrl(aId), def.name)],
        }),
      );
    }
  }
}
