import { HERO_IDS, STAGE_IDS } from '../contracts/ids.ts';
import type {
  AudioCue,
  Catalog,
  FunModeSettings,
  SaveState,
  SettlementModalState,
} from '../contracts/index.ts';
import { formatFunModeBadge } from '../core/index.ts';
import { el } from '../app/dom.ts';
import { formatClock, formatInt, iconUrl, stageBgUrl } from '../app/formatters.ts';
import { drawQrCodeOnCanvas } from './qrCode.ts';

export const SHARE_GAME_URL = 'https://survive.ilovesjtu.com';
const POSTER_W = 1080;
const POSTER_H = 1350;
const FONT_SC = "'Noto Serif SC', 'Cinzel', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Georgia, serif";
const FONT_NUM = "'Cinzel', 'Noto Serif SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Georgia, serif";

export interface SettlementSharePayload {
  kind: 'settlement';
  catalog: Catalog;
  settlement: SettlementModalState;
  runMeta?: {
    hyper?: boolean;
    hurry?: boolean;
    endless?: boolean;
    endlessCycle?: number;
    funMode?: FunModeSettings;
  };
  shareUrl?: string;
  onClose: () => void;
  onCue?: (cue: AudioCue) => void;
}

export interface ProfileSharePayload {
  kind: 'profile';
  catalog: Catalog;
  saveState: SaveState;
  shareUrl?: string;
  onClose: () => void;
  onCue?: (cue: AudioCue) => void;
}

export type ShareCardModalDeps = SettlementSharePayload | ProfileSharePayload;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle: string | CanvasGradient,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  strokeStyle: string | CanvasGradient,
  lineWidth = 1.5,
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1,
): void {
  const iw = Math.max(1, img.naturalWidth || img.width);
  const ih = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) * 0.5;
  const dy = y + (h - dh) * 0.5;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function drawContainedIcon(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
): void {
  if (!img) return;
  const iw = Math.max(1, img.naturalWidth || img.width);
  const ih = Math.max(1, img.naturalHeight || img.height);
  const scale = Math.min(size / iw, size / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, x + (size - dw) * 0.5, y + (size - dh) * 0.5, dw, dh);
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function drawBadgePill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  fill: string,
  stroke: string,
  textColor: string,
  font = "700 18px 'Cinzel', 'Noto Serif SC', Georgia, serif",
): number {
  ctx.save();
  ctx.font = font;
  const textW = ctx.measureText(label).width;
  const w = Math.ceil(textW + 26);
  const h = 34;
  fillRoundRect(ctx, x, y, w, h, 999, fill);
  strokeRoundRect(ctx, x, y, w, h, 999, stroke, 1.5);
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w * 0.5, y + h * 0.5 + 1);
  ctx.restore();
  return w;
}

function drawCornerDiamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.fillStyle = '#f4d87d';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function buildShareCaption(deps: ShareCardModalDeps): string {
  const url = deps.shareUrl ?? SHARE_GAME_URL;
  if (deps.kind === 'settlement') {
    const s = deps.settlement;
    const hero = deps.catalog.heroes[s.heroId];
    const stage = deps.catalog.stages[s.stageId];
    const badge = formatFunModeBadge(deps.runMeta?.funMode);
    const topWeapon = [...s.weaponBreakdown].sort((a, b) => b.totalDamage - a.totalDamage)[0];
    const outcome = s.victory ? '凯旋通关' : '血战落幕';
    const topStr = topWeapon ? `，主力输出「${topWeapon.name}」打出 ${formatInt(topWeapon.totalDamage)} 伤害` : '';
    return `我在《灰烬之夜》[${badge.label}] 使用「${hero.name}」在「${stage.name}」${outcome}！存活 ${formatClock(s.elapsedSeconds)}、Lv.${s.level}、讨伐 ${formatInt(s.kills)} 魔物${topStr}。电脑/手机/手柄免下载直接开玩 👉 ${url} #灰烬之夜 #吸血鬼幸存者 #网页游戏`;
  }

  const st = deps.saveState;
  const hero = deps.catalog.heroes[st.selectedHeroId];
  return `我的《灰烬之夜》猎魔人档案：已累计讨伐 ${formatInt(st.totalKills)} 只魔物、征战 ${formatInt(st.totalRuns)} 局、解锁 ${st.purchasedHeroes.length}/${HERO_IDS.length} 名英雄与 ${st.unlockedAchievements.length}/${deps.catalog.achievements.length} 项成就（当前出战：${hero.name}）！免下载点开即玩 👉 ${url} #灰烬之夜 #吸血鬼幸存者 #网页游戏`;
}

