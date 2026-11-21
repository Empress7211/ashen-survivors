import type {
  AudioAndDisplaySettings,
  Catalog,
  PassiveId,
  PauseSnapshot,
  RenderFrameState,
  WeaponId,
} from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatStatDisplayList, iconUrl } from '../app/formatters.ts';
import {
  buildArcanaTooltipData,
  buildPassiveTooltipData,
  buildWeaponTooltipData,
  createSlotTooltipElement,
  formatTooltipPlainText,
  type SlotTooltipData,
} from './BattleHud.ts';

export interface PauseModalDeps {
  catalog: Catalog;
  frame: RenderFrameState;
  pause: PauseSnapshot;
  settings: AudioAndDisplaySettings;
  onUpdateSettings: (opts: Partial<AudioAndDisplaySettings>) => void;
  onResume: () => void;
  onRetire: () => void;
}

export interface PauseModalHandle {
  element: HTMLElement;
  focusSection: (section: 'grimoire' | 'map') => void;
}

function buildMinimapSvg(frame: RenderFrameState, pause: PauseSnapshot): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-1600 -1000 3200 2000');
  svg.setAttribute('class', 'minimap-svg');

  const px = frame.player.x;
  const py = frame.player.y;

  // Grid lines centered near player
  const grid = document.createElementNS(ns, 'g');
  grid.setAttribute('stroke', 'rgba(212, 175, 55, 0.11)');
  grid.setAttribute('stroke-width', '8');
  for (let gx = -1200; gx <= 1200; gx += 400) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', String(gx));
    l.setAttribute('y1', '-1000');
    l.setAttribute('x2', String(gx));
    l.setAttribute('y2', '1000');
    grid.appendChild(l);
  }
  for (let gy = -800; gy <= 800; gy += 400) {
    const l = document.createElementNS(ns, 'line');
    l.setAttribute('x1', '-1600');
    l.setAttribute('y1', String(gy));
    l.setAttribute('x2', '1600');
    l.setAttribute('y2', String(gy));
    grid.appendChild(l);
  }
  svg.appendChild(grid);

  // Corridor boundary preview relative to player
  if (frame.corridorBounds) {
    const b = frame.corridorBounds;
    const rect = document.createElementNS(ns, 'rect');
    const minX = b.minX !== undefined ? b.minX - px : -1580;
    const maxX = b.maxX !== undefined ? b.maxX - px : 1580;
    const minY = b.minY !== undefined ? b.minY - py : -980;
    const maxY = b.maxY !== undefined ? b.maxY - py : 980;
    rect.setAttribute('x', String(minX));
    rect.setAttribute('y', String(minY));
    rect.setAttribute('width', String(Math.max(40, maxX - minX)));
    rect.setAttribute('height', String(Math.max(40, maxY - minY)));
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'rgba(212, 175, 55, 0.45)');
    rect.setAttribute('stroke-width', '14');
    rect.setAttribute('stroke-dasharray', '32 18');
    svg.appendChild(rect);
  }

  // Determine scale so distant relics fit inside viewBox cleanly
  let maxDist = 1100;
  for (const m of pause.mapMarkers) {
    maxDist = Math.max(maxDist, Math.abs(m.x - px) * 1.15, Math.abs(m.y - py) * 1.45);
  }
  const scale = 1450 / maxDist;

  const addDot = (
    x: number,
    y: number,
    color: string,
    radius: number,
    label?: string,
  ): void => {
    const sx = Math.max(-1500, Math.min(1500, (x - px) * scale));
    const sy = Math.max(-920, Math.min(920, (y - py) * scale));
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', String(sx));
    c.setAttribute('cy', String(sy));
    c.setAttribute('r', String(radius));
    c.setAttribute('fill', color);
    c.setAttribute('stroke', '#0a090d');
    c.setAttribute('stroke-width', '8');
    svg.appendChild(c);

    if (label) {
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(sx));
      t.setAttribute('y', String(sy - radius - 14));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', color);
      t.setAttribute('font-size', '62');
      t.setAttribute('font-weight', '700');
      t.textContent = label;
      svg.appendChild(t);
    }
  };

  // Markers from PauseSnapshot
  for (const m of pause.mapMarkers) {
    if (m.kind === 'player') continue;
    const color =
      m.kind === 'relic' ? '#b48cff' : m.kind === 'passive' ? '#60e3aa' : '#f4d87d';
    addDot(m.x, m.y, color, 42, m.label);
  }

  // Active bosses from live frame
  for (const e of frame.enemies) {
    if (!e.isBoss) continue;
    addDot(e.x, e.y, '#ff4d5a', 46, e.isReaper ? '死神' : '首领');
  }

  // Player center reticle
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('cx', '0');
  ring.setAttribute('cy', '0');
  ring.setAttribute('r', '76');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'rgba(255, 255, 255, 0.45)');
  ring.setAttribute('stroke-width', '10');
  svg.appendChild(ring);
  addDot(px, py, '#ffffff', 44, '你');

  return svg;
}

