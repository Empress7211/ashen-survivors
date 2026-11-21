import { BOSS_ENEMY_IDS, ENEMY_IDS, REGULAR_ENEMY_IDS } from '../contracts/ids.ts';
import type { AudioCue, Catalog, SaveState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatInt, iconUrl } from '../app/formatters.ts';

export interface BestiaryModalDeps {
  catalog: Catalog;
  saveState: SaveState;
  onClose: () => void;
  onCue: (cue: AudioCue) => void;
}

type BestiaryFilter = 'all' | 'regular' | 'boss';

export function renderBestiaryModal(deps: BestiaryModalDeps): HTMLElement {
  const { catalog, saveState, onCue } = deps;
  let filter: BestiaryFilter = 'all';
  const hasGouda = saveState.unlockedRelics.includes('relic_ars_gouda');

  const backdrop = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-bestiary' },
  });

  const renderContent = (): void => {
    backdrop.replaceChildren();
    const list =
      filter === 'regular'
        ? REGULAR_ENEMY_IDS
        : filter === 'boss'
          ? BOSS_ENEMY_IDS
          : ENEMY_IDS;

    const slainSpecies = ENEMY_IDS.filter((id) => (saveState.bestiaryKills[id] ?? 0) > 0).length;

    const body = el('div', { className: 'modal-body' });

    if (!hasGouda) {
      body.appendChild(
        el('div', {
          className: 'status-banner ok',
          text: '提示：在「疯狂森林」收集圣物「奥秘干酪」可激活全图鉴记录；当前仍可预览全部夜魔档案与累计讨伐数。',
        }),
      );
      body.lastElementChild?.setAttribute('style', 'margin-bottom: 12px;');
    }

    body.appendChild(
      el('div', {
        className: 'filter-tabs',
        children: [
          el('button', {
            className: `filter-tab ${filter === 'all' ? 'active' : ''}`,
            text: `全部魔物 (${ENEMY_IDS.length})`,
            onClick: () => {
              onCue({ type: 'ui_click' });
              filter = 'all';
              renderContent();
            },
          }),
          el('button', {
            className: `filter-tab ${filter === 'regular' ? 'active' : ''}`,
            text: `常规魔潮 (${REGULAR_ENEMY_IDS.length})`,
            onClick: () => {
              onCue({ type: 'ui_click' });
              filter = 'regular';
              renderContent();
            },
          }),
          el('button', {
            className: `filter-tab ${filter === 'boss' ? 'active' : ''}`,
            text: `首领与死神 (${BOSS_ENEMY_IDS.length})`,
            onClick: () => {
              onCue({ type: 'ui_click' });
              filter = 'boss';
              renderContent();
            },
          }),
        ],
      }),
    );

    const grid = el('div', { className: 'codex-grid' });
    for (const eId of list) {
      const def = catalog.enemies[eId];
      const kills = saveState.bestiaryKills[eId] ?? 0;

      grid.appendChild(
        el('div', {
          className: 'codex-card',
          children: [
            imgIcon(iconUrl(eId), def.name, 'codex-icon'),
            el('div', {
              className: 'codex-info',
              children: [
                el('div', {
                  className: 'stage-card-top',
                  children: [
                    el('span', { className: 'codex-name', text: def.name }),
                    el('span', {
                      className: `tag-badge ${def.isReaper ? 'tag-badge-crimson' : def.isBoss ? 'tag-badge-gold' : ''}`,
                      text: def.isReaper ? '死神' : def.isBoss ? '首领' : '魔物',
                    }),
                  ],
                }),
                el('span', { className: 'detail-en', text: def.englishName }),
                el('p', { className: 'codex-desc', text: def.lore }),
                el('span', {
                  className: 'tag-badge tag-badge-gold num-font',
                  text: `生命 ${formatInt(def.maxHp)} · 伤害 ${def.damage} · 讨伐 ${formatInt(kills)}`,
                }),
              ],
            }),
          ],
        }),
      );
    }
    body.appendChild(grid);

    backdrop.appendChild(
      el('div', {
        className: 'modal-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', { className: 'modal-title', text: '夜幕怪物图鉴' }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `已击杀物种 ${slainSpecies} / ${ENEMY_IDS.length} · 累计讨伐 ${formatInt(saveState.totalKills)}`,
                  }),
                ],
              }),
              el('button', {
                className: 'gothic-btn',
                text: '关闭',
                dataset: { testid: 'btn-close-bestiary' },
                onClick: () => {
                  onCue({ type: 'ui_click' });
                  deps.onClose();
                },
              }),
            ],
          }),
          body,
        ],
      }),
    );
  };

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      onCue({ type: 'ui_click' });
      deps.onClose();
    }
  });

  renderContent();
  return backdrop;
}