async function renderPosterCanvas(deps: ShareCardModalDeps): Promise<HTMLCanvasElement> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed even if document.fonts rejects in restricted test environments
    }
  }

  const shareUrl = deps.shareUrl ?? SHARE_GAME_URL;
  const canvas = document.createElement('canvas');
  canvas.width = POSTER_W;
  canvas.height = POSTER_H;
  const ctx = canvas.getContext('2d')!;

  const isSettlement = deps.kind === 'settlement';
  const heroId = isSettlement ? deps.settlement.heroId : deps.saveState.selectedHeroId;
  const hero = deps.catalog.heroes[heroId];

  const topWeapons = isSettlement
    ? [...deps.settlement.weaponBreakdown]
        .sort((a, b) => b.totalDamage - a.totalDamage)
        .slice(0, 5)
    : [];

  const bgSrc = isSettlement
    ? stageBgUrl(deps.settlement.stageId)
    : '/assets/ui/title-bg.jpg';

  const [bgImg, heroImg, ...weaponImgs] = await Promise.all([
    loadImage(bgSrc),
    loadImage(iconUrl(heroId)),
    ...topWeapons.map((w) => loadImage(iconUrl(w.weaponId))),
  ]);

  // 1. Atmospheric Gothic Background
  ctx.fillStyle = '#09070e';
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  if (bgImg) {
    drawCoverImage(ctx, bgImg, 0, 0, POSTER_W, POSTER_H, 0.24);
  }

  const topGlow = ctx.createRadialGradient(POSTER_W * 0.5, 110, 40, POSTER_W * 0.5, 180, 680);
  topGlow.addColorStop(0, isSettlement && deps.settlement.victory ? 'rgba(212, 175, 55, 0.24)' : 'rgba(186, 32, 52, 0.26)');
  topGlow.addColorStop(0.55, 'rgba(16, 12, 24, 0.58)');
  topGlow.addColorStop(1, 'rgba(7, 6, 11, 0.96)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, POSTER_W, POSTER_H);

  // Outer & Inner Ornate Frames
  strokeRoundRect(ctx, 24, 24, POSTER_W - 48, POSTER_H - 48, 22, 'rgba(212, 175, 55, 0.55)', 2);
  strokeRoundRect(ctx, 36, 36, POSTER_W - 72, POSTER_H - 72, 16, 'rgba(212, 175, 55, 0.22)', 1);
  drawCornerDiamond(ctx, 36, 36, 7);
  drawCornerDiamond(ctx, POSTER_W - 36, 36, 7);
  drawCornerDiamond(ctx, 36, POSTER_H - 36, 7);
  drawCornerDiamond(ctx, POSTER_W - 36, POSTER_H - 36, 7);

  // 2. Top Crest & Outcome Banner
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d4af37';
  ctx.font = "600 18px 'Cinzel', 'Noto Serif SC', Georgia, serif";
  ctx.fillText('WEB HD EDITION · VAMPIRE SURVIVORS', POSTER_W * 0.5, 76);

  ctx.fillStyle = '#f8ecd4';
  ctx.font = `700 48px ${FONT_SC}`;
  ctx.fillText('《灰烬之夜》战报圣典', POSTER_W * 0.5, 130);

  ctx.fillStyle = '#b9acc4';
  ctx.font = "600 19px 'Cinzel', Georgia, serif";
  ctx.fillText('ASHEN SURVIVORS', POSTER_W * 0.5, 174);

  const badgeLabel = isSettlement
    ? deps.settlement.victory
      ? '🏆 狩猎凯旋 · VICTORY'
      : '⚔ 血战余晖 · BATTLE REPORT'
    : '📜 猎魔人档案 · HUNTER DOSSIER';
  const badgeFill = isSettlement && deps.settlement.victory
    ? 'rgba(32, 92, 68, 0.55)'
    : isSettlement
      ? 'rgba(130, 24, 38, 0.55)'
      : 'rgba(110, 82, 24, 0.45)';
  const badgeStroke = isSettlement && deps.settlement.victory
    ? 'rgba(96, 227, 170, 0.78)'
    : isSettlement
      ? 'rgba(224, 60, 73, 0.8)'
      : 'rgba(244, 216, 125, 0.78)';
  const badgeText = isSettlement && deps.settlement.victory
    ? '#8ef2c4'
    : isSettlement
      ? '#ffc1c7'
      : '#f7dfa0';

  ctx.font = "700 20px 'Noto Serif SC', 'Cinzel', Georgia, serif";
  const bw = Math.ceil(ctx.measureText(badgeLabel).width + 44);
  fillRoundRect(ctx, (POSTER_W - bw) * 0.5, 204, bw, 40, 999, badgeFill);
  strokeRoundRect(ctx, (POSTER_W - bw) * 0.5, 204, bw, 40, 999, badgeStroke, 1.5);
  ctx.fillStyle = badgeText;
  ctx.fillText(badgeLabel, POSTER_W * 0.5, 225);

  // 3. Hero & Stage Card (y = 266..418)
  const cardX = 64;
  const cardW = POSTER_W - 128;
  fillRoundRect(ctx, cardX, 266, cardW, 146, 16, 'rgba(18, 15, 26, 0.88)');
  strokeRoundRect(ctx, cardX, 266, cardW, 146, 16, 'rgba(212, 175, 55, 0.4)', 1.5);

  // Portrait Box
  fillRoundRect(ctx, cardX + 22, 285, 108, 108, 14, 'rgba(10, 9, 14, 0.96)');
  strokeRoundRect(ctx, cardX + 22, 285, 108, 108, 14, 'rgba(244, 216, 125, 0.68)', 2);
  drawContainedIcon(ctx, heroImg, cardX + 30, 293, 92);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4d87d';
  ctx.font = "700 30px 'Noto Serif SC', 'Cinzel', Georgia, serif";
  ctx.fillText(hero.name, cardX + 150, 312);

  ctx.fillStyle = '#a79bb5';
  ctx.font = "500 18px 'Cinzel', 'Noto Serif SC', Georgia, serif";
  ctx.fillText(`${hero.englishName} · ${hero.title}`, cardX + 150, 346);

  if (isSettlement) {
    const stage = deps.catalog.stages[deps.settlement.stageId];
    const funBadge = formatFunModeBadge(deps.runMeta?.funMode);
    const funColors: Record<'crimson' | 'emerald' | 'arcana' | 'gold', [string, string, string]> = {
      crimson: ['rgba(168, 30, 42, 0.34)', 'rgba(224, 60, 73, 0.72)', '#ffb3ba'],
      emerald: ['rgba(32, 118, 82, 0.36)', 'rgba(96, 227, 170, 0.74)', '#8ef2c4'],
      arcana: ['rgba(104, 58, 170, 0.36)', 'rgba(180, 140, 255, 0.74)', '#e2ccff'],
      gold: ['rgba(160, 122, 32, 0.36)', 'rgba(244, 216, 125, 0.76)', '#f7dfa0'],
    };
    const [fFill, fStroke, fText] = funColors[funBadge.tone];

    let pillX = cardX + 150;
    pillX += drawBadgePill(
      ctx,
      pillX,
      366,
      stage.name,
      'rgba(212, 175, 55, 0.16)',
      'rgba(212, 175, 55, 0.58)',
      '#f4d87d',
      `600 17px ${FONT_SC}`,
    ) + 10;
    pillX += drawBadgePill(
      ctx,
      pillX,
      366,
      funBadge.label,
      fFill,
      fStroke,
      fText,
      `700 17px ${FONT_SC}`,
    ) + 10;
    if (deps.runMeta?.hyper) {
      pillX += drawBadgePill(ctx, pillX, 366, 'HYPER', 'rgba(168, 30, 42, 0.35)', 'rgba(224, 60, 73, 0.72)', '#ffb3ba', `700 17px ${FONT_NUM}`) + 10;
    }
    if (deps.runMeta?.hurry) {
      pillX += drawBadgePill(ctx, pillX, 366, 'HURRY 2X', 'rgba(180, 128, 30, 0.28)', 'rgba(244, 216, 125, 0.65)', '#f4d87d', `700 17px ${FONT_NUM}`) + 10;
    }
    if (deps.runMeta?.endless) {
      const label = deps.runMeta.endlessCycle && deps.runMeta.endlessCycle > 0
        ? `无尽 +${deps.runMeta.endlessCycle}`
        : '无尽模式';
      drawBadgePill(
        ctx,
        pillX,
        366,
        label,
        'rgba(104, 58, 170, 0.35)',
        'rgba(180, 140, 255, 0.7)',
        '#e2ccff',
        `600 17px ${FONT_SC}`,
      );
    }
  } else {
    const unlockedRelics = deps.saveState.unlockedRelics.length;
    let pillX = cardX + 150;
    pillX += drawBadgePill(
      ctx,
      pillX,
      366,
      `已获圣物 ${unlockedRelics}/5 · 图鉴收录 ${deps.saveState.discoveredItems.length}`,
      'rgba(104, 58, 170, 0.3)',
      'rgba(180, 140, 255, 0.62)',
      '#e2ccff',
      `600 17px ${FONT_SC}`,
    ) + 10;
    if (deps.saveState.funMode && deps.saveState.funMode.preset !== 'standard') {
      const funBadge = formatFunModeBadge(deps.saveState.funMode);
      drawBadgePill(
        ctx,
        pillX,
        366,
        `当前模式：${funBadge.label}`,
        'rgba(32, 118, 82, 0.34)',
        'rgba(96, 227, 170, 0.7)',
        '#8ef2c4',
        `600 17px ${FONT_SC}`,
      );
    }
  }

  // 4. Four Highlight Metrics (y = 434..548)
  const metrics = isSettlement
    ? [
        { label: '存活时间', value: formatClock(deps.settlement.elapsedSeconds) },
        { label: '最终等级', value: `Lv.${deps.settlement.level}` },
        { label: '击败魔物', value: formatInt(deps.settlement.kills) },
        { label: '本局金币', value: `+${formatInt(deps.settlement.goldEarned)} G` },
      ]
    : [
        { label: '累计讨伐', value: formatInt(deps.saveState.totalKills) },
        { label: '总出战局数', value: formatInt(deps.saveState.totalRuns) },
        { label: '招募英雄', value: `${deps.saveState.purchasedHeroes.length}/${HERO_IDS.length}` },
        { label: '达成成就', value: `${deps.saveState.unlockedAchievements.length}/${deps.catalog.achievements.length}` },
      ];

  const gap = 16;
  const mW = (cardW - gap * 3) / 4;
  for (let i = 0; i < metrics.length; i++) {
    const m = metrics[i]!;
    const mx = cardX + i * (mW + gap);
    fillRoundRect(ctx, mx, 434, mW, 114, 14, 'rgba(18, 15, 27, 0.92)');
    strokeRoundRect(ctx, mx, 434, mW, 114, 14, 'rgba(212, 175, 55, 0.34)', 1.2);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#9f94ab';
    ctx.font = "500 18px 'Noto Serif SC', Georgia, serif";
    ctx.fillText(m.label, mx + mW * 0.5, 466);

    ctx.fillStyle = '#f4d87d';
    ctx.font = "700 32px 'Cinzel', 'Noto Serif SC', Georgia, serif";
    ctx.fillText(truncateText(ctx, m.value, mW - 18), mx + mW * 0.5, 512);
  }

  // 5. Main Showcase Panel (y = 570..1084)
  fillRoundRect(ctx, cardX, 570, cardW, 512, 16, 'rgba(14, 12, 22, 0.9)');
  strokeRoundRect(ctx, cardX, 570, cardW, 512, 16, 'rgba(212, 175, 55, 0.34)', 1.5);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4d87d';
  ctx.font = "700 24px 'Noto Serif SC', 'Cinzel', Georgia, serif";
  ctx.fillText(
    isSettlement ? '主力武器伤害统计 · WEAPON DPS' : '五大战场最高纪录 · STAGE RECORDS',
    cardX + 26,
    610,
  );

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.24)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cardX + 26, 636);
  ctx.lineTo(cardX + cardW - 26, 636);
  ctx.stroke();

  if (isSettlement) {
    const maxDmg = Math.max(1, ...topWeapons.map((w) => w.totalDamage));
    if (topWeapons.length === 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9f94ab';
      ctx.font = "500 22px 'Noto Serif SC', Georgia, serif";
      ctx.fillText('本局尚未记录有效武器输出', POSTER_W * 0.5, 820);
    } else {
      for (let i = 0; i < topWeapons.length; i++) {
        const wb = topWeapons[i]!;
        const rowY = 654 + i * 74;
        fillRoundRect(ctx, cardX + 24, rowY, cardW - 48, 62, 12, 'rgba(24, 20, 34, 0.85)');
        strokeRoundRect(
          ctx,
          cardX + 24,
          rowY,
          cardW - 48,
          62,
          12,
          wb.isEvolved ? 'rgba(224, 60, 73, 0.48)' : 'rgba(255, 255, 255, 0.08)',
          1,
        );

        drawContainedIcon(ctx, weaponImgs[i] ?? null, cardX + 36, rowY + 9, 44);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#efe4cf';
        ctx.font = "700 22px 'Noto Serif SC', Georgia, serif";
        ctx.fillText(wb.name, cardX + 94, rowY + 24);

        ctx.fillStyle = '#a79bb5';
        ctx.font = "600 16px 'Cinzel', 'Noto Serif SC', Georgia, serif";
        const tagText = wb.isEvolved ? `超武 · Lv.${wb.level}` : `Lv.${wb.level}`;
        ctx.fillText(tagText, cardX + 94, rowY + 48);

        // Progress bar
        const barX = cardX + 340;
        const barW = 350;
        const barY = rowY + 25;
        const ratio = Math.max(0.04, Math.min(1, wb.totalDamage / maxDmg));
        fillRoundRect(ctx, barX, barY, barW, 12, 999, 'rgba(255, 255, 255, 0.1)');
        const barGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        barGrad.addColorStop(0, '#c82b3b');
        barGrad.addColorStop(1, '#f4d87d');
        fillRoundRect(ctx, barX, barY, barW * ratio, 12, 999, barGrad);

        // Damage + DPS right-aligned
        ctx.textAlign = 'right';
        ctx.fillStyle = '#f4d87d';
        ctx.font = "700 22px 'Cinzel', Georgia, serif";
        ctx.fillText(formatInt(wb.totalDamage), cardX + cardW - 40, rowY + 23);

        ctx.fillStyle = '#9f94ab';
        ctx.font = "500 16px 'Cinzel', 'Noto Serif SC', Georgia, serif";
        ctx.fillText(`${wb.dps.toFixed(1)} DPS`, cardX + cardW - 40, rowY + 47);
      }
    }

    const achCount = deps.settlement.unlockedAchievements.length;
    const footerNote = achCount > 0
      ? `🏆 本局额外解锁 ${achCount} 项全新成就！`
      : deps.settlement.causeOfDeath
        ? `终结原因：${deps.settlement.causeOfDeath}`
        : '灰烬不熄 · 随时可在浏览器导入/导出存档继续征程';
    ctx.textAlign = 'center';
    ctx.fillStyle = achCount > 0 ? '#60e3aa' : '#a79bb5';
    ctx.font = "600 20px 'Noto Serif SC', Georgia, serif";
    ctx.fillText(truncateText(ctx, footerNote, cardW - 60), POSTER_W * 0.5, 1052);
  } else {
    for (let i = 0; i < STAGE_IDS.length; i++) {
      const stId = STAGE_IDS[i]!;
      const stDef = deps.catalog.stages[stId];
      const rec = deps.saveState.bestRunByStage[stId];
      const rowY = 656 + i * 78;
      const cleared = (rec?.clears ?? 0) > 0;
      const hyperCleared = Boolean(rec?.hyperCleared);

      fillRoundRect(ctx, cardX + 24, rowY, cardW - 48, 66, 12, 'rgba(24, 20, 34, 0.85)');
      strokeRoundRect(
        ctx,
        cardX + 24,
        rowY,
        cardW - 48,
        66,
        12,
        hyperCleared
          ? 'rgba(224, 60, 73, 0.56)'
          : cleared
            ? 'rgba(212, 175, 55, 0.45)'
            : 'rgba(255, 255, 255, 0.08)',
        1,
      );

      ctx.textAlign = 'left';
      ctx.fillStyle = '#efe4cf';
      ctx.font = "700 22px 'Noto Serif SC', Georgia, serif";
      ctx.fillText(`${i + 1}. ${stDef.name}`, cardX + 42, rowY + 24);

      ctx.fillStyle = '#9f94ab';
      ctx.font = "500 16px 'Cinzel', Georgia, serif";
      ctx.fillText(stDef.englishName, cardX + 42, rowY + 48);

      const badgeTextStr = hyperCleared
        ? 'HYPER ★ 通关'
        : cleared
          ? '普通通关 ✓'
          : rec && rec.bestTimeSeconds > 0
            ? '征战记录'
            : '未涉足';
      drawBadgePill(
        ctx,
        cardX + 350,
        rowY + 16,
        badgeTextStr,
        hyperCleared
          ? 'rgba(168, 30, 42, 0.36)'
          : cleared
            ? 'rgba(54, 179, 126, 0.22)'
            : 'rgba(255, 255, 255, 0.06)',
        hyperCleared
          ? 'rgba(224, 60, 73, 0.72)'
          : cleared
            ? 'rgba(96, 227, 170, 0.65)'
            : 'rgba(255, 255, 255, 0.16)',
        hyperCleared ? '#ffb3ba' : cleared ? '#8ef2c4' : '#9f94ab',
        "600 16px 'Noto Serif SC', Georgia, serif",
      );

      ctx.textAlign = 'right';
      ctx.fillStyle = '#f4d87d';
      ctx.font = "700 22px 'Cinzel', Georgia, serif";
      ctx.fillText(
        rec ? formatClock(rec.bestTimeSeconds) : '--:--',
        cardX + cardW - 42,
        rowY + 24,
      );

      ctx.fillStyle = '#a79bb5';
      ctx.font = "500 16px 'Noto Serif SC', 'Cinzel', Georgia, serif";
      ctx.fillText(
        rec ? `最高 Lv.${rec.bestLevel} · ${formatInt(rec.bestKills)} 击杀` : '等待猎魔人踏入',
        cardX + cardW - 42,
        rowY + 48,
      );
    }
  }

  // 6. Viral Share Footer + Real Scannable QR Code (y = 1106..1294)
  fillRoundRect(ctx, cardX, 1106, cardW, 186, 16, 'rgba(18, 14, 26, 0.95)');
  strokeRoundRect(ctx, cardX, 1106, cardW, 186, 16, 'rgba(212, 175, 55, 0.5)', 1.5);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#f4d87d';
  ctx.font = "700 28px 'Noto Serif SC', Georgia, serif";
  ctx.fillText('免下载 · 打开浏览器即刻开割！', cardX + 30, 1152);

  ctx.fillStyle = '#cfc3d9';
  ctx.font = "500 20px 'Noto Serif SC', Georgia, serif";
  ctx.fillText('支持电脑键鼠 / 手机横竖屏触控 / 游戏手柄 · PWA 离线可玩', cardX + 30, 1192);

  fillRoundRect(ctx, cardX + 30, 1218, 420, 48, 10, 'rgba(212, 175, 55, 0.14)');
  strokeRoundRect(ctx, cardX + 30, 1218, 420, 48, 10, 'rgba(244, 216, 125, 0.65)', 1.5);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = "700 24px 'Cinzel', Georgia, serif";
  ctx.fillText(shareUrl.replace(/^https?:\/\//, ''), cardX + 50, 1244);

  const qrSize = 148;
  const qrX = cardX + cardW - qrSize - 28;
  const qrY = 1125;
  drawQrCodeOnCanvas(ctx, shareUrl, qrX, qrY, qrSize, 3);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#a79bb5';
  ctx.font = "600 14px 'Noto Serif SC', Georgia, serif";
  ctx.fillText('扫码直接游玩', qrX + qrSize * 0.5, 1283);

  return canvas;
}

async function copyTextFallback(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Try execCommand fallback below
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
      return;
    }
    resolve(null);
  });
}