export function renderPauseModal(deps: PauseModalDeps): PauseModalHandle {
  const { catalog, frame, pause, settings } = deps;
  const heldWeaponMap = new Map(pause.weapons.map((w) => [w.weaponId, w]));
  const heldPassiveMap = new Map(pause.passives.map((p) => [p.passiveId, p]));
  const heldWeaponIds = new Set(pause.weapons.map((w) => w.weaponId));
  const heldPassiveIds = new Set(pause.passives.map((p) => p.passiveId));

  const buildPreviewWeaponTooltip = (weaponId: WeaponId): SlotTooltipData => {
    const held = heldWeaponMap.get(weaponId);
    if (held) {
      return buildWeaponTooltipData(held, pause, catalog);
    }
    const def = catalog.weapons[weaponId];
    return buildWeaponTooltipData(
      {
        weaponId,
        level: 0,
        maxLevel: def.maxLevel,
        isEvolved: def.isEvolved,
        limitBreakLevel: 0,
      },
      pause,
      catalog,
    );
  };

  const buildPreviewPassiveTooltip = (passiveId: PassiveId): SlotTooltipData => {
    const held = heldPassiveMap.get(passiveId);
    if (held) {
      return buildPassiveTooltipData(held, pause, catalog);
    }
    const def = catalog.passives[passiveId];
    return {
      name: def.name,
      badgeText: `未持有 (上限 Lv.${def.maxLevel})`,
      badgeVariant: 'emerald',
      description: def.description,
    };
  };

  const grimoireSection = el('section', {
    className: 'pause-section',
    attrs: { tabindex: '-1' },
    dataset: { testid: 'pause-grimoire-section' },
    children: [
      el('h3', {
        className: 'pause-section-title',
        children: [
          '魔导书 · 进化配方矩阵 [G]',
          el('span', {
            className: `tag-badge ${pause.hasGrimoire ? 'tag-badge-gold' : ''}`,
            text: pause.hasGrimoire ? '魔导书已解锁' : '仅显示已持有武器配方',
          }),
        ],
      }),
      pause.evolutionsPossible.length === 0
        ? el('p', {
            className: 'codex-desc',
            text: '当前尚未持有可进化武器配方（拾取对应武器或在「镶嵌图书馆」获取「魔导书」后可查看全部配方）。',
          })
        : el('div', {
            className: 'grimoire-grid',
            children: pause.evolutionsPossible.map((hint) => {
              const baseDef = catalog.weapons[hint.baseWeapon];
              const partnerId = hint.partnerWeapon ?? hint.requiredPassive!;
              const partnerDef = hint.partnerWeapon
                ? catalog.weapons[hint.partnerWeapon]
                : catalog.passives[hint.requiredPassive!];
              const evolvedDef = catalog.weapons[hint.evolvedId];

              const hasBase = heldWeaponIds.has(hint.baseWeapon);
              const hasPartner = hint.partnerWeapon
                ? heldWeaponIds.has(hint.partnerWeapon)
                : heldPassiveIds.has(hint.requiredPassive!);
              const hasEvolved = heldWeaponIds.has(hint.evolvedId);

              const baseTooltip = buildPreviewWeaponTooltip(hint.baseWeapon);
              const partnerTooltip = hint.partnerWeapon
                ? buildPreviewWeaponTooltip(hint.partnerWeapon)
                : buildPreviewPassiveTooltip(hint.requiredPassive!);
              const evolvedTooltip = buildPreviewWeaponTooltip(hint.evolvedId);

              return el('div', {
                className: `grimoire-row ${hint.ready ? 'ready' : ''}`,
                children: [
                  el('div', {
                    className: `grimoire-slot ${hasBase ? 'owned' : ''}`,
                    attrs: {
                      tabindex: 0,
                      title: formatTooltipPlainText(baseTooltip),
                    },
                    children: [
                      imgIcon(iconUrl(hint.baseWeapon), baseDef.name),
                      el('span', { text: baseDef.name }),
                      createSlotTooltipElement(baseTooltip),
                    ],
                  }),
                  el('span', { className: 'grimoire-op', text: '+' }),
                  el('div', {
                    className: `grimoire-slot ${hasPartner ? 'owned' : ''}`,
                    attrs: {
                      tabindex: 0,
                      title: formatTooltipPlainText(partnerTooltip),
                    },
                    children: [
                      imgIcon(iconUrl(partnerId), partnerDef.name),
                      el('span', { text: partnerDef.name }),
                      createSlotTooltipElement(partnerTooltip),
                    ],
                  }),
                  el('span', { className: 'grimoire-op', text: '=' }),
                  el('div', {
                    className: `grimoire-slot ${hasEvolved ? 'owned' : ''}`,
                    attrs: {
                      tabindex: 0,
                      title: formatTooltipPlainText(evolvedTooltip),
                    },
                    children: [
                      imgIcon(iconUrl(hint.evolvedId), evolvedDef.name),
                      el('span', { text: hint.ready ? `${evolvedDef.name} (可进化!)` : evolvedDef.name }),
                      createSlotTooltipElement(evolvedTooltip),
                    ],
                  }),
                ],
              });
            }),
          }),
    ],
  });

  const minimapSection = el('section', {
    className: 'pause-section',
    attrs: { tabindex: '-1' },
    dataset: { testid: 'pause-minimap-section' },
    children: [
      el('h3', {
        className: 'pause-section-title',
        children: [
          '银河系小地图 · 战场方位 [M]',
          el('span', {
            className: `tag-badge ${pause.hasMilkyWayMap ? 'tag-badge-arcana' : ''}`,
            text: pause.hasMilkyWayMap ? '银河系地图已激活' : '未拾取银河系地图',
          }),
        ],
      }),
      el('div', {
        className: 'minimap-canvas-box',
        children: [buildMinimapSvg(frame, pause)],
      }),
      el('div', {
        className: 'minimap-legend',
        children: [
          el('span', { children: [el('span', { className: 'legend-dot', attrs: { style: 'background:#ffffff' } }), '玩家'] }),
          el('span', { children: [el('span', { className: 'legend-dot', attrs: { style: 'background:#b48cff' } }), '圣物'] }),
          el('span', { children: [el('span', { className: 'legend-dot', attrs: { style: 'background:#60e3aa' } }), '地面被动'] }),
          el('span', { children: [el('span', { className: 'legend-dot', attrs: { style: 'background:#f4d87d' } }), '宝箱'] }),
          el('span', { children: [el('span', { className: 'legend-dot', attrs: { style: 'background:#ff4d5a' } }), '首领/死神'] }),
        ],
      }),
    ],
  });

  const bgmValLabel = el('span', { className: 'num-font', text: `${Math.round(settings.bgmVolume * 100)}%` });
  const bgmInput = el('input', {
    className: 'gothic-range',
    attrs: { type: 'range', min: 0, max: 100, value: Math.round(settings.bgmVolume * 100) },
  }) as HTMLInputElement;
  bgmInput.addEventListener('input', () => {
    bgmValLabel.textContent = `${bgmInput.value}%`;
    deps.onUpdateSettings({ bgmVolume: Number(bgmInput.value) / 100 });
  });

  const sfxValLabel = el('span', { className: 'num-font', text: `${Math.round(settings.sfxVolume * 100)}%` });
  const sfxInput = el('input', {
    className: 'gothic-range',
    attrs: { type: 'range', min: 0, max: 100, value: Math.round(settings.sfxVolume * 100) },
  }) as HTMLInputElement;
  sfxInput.addEventListener('input', () => {
    sfxValLabel.textContent = `${sfxInput.value}%`;
    deps.onUpdateSettings({ sfxVolume: Number(sfxInput.value) / 100 });
  });

  let showMinimap = settings.showMinimap;
  const minimapToggleBtn = el('button', {
    className: `gothic-btn ${showMinimap ? 'gothic-btn-gold' : ''}`,
    text: showMinimap ? '开启' : '关闭',
    dataset: { testid: 'btn-pause-minimap' },
    onClick: () => {
      showMinimap = !showMinimap;
      minimapToggleBtn.textContent = showMinimap ? '开启' : '关闭';
      minimapToggleBtn.classList.toggle('gothic-btn-gold', showMinimap);
      deps.onUpdateSettings({ showMinimap });
    },
  });

  const loadoutStrip = el('div', {
    className: 'hud-slot-strip pause-loadout-strip',
    dataset: { testid: 'pause-loadout-strip' },
    children: [
      ...pause.weapons.map((slot) => {
        const def = catalog.weapons[slot.weaponId];
        const tip = buildWeaponTooltipData(slot, pause, catalog);
        return el('div', {
          className: `hud-slot filled ${slot.isEvolved ? 'evolved' : ''}`,
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tip),
            'aria-label': `${def.name} ${tip.badgeText}`,
          },
          children: [
            imgIcon(iconUrl(slot.weaponId), def.name),
            slot.limitBreakLevel > 0
              ? el('span', { className: 'hud-slot-lb', text: `+${slot.limitBreakLevel}` })
              : null,
            createSlotTooltipElement(tip),
          ],
        });
      }),
      ...pause.passives.map((slot) => {
        const def = catalog.passives[slot.passiveId];
        const tip = buildPassiveTooltipData(slot, pause, catalog);
        return el('div', {
          className: 'hud-slot filled',
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tip),
            'aria-label': `${def.name} ${tip.badgeText}`,
          },
          children: [
            imgIcon(iconUrl(slot.passiveId), def.name),
            createSlotTooltipElement(tip),
          ],
        });
      }),
      ...pause.arcanas.map((aId) => {
        const def = catalog.arcanas[aId];
        const tip = buildArcanaTooltipData(aId, catalog);
        return el('div', {
          className: 'hud-slot filled',
          attrs: {
            tabindex: 0,
            title: formatTooltipPlainText(tip),
            'aria-label': `${def.roman} ${def.name}`,
          },
          children: [
            imgIcon(iconUrl(aId), def.name),
            createSlotTooltipElement(tip),
          ],
        });
      }),
    ],
  });

  const statsSection = el('section', {
    className: 'pause-section',
    children: [
      el('h3', { className: 'pause-section-title', text: '当前装备与实时属性' }),
      loadoutStrip,
      el('div', {
        className: 'stat-grid',
        children: formatStatDisplayList(pause.stats).map((s) =>
          el('div', {
            className: 'stat-row',
            children: [
              el('span', { className: 'stat-row-label', text: s.label }),
              el('span', { className: 'stat-row-val', text: s.valueText }),
            ],
          }),
        ),
      }),
      el('div', {
        className: 'slider-row',
        children: [
          el('div', { className: 'slider-label-row', children: ['背景音乐 (BGM)', bgmValLabel] }),
          bgmInput,
        ],
      }),
      el('div', {
        className: 'slider-row',
        children: [
          el('div', { className: 'slider-label-row', children: ['战斗音效 (SFX)', sfxValLabel] }),
          sfxInput,
        ],
      }),
      el('div', {
        className: 'switch-row',
        children: ['战场实时小雷达', minimapToggleBtn],
      }),
    ],
  });

  const element = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-pause' },
    children: [
      el('div', {
        className: 'modal-dialog pause-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', { className: 'modal-title', text: '战斗暂停' }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `${catalog.stages[frame.stageId].name} · ${catalog.heroes[frame.player.heroId].name} · SPACE / ESC 继续 · G 魔典 · M 地图`,
                  }),
                ],
              }),
              el('button', {
                className: 'gothic-btn gothic-btn-primary',
                text: '继续战斗 (Space / Esc)',
                dataset: { testid: 'btn-pause-resume' },
                onClick: () => deps.onResume(),
              }),
            ],
          }),
          el('div', {
            className: 'modal-body',
            children: [
              el('div', {
                className: 'pause-layout',
                children: [
                  statsSection,
                  el('div', {
                    className: 'stage-list',
                    children: [minimapSection, grimoireSection],
                  }),
                ],
              }),
            ],
          }),
          el('footer', {
            className: 'modal-footer',
            children: [
              el('button', {
                className: 'gothic-btn gothic-btn-danger',
                text: '撤离战场并结算',
                dataset: { testid: 'btn-pause-retire' },
                onClick: () => deps.onRetire(),
              }),
              el('button', {
                className: 'gothic-btn gothic-btn-gold',
                text: '返回战斗',
                onClick: () => deps.onResume(),
              }),
            ],
          }),
        ],
      }),
    ],
  });

  return {
    element,
    focusSection: (section) => {
      const target = section === 'grimoire' ? grimoireSection : minimapSection;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
    },
  };
}
