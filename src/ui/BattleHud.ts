import type {
  AchievementDef,
  ArcanaId,
  AutoLevelUpMode,
  Catalog,
  HudSnapshot,
  PassiveSlotSnapshot,
  RenderFrameState,
  WeaponSlotSnapshot,
} from '../contracts/index.ts';
import {
  MAX_PASSIVE_SLOTS,
  MAX_WEAPON_SLOTS,
  formatFunModeBadge,
} from '../core/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatClock, formatInt, iconUrl } from '../app/formatters.ts';

const MINIMAP_W = 118;
const MINIMAP_H = 84;
const MINIMAP_DPR = 2;
const MINIMAP_RANGE_WORLD = 1350;
const MINIMAP_TICK_INTERVAL = 6;

export interface SlotTooltipData {
  name: string;
  badgeText: string;
  badgeVariant?: 'gold' | 'crimson' | 'arcana' | 'emerald';
  description: string;
  detailLine?: string;
  synergyLine?: string;
  synergyReady?: boolean;
}

export function buildWeaponTooltipData(
  slot: WeaponSlotSnapshot,
  hud: Pick<HudSnapshot, 'weapons' | 'passives'>,
  catalog: Catalog,
): SlotTooltipData {
  const def = catalog.weapons[slot.weaponId];
  const heldWeaponIds = new Set(hud.weapons.map((w) => w.weaponId));
  const heldPassiveIds = new Set(hud.passives.map((p) => p.passiveId));

  const badgeText = slot.isEvolved
    ? slot.limitBreakLevel > 0
      ? `超武 · 突破 +${slot.limitBreakLevel}`
      : '超武觉醒'
    : slot.limitBreakLevel > 0
      ? `Lv.${slot.level}/${slot.maxLevel} · 突破 +${slot.limitBreakLevel}`
      : `Lv.${slot.level}/${slot.maxLevel}`;

  const levelNote = def.levels[Math.max(0, slot.level - 1)]?.description;
  const detailLine =
    slot.limitBreakLevel > 0
      ? `极限突破 +${slot.limitBreakLevel}（持续强化伤害、范围、冷却与投射量）`
      : levelNote
        ? `当前等级：${levelNote}`
        : undefined;

  let synergyLine: string | undefined;
  let synergyReady = false;

  if (def.isEvolved && def.evolutionRecipe) {
    const baseName = catalog.weapons[def.evolutionRecipe.baseWeapon].name;
    const partnerName = def.evolutionRecipe.partnerWeapon
      ? catalog.weapons[def.evolutionRecipe.partnerWeapon].name
      : def.evolutionRecipe.requiredPassive
        ? catalog.passives[def.evolutionRecipe.requiredPassive].name
        : '';
    synergyLine = partnerName
      ? `超武进化由来：${baseName} + ${partnerName}`
      : `超武进化由来：${baseName}`;
    synergyReady = true;
  } else {
    const recipe = catalog.evolutions.find(
      (r) => r.baseWeapon === slot.weaponId || r.partnerWeapon === slot.weaponId,
    );
    if (recipe) {
      const evolvedName = catalog.weapons[recipe.evolvedId].name;
      if (recipe.partnerWeapon) {
        const otherWeaponId =
          recipe.baseWeapon === slot.weaponId ? recipe.partnerWeapon : recipe.baseWeapon;
        const partnerOwned = heldWeaponIds.has(otherWeaponId);
        synergyReady = partnerOwned;
        synergyLine = `联合进化：搭配「${catalog.weapons[otherWeaponId].name}」${partnerOwned ? '（已持有）' : '（未持有）'} → ${evolvedName}`;
      } else if (recipe.requiredPassive) {
        const partnerOwned = heldPassiveIds.has(recipe.requiredPassive);
        synergyReady = partnerOwned;
        synergyLine = `进化配方：搭配「${catalog.passives[recipe.requiredPassive].name}」${partnerOwned ? '（已持有）' : '（未持有）'} → ${evolvedName}`;
      }
    }
  }

  return {
    name: def.name,
    badgeText,
    badgeVariant: slot.isEvolved ? 'crimson' : 'gold',
    description: def.description,
    detailLine,
    synergyLine,
    synergyReady,
  };
}