export function renderShareCardModal(deps: ShareCardModalDeps): HTMLElement {
  let closed = false;
  let objectUrl: string | null = null;
  let renderedCanvas: HTMLCanvasElement | null = null;
  let renderedBlob: Blob | null = null;

  const statusBanner = el('div', {
    className: 'status-banner ok',
    dataset: { testid: 'share-status-banner' },
    text: '正在绘制高清战报海报...',
  });

  const previewImg = el('img', {
    className: 'share-card-preview-img',
    attrs: { alt: '灰烬之夜战报分享卡' },
    dataset: { testid: 'share-card-img' },
  }) as HTMLImageElement;

  const previewWrap = el('div', {
    className: 'share-card-preview-wrap',
    children: [previewImg],
  });

  const downloadBtn = el('button', {
    className: 'gothic-btn gothic-btn-gold',
    text: '保存高清海报 (.png)',
    attrs: { disabled: true },
    dataset: { testid: 'btn-share-download' },
    onClick: async () => {
      deps.onCue?.({ type: 'ui_click' });
      const dataHref = renderedBlob
        ? URL.createObjectURL(renderedBlob)
        : renderedCanvas?.toDataURL('image/png') ?? '';
      if (!dataHref) return;
      const a = document.createElement('a');
      a.href = dataHref;
      a.download = `ashen-survivors-${deps.kind}-${Date.now()}.png`;
      a.click();
      if (renderedBlob) {
        window.setTimeout(() => URL.revokeObjectURL(dataHref), 2000);
      }
      statusBanner.className = 'status-banner ok';
      statusBanner.textContent = '已触发下载高清 1080×1350 分享海报！手机端也可长按上方图片保存。';
    },
  });

  const copyImgBtn = el('button', {
    className: 'gothic-btn',
    text: '复制海报图片',
    attrs: { disabled: true },
    dataset: { testid: 'btn-share-copy-img' },
    onClick: async () => {
      deps.onCue?.({ type: 'ui_click' });
      if (!renderedBlob) return;
      try {
        const ClipboardItemCtor = (
          window as unknown as {
            ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem;
          }
        ).ClipboardItem;
        if (ClipboardItemCtor && navigator.clipboard?.write) {
          await navigator.clipboard.write([new ClipboardItemCtor({ 'image/png': renderedBlob })]);
          statusBanner.className = 'status-banner ok';
          statusBanner.textContent = '高清海报已复制到剪贴板，可直接粘贴到微信 / 小红书 / X！';
          return;
        }
      } catch {
        // Fall through to helpful fallback guidance
      }
      statusBanner.className = 'status-banner err';
      statusBanner.textContent = '当前浏览器暂不允许脚本写入图片剪贴板，请点左侧「保存高清海报」或右键/长按图片复制。';
    },
  });

  const copyTextBtn = el('button', {
    className: 'gothic-btn',
    text: '复制晒图配文',
    dataset: { testid: 'btn-share-copy-text' },
    onClick: async () => {
      deps.onCue?.({ type: 'ui_click' });
      const caption = buildShareCaption(deps);
      const ok = await copyTextFallback(caption);
      if (ok) {
        statusBanner.className = 'status-banner ok';
        statusBanner.textContent = '已复制推荐晒图文案与游戏链接！';
      } else {
        statusBanner.className = 'status-banner err';
        statusBanner.textContent = `请手动复制：${caption}`;
      }
    },
  });

  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShareBtn = canNativeShare
    ? el('button', {
        className: 'gothic-btn gothic-btn-primary',
        text: '系统一键分享',
        attrs: { disabled: true },
        dataset: { testid: 'btn-share-native' },
        onClick: async () => {
          deps.onCue?.({ type: 'ui_click' });
          const caption = buildShareCaption(deps);
          const url = deps.shareUrl ?? SHARE_GAME_URL;
          try {
            if (renderedBlob && typeof File === 'function') {
              const file = new File([renderedBlob], `ashen-survivors-${deps.kind}.png`, {
                type: 'image/png',
              });
              const nav = navigator as Navigator & {
                canShare?: (data: ShareData) => boolean;
              };
              if (nav.canShare?.({ files: [file] })) {
                await navigator.share({
                  title: '《灰烬之夜 · Ashen Survivors》战报',
                  text: caption,
                  files: [file],
                });
                return;
              }
            }
            await navigator.share({
              title: '《灰烬之夜 · Ashen Survivors》',
              text: caption,
              url,
            });
          } catch {
            // User cancelled share sheet; keep modal open silently
          }
        },
      })
    : null;

  const closeModal = (): void => {
    if (closed) return;
    closed = true;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    deps.onClose();
  };

  const backdrop = el('div', {
    className: 'modal-backdrop',
    dataset: { testid: 'modal-share-card' },
    children: [
      el('div', {
        className: 'modal-dialog share-card-dialog',
        children: [
          el('header', {
            className: 'modal-header',
            children: [
              el('div', {
                className: 'modal-title-group',
                children: [
                  el('h2', {
                    className: 'modal-title',
                    text: deps.kind === 'settlement' ? '战报分享海报' : '猎魔人战绩档案卡',
                  }),
                  el('p', {
                    className: 'modal-subtitle',
                    text: '1080×1350 高清海报 · 内置直连二维码 · 适合小红书 / 微信 / B站 / X',
                  }),
                ],
              }),
              el('button', {
                className: 'gothic-btn',
                text: '关闭',
                dataset: { testid: 'btn-close-share-card' },
                onClick: () => {
                  deps.onCue?.({ type: 'ui_click' });
                  closeModal();
                },
              }),
            ],
          }),
          el('div', {
            className: 'modal-body share-card-body',
            children: [
              previewWrap,
              el('div', {
                className: 'share-actions-row',
                children: [downloadBtn, copyImgBtn, copyTextBtn, nativeShareBtn],
              }),
              statusBanner,
            ],
          }),
        ],
      }),
    ],
  });

  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      deps.onCue?.({ type: 'ui_click' });
      closeModal();
    }
  });

  void renderPosterCanvas(deps).then(async (canvas) => {
    if (closed) return;
    renderedCanvas = canvas;
    renderedBlob = await canvasToPngBlob(canvas);
    if (closed) return;

    if (renderedBlob) {
      objectUrl = URL.createObjectURL(renderedBlob);
      previewImg.src = objectUrl;
    } else {
      previewImg.src = canvas.toDataURL('image/png');
    }

    downloadBtn.disabled = false;
    copyImgBtn.disabled = !renderedBlob;
    if (nativeShareBtn) nativeShareBtn.disabled = false;
    statusBanner.textContent = '高清分享海报已就绪，点击保存或长按图片即可晒图！';
  });

  return backdrop;
}
