import type { Catalog, DraftModalState, HudSnapshot } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { iconUrl, resolveDraftSynergy } from '../app/formatters.ts';

export interface DraftModalDeps {
  catalog: Catalog;
  draft: DraftModalState;
  hud: HudSnapshot;
  onChoose: (optionId: string) => void;
  onBanish: (optionId: string) => void;
  onReroll: () => void;
  onSkip: () => void;
  onToggleBanish: () => void;
}

export function renderDraftModal(deps: DraftModalDeps): HTMLElement {
  const { catalog, draft, hud } = deps;
  const isArcana = draft.mode === 'arcana_select';

  const optionsList = el('div', { className: 'draft-options-list' });
  draft.options.forEach((opt, index) => {
    const iconId =
      opt.kind === 'limit_break' ||
      opt.kind === 'weapon' ||
      opt.kind === 'passive' ||
      opt.kind === 'consumable' ||
      opt.kind === 'arcana'
        ? opt.itemId
        : 'coin';

    const synergy = resolveDraftSynergy(opt, hud.weapons, hud.passives, catalog);

    let levelBadge: HTMLElement;
    if (draft.banishModeActive) {
      levelBadge = el('span', { className: 'tag-badge tag-badge-crimson', text: '点击放逐此项' });
    } else if (opt.kind === 'limit_break') {
      levelBadge = el('span', { className: 'tag-badge tag-badge-gold num-font', text: `突破 Lv.${opt.nextLevel}` });
    } else if (opt.kind === 'arcana') {
      levelBadge = el('span', { className: 'tag-badge tag-badge-arcana', text: '秘法塔罗' });
    } else if (opt.isNew) {
      levelBadge = el('span', { className: 'tag-badge tag-badge-gold', text: 'NEW!' });
    } else {
      levelBadge = el('span', {
        className: 'tag-badge tag-badge-emerald num-font',
        text: `Lv.${opt.currentLevel} → Lv.${opt.nextLevel}`,
      });
    }

    const card = el('button', {
      className: `draft-card ${draft.banishModeActive ? 'banish-armed' : ''} ${isArcana ? 'arcana-card' : ''}`,
      dataset: { testid: `draft-option-${index}` },
      children: [
        imgIcon(iconUrl(iconId), opt.title, 'draft-card-icon'),
        el('div', {
          className: 'draft-card-content',
          children: [
            el('div', {
              className: 'draft-card-head',
              children: [
                el('span', { className: 'draft-card-title', text: opt.title }),
                el('div', {
                  className: 'title-meta-pills',
                  children: [
                    levelBadge,
                    el('span', { className: 'draft-key-hint', text: String(index + 1) }),
                  ],
                }),
              ],
            }),
            el('span', { className: 'detail-en', text: opt.subtitle }),
            el('p', { className: 'codex-desc', text: opt.description }),
            synergy
              ? el('div', {
                  className: 'draft-synergy-pill',
                  children: [
                    imgIcon(iconUrl(synergy.partnerId), synergy.partnerName),
                    el('span', {
                      text: synergy.partnerOwned
                        ? `共鸣就绪（已持 ${synergy.partnerName}）→ ${synergy.evolvedName}`
                        : `搭配 ${synergy.partnerName} → ${synergy.evolvedName}`,
                    }),
                  ],
                })
              : null,
          ],
        }),
      ],
      onClick: () => {
        if (draft.banishModeActive) {
          deps.onBanish(opt.optionId);
        } else {
          deps.onChoose(opt.optionId);
        }
      },
    });
    optionsList.appendChild(card);
  });

  const footerActions = el('div', {
    className: 'title-meta-pills',
    children: [
      el('button', {
        className: 'gothic-btn',
        text: `重随 [R] (${draft.rerollsRemaining})`,
        attrs: { disabled: draft.rerollsRemaining <= 0 },
        dataset: { testid: 'btn-draft-reroll' },
        onClick: () => deps.onReroll(),
      }),
      !isArcana
        ? el('button', {
            className: 'gothic-btn',
            text: `跳过 [X] (${draft.skipsRemaining})`,
            attrs: { disabled: draft.skipsRemaining <= 0 },
            dataset: { testid: 'btn-draft-skip' },
            onClick: () => deps.onSkip(),
          })
        : null,
      !isArcana
        ? el('button', {
            className: `gothic-btn ${draft.banishModeActive ? 'gothic-btn-danger' : ''}`,
            text: `${draft.banishModeActive ? '取消放逐 [B]' : `放逐 [B] (${draft.banishesRemaining})`}`,
            attrs: { disabled: !draft.banishModeActive && draft.banishesRemaining <= 0 },
            dataset: { testid: 'btn-draft-banish' },
            onClick: () => deps.onToggleBanish(),
          })
        : null,
    ],
  });

  return el('div', {
    className: 'modal-backdrop',
    dataset: { testid: isArcana ? 'modal-arcana-draft' : 'modal-level-up' },
    children: [
      el('div', {
        className: `modal-dialog draft-dialog ${isArcana ? 'arcana-theme' : ''}`,
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', {
                    className: 'modal-title',
                    text: isArcana
                      ? '命运塔罗 · 选择秘法牌'
                      : draft.banishModeActive
                        ? '放逐模式 · 选择要移出的装备'
                        : `等级提升 · Lv.${draft.playerLevel}`,
                  }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: isArcana
                      ? 'ARCANA TAROT DRAFT · 按数字键 1-4 或手柄 A 确认 / X 重随'
                      : 'LEVEL UP · 按数字键 1-4 或手柄 A 选择 / X 重随 / Y 放逐',
                  }),
                ],
              }),
              el('span', {
                className: `tag-badge ${isArcana ? 'tag-badge-arcana' : 'tag-badge-gold'}`,
                text: isArcana ? 'TAROT' : `Lv.${draft.playerLevel}`,
              }),
            ],
          }),
          el('div', { className: 'modal-body', children: [optionsList] }),
          el('footer', {
            className: 'modal-footer',
            children: [
              el('span', {
                className: 'codex-desc',
                text: draft.banishModeActive
                  ? '放逐后该装备在本局将不再出现。'
                  : '提示：持有同进化配方武器/被动时，卡牌下方会高亮显示进化共鸣。',
              }),
              footerActions,
            ],
          }),
        ],
      }),
    ],
  });
}
