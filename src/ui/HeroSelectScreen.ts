import { HERO_IDS, STAGE_IDS } from '../contracts/ids.ts';
import type { AudioCue, Catalog, HeroId, SaveState, StageId } from '../contracts/index.ts';
import { calculatePlayerStats, type SaveStore } from '../core/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatInt, formatStatDisplayList, iconUrl } from '../app/formatters.ts';

type SaveStoreWithHeroClears = SaveStore & {
  getHeroStageClears?: (heroId: HeroId) => { normal: StageId[]; hyper: StageId[] };
};

type SaveStateWithHeroClears = SaveState & {
  heroStageClears?: Partial<Record<HeroId, StageId[]>>;
  heroHyperClears?: Partial<Record<HeroId, StageId[]>>;
};

function resolveHeroStageClears(
  saveStore: SaveStore,
  state: SaveState,
  heroId: HeroId,
): { normal: Set<StageId>; hyper: Set<StageId> } {
  const storeExt = saveStore as SaveStoreWithHeroClears;
  if (typeof storeExt.getHeroStageClears === 'function') {
    const res = storeExt.getHeroStageClears(heroId);
    return {
      normal: new Set(res.normal),
      hyper: new Set(res.hyper),
    };
  }

  const stateExt = state as SaveStateWithHeroClears;
  const normal = new Set<StageId>(stateExt.heroStageClears?.[heroId] ?? []);
  const hyper = new Set<StageId>(stateExt.heroHyperClears?.[heroId] ?? []);
  for (const sId of STAGE_IDS) {
    const rec = state.bestRunByStage[sId];
    if (!rec || rec.lastHeroId !== heroId) continue;
    if (rec.clears > 0) normal.add(sId);
    if (rec.hyperCleared) {
      normal.add(sId);
      hyper.add(sId);
    }
  }
  return { normal, hyper };
}

export interface HeroSelectDeps {
  catalog: Catalog;
  saveStore: SaveStore;
  onBack: () => void;
  onProceedStage: () => void;
  onCue: (cue: AudioCue) => void;
}

