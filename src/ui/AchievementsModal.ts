import type { AchievementCategory, AudioCue, Catalog, SaveState } from '../contracts/index.ts';
import { el } from '../app/dom.ts';
import { formatAchievementRewardTags } from '../app/formatters.ts';

export interface AchievementsModalDeps {
  catalog: Catalog;
  saveState: SaveState;
  onClose: () => void;
  onCue: (cue: AudioCue) => void;
}

const CATEGORY_LABELS: ReadonlyArray<{ id: 'all' | AchievementCategory; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'stage', label: '关卡' },
  { id: 'collection', label: '图鉴/角色' },
  { id: 'evolution', label: '进化' },
  { id: 'survival', label: '生存' },
  { id: 'kills', label: '击杀' },
  { id: 'relic', label: '圣物' },
  { id: 'level', label: '等级' },
  { id: 'gold', label: '金币' },
];

export function renderAchievementsModal(deps: AchievementsModalDeps): HTMLElement {
  const { catalog, saveState, onCue } = deps;
  const unlockedSet = new Set(saveState.unlockedAchievements);
  let activeCategory: 'all' | AchievementCategory = 'all';

  const backdrop = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-achievements' },
  });

  const renderContent = (): void => {
    backdrop.replaceChildren();
    const list =
      activeCategory === 'all'
        ? catalog.achievements
        : catalog.achievements.filter((a) => a.category === activeCategory);

    const body = el('div', { className: 'modal-body' });
    body.appendChild(
      el('div', {
        className: 'filter-tabs',
        children: CATEGORY_LABELS.map((cat) =>
          el('button', {
            className: `filter-tab ${activeCategory === cat.id ? 'active' : ''}`,
            text: cat.label,
            onClick: () => {
              onCue({ type: 'ui_click' });
              activeCategory = cat.id;
              renderContent();
            },
          }),
        ),
      }),
    );

    const grid = el('div', { className: 'codex-grid' });
    for (const ach of list) {
      const done = unlockedSet.has(ach.id);
      const rewardTags = formatAchievementRewardTags(ach.reward, catalog);

      grid.appendChild(
        el('div', {
          className: `codex-card ${done ? '' : 'undiscovered'}`,
          children: [
            el('div', {
              className: 'codex-info',
              children: [
                el('div', {
                  className: 'stage-card-top',
                  children: [
                    el('span', { className: 'codex-name', text: ach.name }),
                    el('span', {
                      className: `tag-badge ${done ? 'tag-badge-emerald' : ''}`,
                      text: done ? '已达成' : '未达成',
                    }),
                  ],
                }),
                el('p', { className: 'codex-desc', text: ach.description }),
                el('div', {
                  className: 'title-meta-pills',
                  children: rewardTags.map((tag) =>
                    el('span', { className: 'tag-badge tag-badge-gold', text: tag }),
                  ),
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
                  el('h2', { className: 'modal-title', text: '猎魔成就圣典' }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `已解锁 ${unlockedSet.size} / ${catalog.achievements.length} 项成就`,
                  }),
                ],
              }),
              el('button', {
                className: 'gothic-btn',
                text: '关闭',
                dataset: { testid: 'btn-close-achievements' },
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