export function buildPassiveTooltipData(
  slot: PassiveSlotSnapshot,
  hud: Pick<HudSnapshot, 'weapons'>,
  catalog: Catalog,
): SlotTooltipData {
  const def = catalog.passives[slot.passiveId];
  const heldWeaponIds = new Set(hud.weapons.map((w) => w.weaponId));
  const rankNote = def.levelDescriptions[Math.max(0, slot.level - 1)];

  const recipes = catalog.evolutions.filter((r) => r.requiredPassive === slot.passiveId);
  let synergyLine: string | undefined;
  let synergyReady = false;
  if (recipes.length > 0) {
    const ownedMatch = recipes.find((r) => heldWeaponIds.has(r.baseWeapon));
    synergyReady = Boolean(ownedMatch);
    const parts = recipes.map((r) => {
      const baseName = catalog.weapons[r.baseWeapon].name;
      const evoName = catalog.weapons[r.evolvedId].name;
      return `${baseName}→${evoName}`;
    });
    synergyLine = `进化共鸣：${parts.join(' / ')}${synergyReady ? '（基础武器已持有）' : ''}`;
  }

  return {
    name: def.name,
    badgeText: `Lv.${slot.level}/${slot.maxLevel}`,
    badgeVariant: 'emerald',
    description: def.description,
    detailLine: rankNote ? `当前效果：${rankNote}` : undefined,
    synergyLine,
    synergyReady,
  };
}

export function buildArcanaTooltipData(
  arcanaId: ArcanaId,
  catalog: Catalog,
): SlotTooltipData {
  const def = catalog.arcanas[arcanaId];
  const synergyItems = [
    ...def.affectedWeapons.map((id) => catalog.weapons[id].name),
    ...def.affectedPassives.map((id) => catalog.passives[id].name),
  ];

  return {
    name: `${def.roman} · ${def.name}`,
    badgeText: '秘法塔罗',
    badgeVariant: 'arcana',
    description: def.description,
    synergyLine:
      synergyItems.length > 0 ? `强化共鸣：${synergyItems.join('、')}` : undefined,
    synergyReady: synergyItems.length > 0,
  };
}

export function formatTooltipPlainText(data: SlotTooltipData): string {
  const lines = [`${data.name} (${data.badgeText})`, data.description];
  if (data.detailLine) lines.push(data.detailLine);
  if (data.synergyLine) lines.push(data.synergyLine);
  return lines.join('\n');
}

export function createSlotTooltipElement(data: SlotTooltipData): HTMLElement {
  const badgeClass = data.badgeVariant ? `tag-badge-${data.badgeVariant}` : 'tag-badge-gold';
  return el('div', {
    className: 'hud-slot-tooltip',
    attrs: { role: 'tooltip' },
    children: [
      el('div', {
        className: 'hud-slot-tooltip-head',
        children: [
          el('strong', { className: 'hud-slot-tooltip-title', text: data.name }),
          el('span', { className: `tag-badge ${badgeClass}`, text: data.badgeText }),
        ],
      }),
      el('p', { className: 'hud-slot-tooltip-desc', text: data.description }),
      data.detailLine
        ? el('p', { className: 'hud-slot-tooltip-detail', text: data.detailLine })
        : null,
      data.synergyLine
        ? el('p', {
            className: `hud-slot-tooltip-synergy ${data.synergyReady ? 'ready' : ''}`,
            text: data.synergyLine,
          })
        : null,
    ],
  });
}

