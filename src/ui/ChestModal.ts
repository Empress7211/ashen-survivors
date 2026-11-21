import type { ChestModalState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatInt, iconUrl } from '../app/formatters.ts';

export interface ChestModalDeps {
  chest: ChestModalState;
  onClose: () => void;
}

export interface ChestModalHandle {
  element: HTMLElement;
  canSkipNow: () => boolean;
  dispose: () => void;
}

export function renderChestModal(deps: ChestModalDeps): ChestModalHandle {
  const { chest } = deps;
  const openedAt = performance.now();
  const minWaitMs = 1000;

  const closeBtn = el('button', {
    className: 'gothic-btn gothic-btn-gold',
    text: '开启宝箱中...',
    attrs: { disabled: true },
    dataset: { testid: 'btn-close-chest' },
    onClick: () => {
      if (performance.now() - openedAt >= minWaitMs) {
        deps.onClose();
      }
    },
  });

  const timerId = window.setTimeout(() => {
    closeBtn.disabled = false;
    closeBtn.textContent = '收下全部宝物 (Space / Enter)';
  }, minWaitMs);

  const itemsGrid = el('div', { className: 'chest-items-grid' });
  chest.items.forEach((item, index) => {
    const iconId = item.itemId ?? 'rich_gold_bag';
    const card = el('div', {
      className: `chest-reward-card ${item.isEvolution ? 'evolution' : ''}`,
      children: [
        item.isEvolution
          ? el('span', { className: 'tag-badge tag-badge-crimson', text: '超武进化觉醒!' })
          : item.kind === 'limit_break'
            ? el('span', { className: 'tag-badge tag-badge-gold', text: '极限突破' })
            : null,
        imgIcon(iconUrl(iconId), item.title),
        el('span', { className: 'codex-name', text: item.title }),
        item.newLevel !== undefined
          ? el('span', { className: 'tag-badge tag-badge-gold num-font', text: `Lv.${item.newLevel}` })
          : null,
        el('p', { className: 'codex-desc', text: item.description }),
      ],
    });
    card.style.animationDelay = `${index * 160}ms`;
    itemsGrid.appendChild(card);
  });

  const tierTitle =
    chest.itemCount === 5
      ? '五连辉煌大奖！'
      : chest.itemCount === 3
        ? '三连秘宝宝箱！'
        : '暗夜宝箱开启';

  const chestImgId = `chest_${chest.tier}` as const;

  const element = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-chest' },
    children: [
      el('div', {
        className: `modal-dialog chest-dialog tier-${chest.tier}`,
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', { className: 'modal-title', text: tierTitle }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `${chest.tier.toUpperCase()} CHEST · ${chest.itemCount} ITEM JACKPOT`,
                  }),
                ],
              }),
              el('span', {
                className: 'gold-pill',
                children: [
                  imgIcon(iconUrl('coin'), '金币'),
                  el('span', { className: 'num-font', text: `+${formatInt(chest.bonusGold)} G` }),
                ],
              }),
            ],
          }),
          el('div', {
            className: 'modal-body',
            children: [
              el('div', {
                className: 'chest-stage',
                children: [
                  el('div', { className: 'chest-beams' }),
                  imgIcon(iconUrl(chestImgId), '宝箱', 'chest-sprite'),
                ],
              }),
              itemsGrid,
            ],
          }),
          el('footer', {
            className: 'modal-footer',
            children: [
              el('span', { className: 'codex-desc', text: '1 秒后可按 Space / Enter 或点击关闭' }),
              closeBtn,
            ],
          }),
        ],
      }),
    ],
  });

  element.addEventListener('click', (ev) => {
    if (ev.target === element && performance.now() - openedAt >= minWaitMs) {
      deps.onClose();
    }
  });

  return {
    element,
    canSkipNow: () => performance.now() - openedAt >= minWaitMs,
    dispose: () => window.clearTimeout(timerId),
  };
}
