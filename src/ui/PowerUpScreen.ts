import { POWERUP_IDS } from '../contracts/ids.ts';
import type { AudioCue, Catalog } from '../contracts/index.ts';
import { computePowerUpNextCost, type SaveStore } from '../core/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatInt, iconUrl } from '../app/formatters.ts';

export interface PowerUpScreenDeps {
  catalog: Catalog;
  saveStore: SaveStore;
  onBack: () => void;
  onCue: (cue: AudioCue) => void;
}

export function renderPowerUpScreen(deps: PowerUpScreenDeps): HTMLElement {
  const { catalog, saveStore, onCue } = deps;
  const root = el('div', {
    className: 'menu-screen',
    dataset: { testid: 'screen-powerups' },
  });

  const renderContent = (): void => {
    root.replaceChildren();
    const state = saveStore.getState();
    const totalRanks = saveStore.getTotalPowerUpRanks();
    const refundTotal = saveStore.getTotalPowerUpRefund();

    const header = el('header', {
      className: 'menu-header',
      children: [
        el('div', {
          className: 'menu-header-left',
          children: [
            el('button', {
              className: 'gothic-btn',
              text: '← 返回主页',
              dataset: { testid: 'btn-powerups-back' },
              onClick: () => {
                onCue({ type: 'ui_click' });
                deps.onBack();
              },
            }),
            el('div', {
              className: 'menu-heading-wrap',
              children: [
                el('h2', { className: 'menu-heading', text: '永久强化祭坛' }),
                el('p', {
                  className: 'menu-subheading',
                  text: `已激活强化等级 ${totalRanks} 级 · 费用随总购买次数递增`,
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
              dataset: { testid: 'powerups-gold-counter' },
              children: [
                imgIcon(iconUrl('coin'), '金币'),
                el('span', { className: 'num-font', text: `${formatInt(state.gold)} G` }),
              ],
            }),
          ],
        }),
      ],
    });

    const summaryBar = el('div', {
      className: 'gothic-panel powerup-summary-bar',
      children: [
        el('span', {
          className: 'codex-desc',
          text:
            totalRanks > 0
              ? `当前已投入 ${formatInt(refundTotal)} 金币（支持随时全额退还并重置构建）。`
              : '选择下方祭坛祝福以永久增强全部英雄。所有强化均支持 100% 全额退还金币。',
        }),
        el('button', {
          className: 'gothic-btn gothic-btn-danger',
          text: `重置全部强化 (+${formatInt(refundTotal)} G)`,
          attrs: { disabled: totalRanks === 0 },
          dataset: { testid: 'btn-powerups-refund' },
          onClick: () => {
            const res = saveStore.refundPowerUps();
            if (res.clearedRanks > 0) {
              onCue({ type: 'ui_buy' });
              renderContent();
            }
          },
        }),
      ],
    });

    const grid = el('div', { className: 'powerup-grid' });
    for (const id of POWERUP_IDS) {
      const def = catalog.powerUps[id];
      const rank = saveStore.getPowerUpRank(id);
      const isMaxed = rank >= def.maxRank;
      const nextCost = isMaxed ? null : computePowerUpNextCost(id, rank, totalRanks, catalog);
      const canBuy = nextCost !== null && state.gold >= nextCost;

      const pips = el('div', { className: 'powerup-pips' });
      for (let i = 0; i < def.maxRank; i++) {
        pips.appendChild(
          el('span', { className: `powerup-pip ${i < rank ? 'filled' : ''}` }),
        );
      }

      const card = el('div', {
        className: `powerup-card ${isMaxed ? 'maxed' : ''}`,
        dataset: { testid: `powerup-card-${id}` },
        children: [
          el('div', {
            className: 'powerup-head',
            children: [
              imgIcon(iconUrl(id), def.name, 'powerup-icon'),
              el('div', {
                className: 'codex-info',
                children: [
                  el('span', { className: 'codex-name', text: def.name }),
                  el('span', { className: 'detail-en', text: def.englishName }),
                ],
              }),
              el('span', {
                className: 'tag-badge tag-badge-gold num-font',
                dataset: { testid: `powerup-rank-${id}` },
                text: `${rank}/${def.maxRank}`,
              }),
            ],
          }),
          el('p', { className: 'codex-desc', text: def.description }),
          pips,
          el('div', {
            className: 'powerup-buy-row',
            children: [
              el('span', {
                className: 'num-font',
                text: isMaxed ? 'MAX' : `${formatInt(nextCost!)} G`,
              }),
              el('button', {
                className: `gothic-btn ${canBuy ? 'gothic-btn-gold' : ''}`,
                text: isMaxed ? '已满级' : '购买强化',
                attrs: { disabled: isMaxed || !canBuy },
                dataset: { testid: `btn-buy-powerup-${id}` },
                onClick: () => {
                  const res = saveStore.buyPowerUp(id);
                  if (res.ok) {
                    onCue({ type: 'ui_buy' });
                    renderContent();
                  } else {
                    onCue({ type: 'ui_error' });
                  }
                },
              }),
            ],
          }),
        ],
      });
      grid.appendChild(card);
    }

    root.append(
      header,
      el('div', {
        className: 'powerup-workspace',
        children: [summaryBar, grid],
      }),
    );
  };

  renderContent();
  return root;
}
