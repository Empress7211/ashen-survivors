import type { AudioCue, SaveState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatInt, iconUrl } from '../app/formatters.ts';

export interface TitleScreenDeps {
  saveState: SaveState;
  onStartHunt: () => void;
  onOpenPowerUps: () => void;
  onOpenCollection: () => void;
  onOpenBestiary: () => void;
  onOpenAchievements: () => void;
  onOpenShareProfile?: () => void;
  onOpenSettings: () => void;
  onCue: (cue: AudioCue) => void;
}

export function renderTitleScreen(deps: TitleScreenDeps): HTMLElement {
  const { saveState, onCue } = deps;

  const embers = el('div', { className: 'title-embers', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < 18; i++) {
    const size = 3 + (i % 4) * 1.5;
    const ember = el('span', { className: 'ember-particle' });
    ember.style.left = `${((i * 19 + 7) % 96) + 2}%`;
    ember.style.width = `${size}px`;
    ember.style.height = `${size}px`;
    ember.style.setProperty('--ember-duration', `${7 + (i % 6) * 1.4}s`);
    ember.style.setProperty('--ember-delay', `${-((i * 1.3) % 9)}s`);
    ember.style.setProperty('--ember-drift', `${(i % 2 === 0 ? 1 : -1) * (14 + (i % 5) * 9)}px`);
    embers.appendChild(ember);
  }

  const makeNavBtn = (
    label: string,
    testId: string,
    onClick: () => void,
    extraClass = 'title-nav-btn',
  ): HTMLButtonElement => {
    const btn = el('button', {
      className: `gothic-btn ${extraClass}`,
      text: label,
      dataset: { testid: testId },
      onClick: () => {
        onCue({ type: 'ui_click' });
        onClick();
      },
    });
    btn.addEventListener('mouseenter', () => onCue({ type: 'ui_hover' }));
    return btn;
  };

  return el('div', {
    className: 'title-screen',
    dataset: { testid: 'screen-title' },
    children: [
      embers,
      el('header', {
        className: 'title-topbar',
        children: [
          el('div', {
            className: 'title-meta-pills',
            children: [
              el('span', {
                className: 'meta-pill',
                children: [
                  '累计讨伐 ',
                  el('strong', { className: 'num-font', text: formatInt(saveState.totalKills) }),
                ],
              }),
              el('span', {
                className: 'meta-pill',
                children: [
                  '成就 ',
                  el('strong', {
                    className: 'num-font',
                    text: `${saveState.unlockedAchievements.length}`,
                  }),
                ],
              }),
            ],
          }),
          el('div', {
            className: 'gold-pill',
            dataset: { testid: 'title-gold-counter' },
            children: [
              imgIcon(iconUrl('coin'), '金币'),
              el('span', { className: 'num-font', text: `${formatInt(saveState.gold)} G` }),
            ],
          }),
        ],
      }),
      el('main', {
        className: 'title-center',
        children: [
          el('div', {
            className: 'title-crest',
            children: [
              el('span', { className: 'title-crest-eyebrow', text: 'WEB HD EDITION · VAMPIRE SURVIVORS' }),
              el('h1', { className: 'title-main-heading', text: '《灰烬之夜》' }),
              el('p', { className: 'title-en-heading', text: 'ASHEN SURVIVORS' }),
              el('p', {
                className: 'title-tagline',
                text: '踏入无尽尸潮、觉醒超武进化、以圣物与秘法逆转暗夜死局。',
              }),
            ],
          }),
          el('div', {
            className: 'title-actions-deck',
            children: [
              makeNavBtn('开始狩猎', 'btn-start-hunt', deps.onStartHunt, 'gothic-btn-primary title-start-btn'),
              el('div', {
                className: 'title-nav-grid',
                children: [
                  makeNavBtn('强化祭坛', 'btn-powerups', deps.onOpenPowerUps),
                  makeNavBtn('藏品与魔典', 'btn-collection', deps.onOpenCollection),
                  makeNavBtn('怪物图鉴', 'btn-bestiary', deps.onOpenBestiary),
                  makeNavBtn('成就圣典', 'btn-achievements', deps.onOpenAchievements),
                  deps.onOpenShareProfile
                    ? makeNavBtn('战绩分享卡', 'btn-share-profile', deps.onOpenShareProfile)
                    : null,
                  makeNavBtn('设置与存档', 'btn-settings', deps.onOpenSettings),
                ],
              }),
            ],
          }),
        ],
      }),
      el('footer', {
        className: 'title-footer',
        children: [
          el('span', { text: '操作：WASD / 方向键 / 手柄 / 左下虚拟摇杆移动 · 武器自动释放 · 空格 / Esc 暂停' }),
          el('span', { className: 'num-font', text: '16 HEROES · 34 WEAPONS · 5 STAGES · 12 ARCANAS' }),
        ],
      }),
    ],
  });
}
