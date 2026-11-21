import type { Catalog, SettlementModalState } from '../contracts/index.ts';
import { el, imgIcon } from '../app/dom.ts';
import { formatAchievementRewardTags, formatClock, formatInt, iconUrl } from '../app/formatters.ts';

export interface SettlementModalDeps {
  catalog: Catalog;
  settlement: SettlementModalState;
  onReturnMenu: () => void;
}

export function renderSettlementModal(deps: SettlementModalDeps): HTMLElement {
  const { catalog, settlement } = deps;
  const hero = catalog.heroes[settlement.heroId];
  const stage = catalog.stages[settlement.stageId];
  const achById = new Map(catalog.achievements.map((a) => [a.id, a]));

  const maxWeaponDamage = Math.max(
    1,
    ...settlement.weaponBreakdown.map((w) => w.totalDamage),
  );

  const tableRows = settlement.weaponBreakdown.map((wb) => {
    const sharePct = Math.max(0, Math.min(100, (wb.totalDamage / maxWeaponDamage) * 100));
    return el('tr', {
      children: [
        el('td', {
          children: [
            el('div', {
              className: 'hud-boss-head-left',
              children: [
                imgIcon(iconUrl(wb.weaponId), wb.name),
                el('span', { text: wb.name }),
                wb.isEvolved
                  ? el('span', { className: 'tag-badge tag-badge-crimson', text: '超武' })
                  : null,
              ],
            }),
          ],
        }),
        el('td', { className: 'num', text: `Lv.${wb.level}` }),
        el('td', { className: 'num', text: formatClock(wb.activeSeconds) }),
        el('td', {
          className: 'num',
          children: [
            formatInt(wb.totalDamage),
            el('div', {
              className: 'dps-share-bar',
              children: [
                el('div', {
                  className: 'dps-share-fill',
                  attrs: { style: `width:${sharePct.toFixed(1)}%` },
                }),
              ],
            }),
          ],
        }),
        el('td', { className: 'num', text: wb.dps.toFixed(1) }),
      ],
    });
  });

  const unlockedAchCards = settlement.unlockedAchievements
    .map((id) => achById.get(id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((ach) =>
      el('div', {
        className: 'codex-card',
        children: [
          el('div', {
            className: 'codex-info',
            children: [
              el('span', { className: 'codex-name', text: `🏆 ${ach.name}` }),
              el('span', { className: 'codex-desc', text: ach.description }),
              el('div', {
                className: 'title-meta-pills',
                children: formatAchievementRewardTags(ach.reward, catalog).map((tag) =>
                  el('span', { className: 'tag-badge tag-badge-gold', text: tag }),
                ),
              }),
            ],
          }),
        ],
      }),
    );

  return el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-settlement' },
    children: [
      el('div', {
        className: 'modal-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', {
                    className: 'modal-title',
                    text: settlement.victory ? '狩猎凯旋 · 黎明降临' : '战局结算 · 灰烬余晖',
                  }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: `${stage.name} · ${hero.name}${settlement.causeOfDeath ? ` · 终结原因：${settlement.causeOfDeath}` : ''}`,
                  }),
                ],
              }),
              el('span', {
                className: `tag-badge ${settlement.victory ? 'tag-badge-emerald' : 'tag-badge-crimson'}`,
                text: settlement.victory ? 'VICTORY' : 'RUN ENDED',
              }),
            ],
          }),
          el('div', {
            className: 'modal-body',
            children: [
              el('div', {
                className: 'settlement-summary-grid',
                children: [
                  el('div', {
                    className: 'settlement-metric',
                    children: [
                      el('span', { className: 'settlement-metric-label', text: '存活时间' }),
                      el('span', { className: 'settlement-metric-val', text: formatClock(settlement.elapsedSeconds) }),
                    ],
                  }),
                  el('div', {
                    className: 'settlement-metric',
                    children: [
                      el('span', { className: 'settlement-metric-label', text: '最终等级' }),
                      el('span', { className: 'settlement-metric-val', text: `Lv.${settlement.level}` }),
                    ],
                  }),
                  el('div', {
                    className: 'settlement-metric',
                    children: [
                      el('span', { className: 'settlement-metric-label', text: '击败魔物' }),
                      el('span', { className: 'settlement-metric-val', text: formatInt(settlement.kills) }),
                    ],
                  }),
                  el('div', {
                    className: 'settlement-metric',
                    children: [
                      el('span', { className: 'settlement-metric-label', text: '获得金币' }),
                      el('span', { className: 'settlement-metric-val', text: `+${formatInt(settlement.goldEarned)} G` }),
                    ],
                  }),
                ],
              }),
              unlockedAchCards.length > 0
                ? el('div', {
                    className: 'pause-section',
                    attrs: { style: 'margin-bottom: 14px;' },
                    children: [
                      el('h3', { className: 'pause-section-title', text: '本局新解锁成就' }),
                      el('div', { className: 'codex-grid', children: unlockedAchCards }),
                    ],
                  })
                : null,
              el('div', {
                className: 'dps-table-wrap',
                dataset: { testid: 'settlement-dps-table' },
                children: [
                  el('table', {
                    className: 'dps-table',
                    children: [
                      el('thead', {
                        children: [
                          el('tr', {
                            children: [
                              el('th', { text: '武器名称' }),
                              el('th', { className: 'num', text: '等级' }),
                              el('th', { className: 'num', text: '活跃时长' }),
                              el('th', { className: 'num', text: '总伤害' }),
                              el('th', { className: 'num', text: '秒伤 (DPS)' }),
                            ],
                          }),
                        ],
                      }),
                      el('tbody', { children: tableRows }),
                    ],
                  }),
                ],
              }),
            ],
          }),
          el('footer', {
            className: 'modal-footer',
            children: [
              el('span', { className: 'codex-desc', text: '战局收获已自动记入本地档案。' }),
              el('button', {
                className: 'gothic-btn gothic-btn-gold',
                text: '返回主菜单',
                dataset: { testid: 'btn-settlement-menu' },
                onClick: () => deps.onReturnMenu(),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
