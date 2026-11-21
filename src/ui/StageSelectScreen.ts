import { STAGE_IDS } from '../contracts/ids.ts';
import type { AudioCue, Catalog, StageGroundPickup, StageId } from '../contracts/index.ts';
import type { SaveStore } from '../core/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatClock, formatInt, formatModifierDelta, iconUrl, stageBgUrl } from '../app/formatters.ts';

export interface StageSelectDeps {
  catalog: Catalog;
  saveStore: SaveStore;
  onBackToHeroes: () => void;
  onStartBattle: () => void;
  onCue: (cue: AudioCue) => void;
}

function describeDirection(x: number, y: number): string {
  const dirs: string[] = [];
  if (y < -120) dirs.push('北');
  else if (y > 120) dirs.push('南');
  if (x < -120) dirs.push('西');
  else if (x > 120) dirs.push('东');
  const dist = Math.round(Math.hypot(x, y));
  return `${dirs.join('') || '近旁'} · ${dist}m`;
}

export function renderStageSelectScreen(deps: StageSelectDeps): HTMLElement {
  const { catalog, saveStore, onCue } = deps;
  const root = el('div', {
    className: 'menu-screen',
    dataset: { testid: 'screen-stage-select' },
  });

  const renderContent = (): void => {
    root.replaceChildren();
    const state = saveStore.getState();
    const selectedHero = catalog.heroes[state.selectedHeroId];
    const selectedStageId: StageId = state.selectedStageId;
    const stage = catalog.stages[selectedStageId];
    const hasHyper = state.unlockedHyper.includes(selectedStageId);
    const hasRandomazzo = state.unlockedRelics.includes('relic_randomazzo');
    const hasYellowSign = state.unlockedRelics.includes('relic_yellow_sign');
    const bestRec = state.bestRunByStage[selectedStageId];

    const header = el('header', {
      className: 'menu-header',
      children: [
        el('div', {
          className: 'menu-header-left',
          children: [
            el('button', {
              className: 'gothic-btn',
              text: '← 重选英雄',
              dataset: { testid: 'btn-stage-back' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                deps.onBackToHeroes();
              },
            }),
            el('div', {
              className: 'menu-heading-wrap',
              children: [
                el('h2', { className: 'menu-heading', text: '选择夜幕战场' }),
                el('p', {
                  className: 'menu-subheading',
                  text: `当前出战：${selectedHero.name} · 初始武器「${catalog.weapons[selectedHero.startingWeapon].name}」`,
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

    const stageList = el('div', { className: 'stage-list' });
    for (const sId of STAGE_IDS) {
      const def = catalog.stages[sId];
      const unlocked = state.unlockedStages.includes(sId);
      const isSelected = selectedStageId === sId;
      const rec = state.bestRunByStage[sId];

      const card = el('button', {
        className: `stage-card ${isSelected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`,
        dataset: { testid: `stage-card-${sId}` },
        attrs: { disabled: !unlocked },
        children: [
          imgIcon(iconUrl(sId), def.name, 'stage-thumb'),
          el('div', {
            className: 'stage-card-body',
            children: [
              el('div', {
                className: 'stage-card-top',
                children: [
                  el('span', { className: 'stage-card-title', text: `${def.order}. ${def.name}` }),
                  el('span', {
                    className: `tag-badge ${unlocked ? 'tag-badge-gold' : 'tag-badge-crimson'}`,
                    text: unlocked
                      ? rec
                        ? `最佳 ${formatClock(rec.bestTimeSeconds)} · Lv.${rec.bestLevel}`
                        : '已解锁'
                      : def.unlockHint,
                  }),
                ],
              }),
              el('span', { className: 'detail-en', text: def.englishName }),
              el('p', { className: 'codex-desc', text: def.description }),
            ],
          }),
        ],
        onClick: () => {
          if (!unlocked) {
            onCue({ type: 'ui_error' });
            return;
          }
          onCue({ type: 'ui_click' });
          saveStore.selectStage(sId);
          renderContent();
        },
      });
      card.style.backgroundImage = `url('${stageBgUrl(sId)}')`;
      stageList.appendChild(card);
    }

    const toggleItems: Array<{
      key: keyof typeof state.stageOptions;
      label: string;
      hint: string;
      active: boolean;
      locked: boolean;
      testId: string;
    }> = [
      {
        key: 'hyper',
        label: 'Hyper 狂热模式',
        hint: hasHyper
          ? `移速 ${formatModifierDelta(1 + stage.hyperModifiers.moveSpeedBonus)} · 金币 x${stage.hyperModifiers.goldMultiplier} · 经验 x${stage.hyperModifiers.xpMultiplier}`
          : '未解锁：在本关生存满 26 分钟后解锁',
        active: state.stageOptions.hyper && hasHyper,
        locked: !hasHyper,
        testId: 'toggle-hyper',
      },
      {
        key: 'hurry',
        label: 'Hurry 急速时钟',
        hint: '游戏时钟与波次节奏加速 2.0x，节奏更紧凑。',
        active: state.stageOptions.hurry,
        locked: false,
        testId: 'toggle-hurry',
      },
      {
        key: 'arcanasEnabled',
        label: 'Arcanas 秘法塔罗',
        hint: hasRandomazzo
          ? '开局与 11:00/21:00 秘法宝箱可抽取强力塔罗牌。'
          : '未解锁：需在「加洛塔」拾取圣物「随机塔罗牌」',
        active: state.stageOptions.arcanasEnabled && hasRandomazzo,
        locked: !hasRandomazzo,
        testId: 'toggle-arcanas',
      },
      {
        key: 'limitBreakEnabled',
        label: 'Limit Break 极限突破',
        hint: '武器全部满级后可继续突破伤害、范围与冷却上限。',
        active: state.stageOptions.limitBreakEnabled,
        locked: false,
        testId: 'toggle-limit-break',
      },
      {
        key: 'endless',
        label: 'Endless 无尽轮回',
        hint: '30:00 后不再出现红死神，波次强度循环递增。',
        active: state.stageOptions.endless,
        locked: false,
        testId: 'toggle-endless',
      },
    ];

    const togglesGrid = el('div', {
      className: 'stage-toggles-grid',
      children: toggleItems.map((t) =>
        el('button', {
          className: `toggle-chip ${t.active ? 'active' : ''}`,
          attrs: { disabled: t.locked },
          dataset: { testid: t.testId },
          children: [
            el('div', {
              className: 'toggle-chip-title',
              children: [
                el('span', { text: t.label }),
                el('span', {
                  className: `tag-badge ${t.locked ? '' : t.active ? 'tag-badge-gold' : ''}`,
                  text: t.locked ? '未解锁' : t.active ? '开启' : '关闭',
                }),
              ],
            }),
            el('span', { className: 'toggle-chip-hint', text: t.hint }),
          ],
          onClick: () => {
            if (t.locked) {
              onCue({ type: 'ui_error' });
              return;
            }
            onCue({ type: 'ui_click' });
            saveStore.setStageOptions({ [t.key]: !t.active });
            renderContent();
          },
        }),
      ),
    });

    const renderGroundItem = (gp: StageGroundPickup): HTMLElement => {
      const hiddenByYellowSign = gp.requiresRelic === 'relic_yellow_sign' && !hasYellowSign;
      let name = '';
      let kindLabel = '';
      if (gp.kind === 'relic') {
        const r = catalog.relics[gp.itemId as keyof typeof catalog.relics];
        name = r.name;
        kindLabel = state.unlockedRelics.includes(r.id) ? '圣物（已持有）' : '地图圣物';
      } else if (gp.kind === 'passive') {
        name = catalog.passives[gp.itemId as keyof typeof catalog.passives].name;
        kindLabel = '地面被动';
      } else {
        name = catalog.pickups[gp.itemId as keyof typeof catalog.pickups].name;
        kindLabel = '地面补给';
      }

      return el('div', {
        className: 'ground-item-row',
        children: [
          imgIcon(iconUrl(gp.itemId), name),
          el('div', {
            className: 'codex-info',
            children: [
              el('span', { className: 'codex-name', text: hiddenByYellowSign ? '???（需黄衣之印显形）' : name }),
              el('span', { className: 'codex-desc', text: describeDirection(gp.x, gp.y) }),
            ],
          }),
          el('span', {
            className: `tag-badge ${gp.kind === 'relic' ? 'tag-badge-arcana' : 'tag-badge-gold'}`,
            text: kindLabel,
          }),
        ],
      });
    };

    const detailPane = el('aside', {
      className: 'gothic-panel detail-pane',
      dataset: { testid: 'stage-detail-pane' },
      children: [
        el('div', {
          className: 'detail-hero-head',
          children: [
            imgIcon(iconUrl(selectedStageId), stage.name, 'detail-portrait'),
            el('div', {
              className: 'detail-title-stack',
              children: [
                el('h3', { className: 'detail-name', text: stage.name }),
                el('span', { className: 'detail-en', text: `${stage.englishName} · 时限 ${formatClock(stage.durationSeconds)}` }),
                el('span', {
                  className: 'tag-badge tag-badge-gold',
                  text: bestRec
                    ? `通关 ${bestRec.clears} 次 · 最高击杀 ${formatInt(bestRec.bestKills)}`
                    : '尚未踏足此地',
                }),
              ],
            }),
          ],
        }),
        el('div', {
          className: 'stat-grid',
          children: [
            el('div', {
              className: 'stat-row',
              children: [
                el('span', { className: 'stat-row-label', text: '金币倍率' }),
                el('span', { className: 'stat-row-val', text: `x${(stage.baseModifiers.gold * (state.stageOptions.hyper ? stage.hyperModifiers.goldMultiplier : 1)).toFixed(2)}` }),
              ],
            }),
            el('div', {
              className: 'stat-row',
              children: [
                el('span', { className: 'stat-row-label', text: '经验倍率' }),
                el('span', { className: 'stat-row-val', text: `x${(stage.baseModifiers.xp * (state.stageOptions.hyper ? stage.hyperModifiers.xpMultiplier : 1)).toFixed(2)}` }),
              ],
            }),
            el('div', {
              className: 'stat-row',
              children: [
                el('span', { className: 'stat-row-label', text: '敌方生命' }),
                el('span', { className: 'stat-row-val', text: `x${stage.baseModifiers.enemyHp.toFixed(2)}` }),
              ],
            }),
            el('div', {
              className: 'stat-row',
              children: [
                el('span', { className: 'stat-row-label', text: '地形结构' }),
                el('span', { className: 'stat-row-val', text: stage.corridorBounds ? '回廊限制' : '开放荒野' }),
              ],
            }),
          ],
        }),
        togglesGrid,
        el('div', {
          className: 'ground-items-list',
          children: [
            el('span', { className: 'stat-row-label', text: '战场圣物与地面宝物分布：' }),
            ...stage.groundPickups.map(renderGroundItem),
          ],
        }),
        el('div', {
          className: 'detail-actions',
          children: [
            el('button', {
              className: 'gothic-btn gothic-btn-primary',
              text: '踏入猎场 · 开始战斗',
              dataset: { testid: 'btn-stage-start' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                deps.onStartBattle();
              },
            }),
          ],
        }),
      ],
    });

    root.append(
      header,
      el('div', {
        className: 'menu-workspace',
        children: [
          el('div', { className: 'menu-scroll-pane', children: [stageList] }),
          detailPane,
        ],
      }),
    );
  };

  renderContent();
  return root;
}
