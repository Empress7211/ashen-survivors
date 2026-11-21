import {
  ARCANA_IDS,
  PASSIVE_IDS,
  PICKUP_IDS,
  RELIC_IDS,
  WEAPON_IDS,
} from '../contracts/ids.ts';
import type { AudioCue, Catalog, SaveState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { iconUrl } from '../app/formatters.ts';

export interface CollectionModalDeps {
  catalog: Catalog;
  saveState: SaveState;
  onClose: () => void;
  onCue: (cue: AudioCue) => void;
}

type CollectionTab = 'grimoire' | 'weapons' | 'passives' | 'arcanas' | 'relics';

export function renderCollectionModal(deps: CollectionModalDeps): HTMLElement {
  const { catalog, saveState, onCue } = deps;
  let activeTab: CollectionTab = 'grimoire';
  const discoveredSet = new Set(saveState.discoveredItems);
  const unlockedRelics = new Set(saveState.unlockedRelics);
  const unlockedArcanas = new Set(saveState.unlockedArcanas);

  const backdrop = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-collection' },
  });

  const renderContent = (): void => {
    backdrop.replaceChildren();

    const tabs: Array<{ id: CollectionTab; label: string }> = [
      { id: 'grimoire', label: `进化魔典 (${catalog.evolutions.length})` },
      { id: 'weapons', label: `武器图鉴 (${WEAPON_IDS.length})` },
      { id: 'passives', label: `被动宝物 (${PASSIVE_IDS.length})` },
      { id: 'arcanas', label: `秘法塔罗 (${ARCANA_IDS.length})` },
      { id: 'relics', label: `圣物与补给 (${RELIC_IDS.length + PICKUP_IDS.length})` },
    ];

    const body = el('div', { className: 'modal-body' });
    const tabBar = el('div', {
      className: 'filter-tabs',
      children: tabs.map((t) =>
        el('button', {
          className: `filter-tab ${activeTab === t.id ? 'active' : ''}`,
          text: t.label,
          dataset: { testid: `collection-tab-${t.id}` },
          onClick: () => {
            onCue({ type: 'ui_click' });
            activeTab = t.id;
            renderContent();
          },
        }),
      ),
    });
    body.appendChild(tabBar);

    if (activeTab === 'grimoire') {
      const grid = el('div', { className: 'grimoire-grid' });
      for (const recipe of catalog.evolutions) {
        const baseDef = catalog.weapons[recipe.baseWeapon];
        const partnerId = recipe.partnerWeapon ?? recipe.requiredPassive!;
        const partnerDef = recipe.partnerWeapon
          ? catalog.weapons[recipe.partnerWeapon]
          : catalog.passives[recipe.requiredPassive!];
        const evolvedDef = catalog.weapons[recipe.evolvedId];

        const baseKnown = discoveredSet.has(recipe.baseWeapon);
        const partnerKnown = discoveredSet.has(partnerId);
        const evolvedKnown = discoveredSet.has(recipe.evolvedId);

        grid.appendChild(
          el('div', {
            className: `grimoire-row ${evolvedKnown ? 'ready' : ''}`,
            children: [
              el('div', {
                className: `grimoire-slot ${baseKnown ? 'owned' : ''}`,
                children: [
                  imgIcon(iconUrl(recipe.baseWeapon), baseDef.name),
                  el('span', { text: `${baseDef.name} Lv8` }),
                ],
              }),
              el('span', { className: 'grimoire-op', text: '+' }),
              el('div', {
                className: `grimoire-slot ${partnerKnown ? 'owned' : ''}`,
                children: [
                  imgIcon(iconUrl(partnerId), partnerDef.name),
                  el('span', {
                    text: `${partnerDef.name}${recipe.partnerWeapon ? ' Lv8' : recipe.requiresMaxPassive ? ' LvMax' : ' Lv1'}`,
                  }),
                ],
              }),
              el('span', { className: 'grimoire-op', text: '=' }),
              el('div', {
                className: `grimoire-slot ${evolvedKnown ? 'owned' : ''}`,
                children: [
                  imgIcon(iconUrl(recipe.evolvedId), evolvedDef.name),
                  el('span', { text: evolvedDef.name }),
                ],
              }),
            ],
          }),
        );
      }
      body.appendChild(grid);
    } else if (activeTab === 'weapons') {
      const grid = el('div', { className: 'codex-grid' });
      for (const wId of WEAPON_IDS) {
        const def = catalog.weapons[wId];
        const known = discoveredSet.has(wId);
        grid.appendChild(
          el('div', {
            className: `codex-card ${known ? '' : 'undiscovered'}`,
            children: [
              imgIcon(iconUrl(wId), def.name, 'codex-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('div', {
                    className: 'stage-card-top',
                    children: [
                      el('span', { className: 'codex-name', text: def.name }),
                      el('span', {
                        className: `tag-badge ${def.isEvolved ? 'tag-badge-crimson' : known ? 'tag-badge-gold' : ''}`,
                        text: def.isEvolved ? '超武进化' : known ? '已收录' : '未发现',
                      }),
                    ],
                  }),
                  el('span', { className: 'detail-en', text: def.englishName }),
                  el('p', { className: 'codex-desc', text: def.description }),
                ],
              }),
            ],
          }),
        );
      }
      body.appendChild(grid);
    } else if (activeTab === 'passives') {
      const grid = el('div', { className: 'codex-grid' });
      for (const pId of PASSIVE_IDS) {
        const def = catalog.passives[pId];
        const known = discoveredSet.has(pId);
        grid.appendChild(
          el('div', {
            className: `codex-card ${known ? '' : 'undiscovered'}`,
            children: [
              imgIcon(iconUrl(pId), def.name, 'codex-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('div', {
                    className: 'stage-card-top',
                    children: [
                      el('span', { className: 'codex-name', text: def.name }),
                      el('span', {
                        className: `tag-badge ${known ? 'tag-badge-gold' : ''}`,
                        text: `上限 Lv.${def.maxLevel}`,
                      }),
                    ],
                  }),
                  el('span', { className: 'detail-en', text: def.englishName }),
                  el('p', { className: 'codex-desc', text: def.description }),
                ],
              }),
            ],
          }),
        );
      }
      body.appendChild(grid);
    } else if (activeTab === 'arcanas') {
      const grid = el('div', { className: 'codex-grid' });
      for (const aId of ARCANA_IDS) {
        const def = catalog.arcanas[aId];
        const unlocked = unlockedArcanas.has(aId);
        grid.appendChild(
          el('div', {
            className: `codex-card ${unlocked ? '' : 'undiscovered'}`,
            children: [
              imgIcon(iconUrl(aId), def.name, 'codex-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('div', {
                    className: 'stage-card-top',
                    children: [
                      el('span', { className: 'codex-name', text: `${def.roman} · ${def.name}` }),
                      el('span', {
                        className: `tag-badge ${unlocked ? 'tag-badge-arcana' : ''}`,
                        text: unlocked ? '已解锁' : '待解锁',
                      }),
                    ],
                  }),
                  el('span', { className: 'detail-en', text: def.englishName }),
                  el('p', { className: 'codex-desc', text: def.description }),
                ],
              }),
            ],
          }),
        );
      }
      body.appendChild(grid);
    } else {
      const grid = el('div', { className: 'codex-grid' });
      for (const rId of RELIC_IDS) {
        const def = catalog.relics[rId];
        const unlocked = unlockedRelics.has(rId);
        grid.appendChild(
          el('div', {
            className: `codex-card ${unlocked ? '' : 'undiscovered'}`,
            children: [
              imgIcon(iconUrl(rId), def.name, 'codex-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('div', {
                    className: 'stage-card-top',
                    children: [
                      el('span', { className: 'codex-name', text: def.name }),
                      el('span', {
                        className: `tag-badge ${unlocked ? 'tag-badge-arcana' : ''}`,
                        text: unlocked ? '已持有圣物' : `位于「${def.stageId ? catalog.stages[def.stageId].name : '未知'}」`,
                      }),
                    ],
                  }),
                  el('p', { className: 'codex-desc', text: def.description }),
                ],
              }),
            ],
          }),
        );
      }
      for (const pkId of PICKUP_IDS) {
        const def = catalog.pickups[pkId];
        grid.appendChild(
          el('div', {
            className: 'codex-card',
            children: [
              imgIcon(iconUrl(pkId), def.name, 'codex-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('span', { className: 'codex-name', text: def.name }),
                  el('span', { className: 'detail-en', text: def.englishName }),
                  el('p', { className: 'codex-desc', text: def.description }),
                ],
              }),
            ],
          }),
        );
      }
      body.appendChild(grid);
    }

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
                  el('h2', { className: 'modal-title', text: '藏品与进化魔典' }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `已收录条目 ${discoveredSet.size} · 圣物 ${unlockedRelics.size}/${RELIC_IDS.length}`,
                  }),
                ],
              }),
              el('button', {
                className: 'gothic-btn',
                text: '关闭',
                dataset: { testid: 'btn-close-collection' },
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