export interface BattleHudDeps {
  catalog: Catalog;
  isMuted: () => boolean;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onToggleMouseFollow?: () => void;
  onDisableAutoLevelUp?: () => void;
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
  private readonly autoLevelPill: HTMLButtonElement;
  private readonly killsEl: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly enemyCountEl: HTMLElement;
  private readonly hpTextEl: HTMLElement;
  private readonly hpFillEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly mouseFollowBtn: HTMLButtonElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly toastStack: HTMLElement;
  private readonly minimapWrap: HTMLElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly minimapBadge: HTMLElement;

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
  private lastMouseFollow: boolean | null = null;
  private lastAutoMode: AutoLevelUpMode | null = null;
  private lastFpsText = '';
  private lastMinimapTick = -1;
  private lastShowMinimap: boolean | null = null;
  private lastHasMapBadge: boolean | null = null;

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
    this.autoLevelPill = el('button', {
      className: 'hud-auto-pill',
      text: '⚡ 自动选牌中 [T]',
      attrs: {
        title: '正在自动托管升级，点击或按 T 恢复手动选牌',
        'aria-label': '关闭升级自动托管',
      },
      dataset: { testid: 'btn-hud-auto-level' },
      onClick: () => deps.onDisableAutoLevelUp?.(),
    });
    this.autoLevelPill.style.display = 'none';

    this.mouseFollowBtn = el('button', {
      className: 'hud-icon-btn',
      text: '🖱️',
      attrs: {
        title: '单手鼠标跟随移动 [F]',
        'aria-label': '单手鼠标跟随开关',
        'aria-pressed': 'false',
      },
      dataset: { testid: 'btn-hud-mouse-follow' },
      onClick: () => deps.onToggleMouseFollow?.(),
    });

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

    this.minimapCanvas = el('canvas', {
      className: 'hud-minimap-canvas',
      attrs: {
        width: MINIMAP_W * MINIMAP_DPR,
        height: MINIMAP_H * MINIMAP_DPR,
        'aria-label': '战场实时小雷达',
      },
    }) as HTMLCanvasElement;
    this.minimapBadge = el('span', {
      className: 'hud-minimap-badge',
      text: '雷达',
    });
    this.minimapWrap = el('div', {
      className: 'hud-minimap-wrap',
      dataset: { testid: 'hud-minimap' },
      children: [this.minimapCanvas, this.minimapBadge],
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
                  children: [this.timerEl, this.mouseFollowBtn, this.muteBtn, pauseBtn],
                }),
                el('div', {
                  className: 'title-meta-pills',
                  children: [this.autoLevelPill, this.modeTagsEl, this.fpsEl],
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
                this.minimapWrap,
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

  update(
    frame: RenderFrameState,
    muted: boolean,
    options?: boolean | { showMinimap?: boolean; mouseFollow?: boolean },
  ): void {
    const { hud, bossBar } = frame;
    const showMinimap =
      typeof options === 'boolean' ? options : options?.showMinimap ?? true;
    const mouseFollow =
      typeof options === 'boolean' ? false : options?.mouseFollow ?? false;

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

    if (mouseFollow !== this.lastMouseFollow) {
      this.lastMouseFollow = mouseFollow;
      this.mouseFollowBtn.classList.toggle('active', mouseFollow);
      this.mouseFollowBtn.setAttribute('aria-pressed', mouseFollow ? 'true' : 'false');
    }

    const autoMode: AutoLevelUpMode = hud.autoLevelUpMode ?? 'off';
    if (autoMode !== this.lastAutoMode) {
      this.lastAutoMode = autoMode;
      if (autoMode === 'off') {
        this.autoLevelPill.style.display = 'none';
      } else {
        this.autoLevelPill.style.display = 'inline-flex';
        this.autoLevelPill.textContent =
          autoMode === 'gold_bag'
            ? '🪙 自动拿钱袋 [T]'
            : autoMode === 'roast_chicken'
              ? '🍗 自动吃烤鸡 [T]'
              : '⚡ 自动选牌中 [T]';
      }
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

    const minimapVisChanged = showMinimap !== this.lastShowMinimap;
    if (minimapVisChanged) {
      this.lastShowMinimap = showMinimap;
      this.minimapWrap.style.display = showMinimap ? 'block' : 'none';
    }
    if (showMinimap) {
      const tick = frame.tick;
      if (
        minimapVisChanged ||
        this.lastMinimapTick < 0 ||
        tick < this.lastMinimapTick ||
        tick - this.lastMinimapTick >= MINIMAP_TICK_INTERVAL
      ) {
        this.lastMinimapTick = tick;
        this.renderMinimap(frame);
      }
    }
  }

  private renderMinimap(frame: RenderFrameState): void {
    const hasMap = Boolean(frame.hud.hasMilkyWayMap);
    const mapMarkers = frame.hud.mapMarkers;
    if (hasMap !== this.lastHasMapBadge) {
      this.lastHasMapBadge = hasMap;
      this.minimapWrap.classList.toggle('has-map', hasMap);
      this.minimapBadge.textContent = hasMap ? '银河地图' : '雷达';
    }

    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = this.minimapCanvas.getContext('2d');
    } catch {
      return;
    }
    if (!ctx) return;

    ctx.setTransform(MINIMAP_DPR, 0, 0, MINIMAP_DPR, 0, 0);
    ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);

    // Dark obsidian backdrop
    ctx.fillStyle = '#09070e';
    ctx.fillRect(0, 0, MINIMAP_W, MINIMAP_H);

    const cx = MINIMAP_W / 2;
    const cy = MINIMAP_H / 2;
    const px = frame.player.x;
    const py = frame.player.y;
    const scale = (cx - 6) / MINIMAP_RANGE_WORLD;

    // Subtle gothic radar grid
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.12)';
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, MINIMAP_H);
    ctx.moveTo(0, cy);
    ctx.lineTo(MINIMAP_W, cy);
    ctx.stroke();