export function renderHeroSelectScreen(deps: HeroSelectDeps): HTMLElement {
  const { catalog, saveStore, onCue } = deps;
  let inspectedHeroId: HeroId = saveStore.getState().selectedHeroId;

  const root = el('div', {
    className: 'menu-screen',
    dataset: { testid: 'screen-hero-select' },
  });

  const renderContent = (): void => {
    root.replaceChildren();
    const state = saveStore.getState();
    const hero = catalog.heroes[inspectedHeroId];
    const unlocked = saveStore.isHeroUnlocked(inspectedHeroId);
    const purchased = saveStore.isHeroPurchased(inspectedHeroId);
    const startWeapon = catalog.weapons[hero.startingWeapon];

    const previewStats = calculatePlayerStats({
      catalog,
      heroId: inspectedHeroId,
      stageId: state.selectedStageId,
      playerLevel: 1,
      currentHp: hero.baseStats.maxHp,
      powerUps: state.powerUps,
      passives: new Map(),
      weaponSlotCount: 1,
      arcanas: [],
      hyper: false,
      elapsedSeconds: 0,
      revivalsConsumed: 0,
      divineBloodlineBonusMaxHp: 0,
      soulEaterMightBonus: 0,
    });

    const header = el('header', {
      className: 'menu-header',
      children: [
        el('div', {
          className: 'menu-header-left',
          children: [
            el('button', {
              className: 'gothic-btn',
              text: '← 返回主页',
              dataset: { testid: 'btn-hero-back' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                deps.onBack();
              },
            }),
            el('div', {
              className: 'menu-heading-wrap',
              children: [
                el('h2', { className: 'menu-heading', text: '选择猎魔英雄' }),
                el('p', {
                  className: 'menu-subheading',
                  text: `已招募 ${state.purchasedHeroes.length} / ${HERO_IDS.length} 名英雄`,
                }),
              ],
            }),
          ],
        }),
        el('div', {
          className: 'menu-header-right',
          children: [
            el('div', {
              className: 'gold-pill',
              children: [
                imgIcon(iconUrl('coin'), '金币'),
                el('span', { className: 'num-font', text: `${formatInt(state.gold)} G` }),
              ],
            }),
          ],
        }),
      ],
    });

    const heroGrid = el('div', { className: 'hero-grid' });
    for (const hId of HERO_IDS) {
      const def = catalog.heroes[hId];
      const isUnlocked = saveStore.isHeroUnlocked(hId);
      const isPurchased = saveStore.isHeroPurchased(hId);
      const isSelected = inspectedHeroId === hId;
      const weaponDef = catalog.weapons[def.startingWeapon];
      const clears = resolveHeroStageClears(saveStore, state, hId);

      let statusTag: HTMLElement;
      if (!isUnlocked) {
        statusTag = el('span', { className: 'tag-badge', text: '未解锁' });
      } else if (!isPurchased) {
        statusTag = el('span', { className: 'tag-badge tag-badge-gold num-font', text: `${formatInt(def.cost)} G` });
      } else if (state.selectedHeroId === hId) {
        statusTag = el('span', { className: 'tag-badge tag-badge-emerald', text: '已出战' });
      } else {
        statusTag = el('span', { className: 'tag-badge', text: '已拥有' });
      }

      const cardClearsRow = el('div', {
        className: 'hero-clears-row',
        dataset: { testid: `hero-clears-${hId}` },
        children: STAGE_IDS.map((sId) => {
          const st = catalog.stages[sId];
          const isHyper = clears.hyper.has(sId);
          const isNormal = clears.normal.has(sId);
          const mode = isHyper ? 'hyper' : isNormal ? 'normal' : 'none';
          const label = isHyper
            ? `${st.name}：狂热 (Hyper) 已通关`
            : isNormal
              ? `${st.name}：普通模式已通关`
              : `${st.name}：尚未通关`;
          return el('span', {
            className: `hero-clear-medal ${mode}`,
            text: isHyper ? `${st.order}★` : String(st.order),
            attrs: { title: label, 'aria-label': label },
            dataset: { stage: sId, clear: mode },
          });
        }),
      });

      const card = el('button', {
        className: `hero-card ${isSelected ? 'selected' : ''} ${!isUnlocked ? 'locked' : ''}`,
        dataset: { testid: `hero-card-${hId}` },
        children: [
          el('div', {
            className: 'hero-avatar-box',
            children: [imgIcon(iconUrl(hId), def.name)],
          }),
          el('span', { className: 'hero-card-name', text: def.name }),
          el('span', {
            className: 'hero-card-weapon',
            children: [
              imgIcon(iconUrl(def.startingWeapon), weaponDef.name),
              weaponDef.name,
            ],
          }),
          cardClearsRow,
          statusTag,
        ],
        onClick: () => {
          onCue({ type: 'ui_click' });
          inspectedHeroId = hId;
          if (isPurchased) {
            saveStore.selectHero(hId);
          }
          renderContent();
        },
      });
      card.addEventListener('dblclick', () => {
        if (saveStore.isHeroPurchased(hId)) {
          saveStore.selectHero(hId);
          deps.onProceedStage();
        }
      });
      heroGrid.appendChild(card);
    }

    const statGrid = el('div', {
      className: 'stat-grid',
      children: formatStatDisplayList(previewStats)
        .slice(0, 16)
        .map((s) =>
          el('div', {
            className: 'stat-row',
            children: [
              el('span', { className: 'stat-row-label', text: s.label }),
              el('span', { className: 'stat-row-val', text: s.valueText }),
            ],
          }),
        ),
    });

    const inspectedClears = resolveHeroStageClears(saveStore, state, inspectedHeroId);
    const detailClearsSection = el('div', {
      className: 'detail-clears-panel',
      dataset: { testid: `hero-detail-clears-${inspectedHeroId}` },
      children: [
        el('div', {
          className: 'detail-clears-head',
          children: [
            el('span', { className: 'stat-row-label', text: '关卡通关徽章' }),
            el('span', {
              className: 'tag-badge tag-badge-gold num-font',
              text: `普通 ${inspectedClears.normal.size}/${STAGE_IDS.length} · 狂热 ${inspectedClears.hyper.size}/${STAGE_IDS.length}`,
            }),
          ],
        }),
        el('div', {
          className: 'detail-clears-grid',
          children: STAGE_IDS.map((sId) => {
            const st = catalog.stages[sId];
            const isHyper = inspectedClears.hyper.has(sId);
            const isNormal = inspectedClears.normal.has(sId);
            const mode = isHyper ? 'hyper' : isNormal ? 'normal' : 'none';
            return el('div', {
              className: `detail-clear-chip ${mode}`,
              dataset: { stage: sId, clear: mode },
              children: [
                el('span', { className: 'detail-clear-stage', text: `${st.order}. ${st.name}` }),
                el('span', {
                  className: `tag-badge ${isHyper ? 'tag-badge-crimson' : isNormal ? 'tag-badge-gold' : ''}`,
                  text: isHyper ? 'HYPER' : isNormal ? '普通' : '未通关',
                }),
              ],
            });
          }),
        }),
      ],
    });

    let actionBtn: HTMLButtonElement;
    if (!unlocked) {
      actionBtn = el('button', {
        className: 'gothic-btn',
        text: `未解锁：${hero.unlockHint}`,
        attrs: { disabled: true },
        dataset: { testid: 'btn-hero-locked' },
      });
    } else if (!purchased) {
      const canAfford = state.gold >= hero.cost;
      actionBtn = el('button', {
        className: 'gothic-btn gothic-btn-gold',
        text: `招募英雄 (${formatInt(hero.cost)} G)`,
        attrs: { disabled: !canAfford },
        dataset: { testid: 'btn-hero-buy' },
        onClick: () => {
          const res = saveStore.buyHero(inspectedHeroId);
          if (res.ok) {
            onCue({ type: 'ui_buy' });
            renderContent();
          } else {
            onCue({ type: 'ui_error' });
          }
        },
      });
    } else {
      actionBtn = el('button', {
        className: 'gothic-btn gothic-btn-primary',
        text: '选定英雄 · 前往关卡 →',
        dataset: { testid: 'btn-hero-confirm' },
        onClick: () => {
          saveStore.selectHero(inspectedHeroId);
          onCue({ type: 'ui_click' });
          deps.onProceedStage();
        },
      });
    }

    const detailPane = el('aside', {
      className: 'gothic-panel detail-pane',
      attrs: { id: 'hero-detail-pane' },
      dataset: { testid: 'hero-detail-pane' },
      children: [
        el('div', {
          className: 'detail-hero-head',
          children: [
            imgIcon(iconUrl(inspectedHeroId), hero.name, 'detail-portrait'),
            el('div', {
              className: 'detail-title-stack',
              children: [
                el('h3', { className: 'detail-name', text: hero.name }),
                el('span', { className: 'detail-en', text: `${hero.englishName} · ${hero.title}` }),
                el('span', {
                  className: `tag-badge ${unlocked ? 'tag-badge-gold' : 'tag-badge-crimson'}`,
                  text: hero.unlockHint,
                }),
              ],
            }),
          ],
        }),
        el('p', { className: 'detail-lore', text: hero.lore }),
        el('div', {
          className: 'detail-weapon-box',
          children: [
            imgIcon(iconUrl(hero.startingWeapon), startWeapon.name),
            el('div', {
              className: 'codex-info',
              children: [
                el('span', { className: 'codex-name', text: `初始武器：${startWeapon.name}` }),
                el('span', { className: 'codex-desc', text: startWeapon.description }),
              ],
            }),
          ],
        }),
        detailClearsSection,
        el('div', {
          className: 'status-banner ok',
          text: `角色特性：${hero.passiveSummary}`,
        }),
        statGrid,
        el('div', {
          className: 'detail-actions',
          children: [actionBtn],
        }),
      ],
    });

    root.append(
      header,
      el('div', {
        className: 'menu-workspace',
        children: [
          el('div', { className: 'menu-scroll-pane', children: [heroGrid] }),
          detailPane,
        ],
      }),
    );
  };

  renderContent();
  return root;
}
