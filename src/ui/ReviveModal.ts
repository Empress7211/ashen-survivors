import type { HeroId, ReviveModalState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatClock, iconUrl } from '../app/formatters.ts';

export interface ReviveModalDeps {
  heroId: HeroId;
  revive: ReviveModalState;
  onRevive: () => void;
  onForfeit: () => void;
}

export function renderReviveModal(deps: ReviveModalDeps): HTMLElement {
  const { heroId, revive } = deps;

  return el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-revive' },
    children: [
      el('div', {
        className: 'modal-dialog chest-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', { className: 'modal-title', text: '濒临陨落 · 灰烬抉择' }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `${revive.heroName} · 坚持至 ${formatClock(revive.elapsedSeconds)}`,
                  }),
                ],
              }),
              el('span', {
                className: 'tag-badge tag-badge-gold num-font',
                text: `剩余复活次数：${revive.revivalsRemaining}`,
              }),
            ],
          }),
          el('div', {
            className: 'modal-body',
            children: [
              el('div', {
                className: 'detail-hero-head',
                attrs: { style: 'justify-content:center; flex-direction:column;' },
                children: [
                  imgIcon(iconUrl(heroId), revive.heroName, 'detail-portrait'),
                  el('p', {
                    className: 'detail-lore',
                    text: '消耗一次复活机会并以 50% 生命值及震退冲击波重返战场，或立刻结算当前战果。',
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
                text: '放弃并结算',
                dataset: { testid: 'btn-revive-forfeit' },
                onClick: () => deps.onForfeit(),
              }),
              el('button', {
                className: 'gothic-btn gothic-btn-gold',
                text: `浴火重生 (剩余 ${revive.revivalsRemaining})`,
                dataset: { testid: 'btn-revive-confirm' },
                onClick: () => deps.onRevive(),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