    // Corridor walls
    if (frame.corridorBounds) {
      const b = frame.corridorBounds;
      const x1 = b.minX !== undefined ? cx + (b.minX - px) * scale : -8;
      const x2 = b.maxX !== undefined ? cx + (b.maxX - px) * scale : MINIMAP_W + 8;
      const y1 = b.minY !== undefined ? cy + (b.minY - py) * scale : -8;
      const y2 = b.maxY !== undefined ? cy + (b.maxY - py) * scale : MINIMAP_H + 8;
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x1, y1, Math.max(4, x2 - x1), Math.max(4, y2 - y1));
      ctx.setLineDash([]);
    }

    const drawDot = (wx: number, wy: number, color: string, radius: number): void => {
      const sx = Math.max(4, Math.min(MINIMAP_W - 4, cx + (wx - px) * scale));
      const sy = Math.max(4, Math.min(MINIMAP_H - 4, cy + (wy - py) * scale));
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 0.9;
      ctx.strokeStyle = '#09070e';
      ctx.stroke();
    };

    // Relics, ground passives, and chests (via hud.mapMarkers when provided, or frame.pickups when hasMilkyWayMap is active)
    if (mapMarkers && mapMarkers.length > 0) {
      for (let i = 0; i < mapMarkers.length; i++) {
        const m = mapMarkers[i]!;
        if (m.kind === 'player') continue;
        const color =
          m.kind === 'relic' ? '#b48cff' : m.kind === 'passive' ? '#60e3aa' : '#f4d87d';
        drawDot(m.x, m.y, color, m.kind === 'relic' ? 2.6 : 2.2);
      }
    } else if (hasMap) {
      for (let i = 0; i < frame.pickups.length; i++) {
        const p = frame.pickups[i]!;
        if (p.kind === 'relic') {
          drawDot(p.x, p.y, '#b48cff', 2.6);
        } else if (p.kind === 'passive') {
          drawDot(p.x, p.y, '#60e3aa', 2.2);
        } else if (p.kind === 'pickup' && p.itemId.startsWith('chest_')) {
          drawDot(p.x, p.y, '#f4d87d', 2.2);
        }
      }
    }

    // Live bosses / reapers
    for (let i = 0; i < frame.enemies.length; i++) {
      const e = frame.enemies[i]!;
      if (!e.isBoss && !e.isReaper) continue;
      drawDot(e.x, e.y, '#ff4d5a', e.isReaper ? 3.1 : 2.6);
    }

    // Player center dot & reticle
    ctx.beginPath();
    ctx.arc(cx, cy, 4.6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, 2.3, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
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

  pushInfoToast(title: string, subtitle?: string): void {
    while (this.toastStack.children.length >= 2) {
      this.toastStack.firstElementChild?.remove();
    }
    const toast = el('div', {
      className: 'achievement-toast info-toast',
      children: [
        el('div', {
          className: 'codex-info',
          children: [
            el('span', { className: 'codex-name', text: title }),
            subtitle ? el('span', { className: 'codex-desc', text: subtitle }) : null,
          ],
        }),
      ],
    });
    this.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.remove();
    }, 2200);
  }

  private syncModeTags(hud: HudSnapshot): void {
    const funKey = hud.funMode?.preset ?? 'standard';
    const key = `${hud.hyper}-${hud.hurry}-${hud.endless}-${hud.endlessCycle}-${funKey}`;
    if (key === this.lastModeKey) return;
    this.lastModeKey = key;
    this.modeTagsEl.replaceChildren();
    if (hud.funMode && hud.funMode.preset !== 'standard') {
      const badge = formatFunModeBadge(hud.funMode);
      this.modeTagsEl.appendChild(
        el('span', { className: `tag-badge tag-badge-${badge.tone}`, text: badge.label }),
      );
    }
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
    const weaponPart = hud.weapons
      .map((w) => `${w.weaponId}:${w.level}:${w.limitBreakLevel}:${w.isEvolved ? 1 : 0}`)
      .join('|');
    const passivePart = hud.passives.map((p) => p.passiveId).join(',');
    const key = `${weaponPart}::${passivePart}`;
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
      const tooltipData = buildWeaponTooltipData(slot, hud, this.catalog);
      const pips = el('div', { className: 'hud-slot-pips' });
      for (let lv = 0; lv < slot.maxLevel; lv++) {
        pips.appendChild(el('span', { className: `hud-slot-pip ${lv < slot.level ? 'on' : ''}` }));
      }
      this.weaponStrip.appendChild(
        el('div', {
          className: `hud-slot filled ${slot.isEvolved ? 'evolved' : ''}`,
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tooltipData),
            'aria-label': `${def.name} ${tooltipData.badgeText}`,
          },
          children: [
            imgIcon(iconUrl(slot.weaponId), def.name),
            pips,
            slot.limitBreakLevel > 0
              ? el('span', { className: 'hud-slot-lb', text: `+${slot.limitBreakLevel}` })
              : null,
            createSlotTooltipElement(tooltipData),
          ],
        }),
      );
    }
  }

  private syncPassiveSlots(hud: HudSnapshot): void {
    const passivePart = hud.passives.map((p) => `${p.passiveId}:${p.level}`).join('|');
    const weaponPart = hud.weapons.map((w) => w.weaponId).join(',');
    const key = `${passivePart}::${weaponPart}`;
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
      const tooltipData = buildPassiveTooltipData(slot, hud, this.catalog);
      const pips = el('div', { className: 'hud-slot-pips' });
      for (let lv = 0; lv < slot.maxLevel; lv++) {
        pips.appendChild(el('span', { className: `hud-slot-pip ${lv < slot.level ? 'on' : ''}` }));
      }
      this.passiveStrip.appendChild(
        el('div', {
          className: 'hud-slot filled',
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tooltipData),
            'aria-label': `${def.name} ${tooltipData.badgeText}`,
          },
          children: [
            imgIcon(iconUrl(slot.passiveId), def.name),
            pips,
            createSlotTooltipElement(tooltipData),
          ],
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
      const tooltipData = buildArcanaTooltipData(aId, this.catalog);
      this.arcanaStrip.appendChild(
        el('div', {
          className: 'hud-slot filled',
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tooltipData),
            'aria-label': `${def.roman} ${def.name}`,
          },
          children: [
            imgIcon(iconUrl(aId), def.name),
            createSlotTooltipElement(tooltipData),
          ],
        }),
      );
    }
  }
}
