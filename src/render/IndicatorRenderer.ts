import Phaser from 'phaser';
import type { PassiveId, RenderFrameState } from '../contracts/index';
import {
  ATLAS_ENTITIES,
  ATLAS_VFX,
  ATLAS_WORLD,
  TEX_EDGE_ARROW,
  clampAlpha,
  hasAtlasPassiveFrame,
  interpolateValue,
  passiveAtlasFrame,
  passiveIconKey,
} from './RenderAssets';
import type { EntityRenderInterp } from './types';

interface IndicatorTarget {
  priority: number;
  x: number;
  y: number;
  color: number;
  texture: string;
  frame?: string;
  targetSize: number;
}

interface IndicatorSlot {
  badgeBg: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
  arrow: Phaser.GameObjects.Image;
}

const MAX_EDGE_INDICATORS = 14;

export class IndicatorRenderer {
  private readonly container: Phaser.GameObjects.Container;
  private readonly slots: IndicatorSlot[] = [];
  private readonly targetsScratch: IndicatorTarget[] = [];

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0);
    this.container.setScrollFactor(0);
    this.container.setDepth(28);

    for (let i = 0; i < MAX_EDGE_INDICATORS; i++) {
      const badgeBg = scene.add.circle(0, 0, 17, 0x0b0812, 0.9);
      badgeBg.setStrokeStyle(2, 0xffd447, 0.95);
      badgeBg.setVisible(false);

      const icon = scene.add.image(0, 0, ATLAS_VFX, 'xp_gold');
      icon.setOrigin(0.5, 0.5);
      icon.setVisible(false);

      const arrow = scene.add.image(0, 0, TEX_EDGE_ARROW);
      arrow.setOrigin(0.5, 0.5);
      arrow.setScale(0.46);
      arrow.setVisible(false);

      this.container.add([badgeBg, icon, arrow]);
      this.slots.push({ badgeBg, icon, arrow });
    }
  }

  resize(viewW: number, viewH: number, camZoom: number): void {
    const invZoom = camZoom > 0 ? 1 / camZoom : 1;
    this.container.setPosition(viewW * 0.5, viewH * 0.5);
    this.container.setScale(invZoom);
  }

  render(
    scene: Phaser.Scene,
    state: RenderFrameState,
    camCenterX: number,
    camCenterY: number,
    viewW: number,
    viewH: number,
    camZoom: number,
    interp?: EntityRenderInterp,
  ): void {
    const targets = this.targetsScratch;
    targets.length = 0;

    const halfW = viewW * 0.5;
    const halfH = viewH * 0.5;
    const alpha = interp?.alpha !== undefined ? clampAlpha(interp.alpha) : 1;
    const enemySnaps = alpha < 1 ? interp?.enemySnaps : undefined;

    // 1. Offscreen bosses / reapers
    const enemies = state.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i]!;
      if (!e.isBoss && !e.isReaper) continue;
      const snap = enemySnaps?.get(e.uid);
      const ex = snap ? interpolateValue(snap.prevX, snap.currX, alpha) : e.x;
      const ey = snap ? interpolateValue(snap.prevY, snap.currY, alpha) : e.y;
      const sx = (ex - camCenterX) * camZoom;
      const sy = (ey - camCenterY) * camZoom;
      if (Math.abs(sx) <= halfW - 14 && Math.abs(sy) <= halfH - 14) continue;
      targets.push({
        priority: e.isReaper ? 0 : 1,
        x: sx,
        y: sy,
        color: e.isReaper ? 0xff1f4b : 0xff3b5c,
        texture: ATLAS_ENTITIES,
        frame: `${e.enemyId}_0`,
        targetSize: 28,
      });
    }

    // 2. Offscreen relics, ground passives, and boss chests
    const pickups = state.pickups;
    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i]!;
      const isChest = p.kind === 'pickup' && p.itemId.startsWith('chest_');
      if (p.kind !== 'relic' && p.kind !== 'passive' && !isChest) continue;

      const sx = (p.x - camCenterX) * camZoom;
      const sy = (p.y - camCenterY) * camZoom;
      if (Math.abs(sx) <= halfW - 14 && Math.abs(sy) <= halfH - 14) continue;

      if (p.kind === 'relic') {
        targets.push({
          priority: 2,
          x: sx,
          y: sy,
          color: 0xc77dff,
          texture: ATLAS_VFX,
          frame: p.itemId,
          targetSize: 24,
        });
      } else if (isChest) {
        targets.push({
          priority: 3,
          x: sx,
          y: sy,
          color: 0xffaa2b,
          texture: ATLAS_WORLD,
          frame: p.chestOpen ? `${p.itemId}_open` : p.itemId,
          targetSize: 24,
        });
      } else {
        const pid = p.itemId as PassiveId;
        if (hasAtlasPassiveFrame(scene.textures, pid)) {
          targets.push({
            priority: 4,
            x: sx,
            y: sy,
            color: 0xffd447,
            texture: ATLAS_WORLD,
            frame: passiveAtlasFrame(pid),
            targetSize: 23,
          });
        } else {
          const key = passiveIconKey(pid);
          if (!scene.textures.exists(key)) continue;
          targets.push({
            priority: 4,
            x: sx,
            y: sy,
            color: 0xffd447,
            texture: key,
            targetSize: 23,
          });
        }
      }
    }

    if (targets.length > 1) {
      targets.sort((a, b) => a.priority - b.priority || a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
    }

    const minX = -halfW + 44;
    const maxX = halfW - 44;
    const minY = -halfH + 78; // clear top HUD bar
    const maxY = halfH - 46;
    const pulse = 1 + Math.sin(state.tick * 0.14) * 0.08;

    const count = Math.min(MAX_EDGE_INDICATORS, targets.length);
    for (let i = 0; i < count; i++) {
      const t = targets[i]!;
      const slot = this.slots[i]!;

      // Ray intersection against [minX, maxX] x [minY, maxY] centered near (0, 0)
      const cx = (minX + maxX) * 0.5;
      const cy = (minY + maxY) * 0.5;
      const dx = t.x - cx;
      const dy = t.y - cy;
      let scaleT = 1;
      if (dx > 1e-4) scaleT = Math.min(scaleT, (maxX - cx) / dx);
      else if (dx < -1e-4) scaleT = Math.min(scaleT, (minX - cx) / dx);
      if (dy > 1e-4) scaleT = Math.min(scaleT, (maxY - cy) / dy);
      else if (dy < -1e-4) scaleT = Math.min(scaleT, (minY - cy) / dy);

      const ix = cx + dx * scaleT;
      const iy = cy + dy * scaleT;
      const angle = Math.atan2(dy, dx);

      slot.badgeBg.setPosition(ix, iy);
      slot.badgeBg.setStrokeStyle(2, t.color, 0.95);
      slot.badgeBg.setVisible(true);

      if (t.frame !== undefined) {
        slot.icon.setTexture(t.texture, t.frame);
      } else {
        slot.icon.setTexture(t.texture);
      }
      const frameW = Math.max(1, slot.icon.width);
      const frameH = Math.max(1, slot.icon.height);
      const iconScale = t.targetSize / Math.max(frameW, frameH);
      slot.icon.setPosition(ix, iy);
      slot.icon.setScale(iconScale);
      slot.icon.setVisible(true);

      slot.arrow.setPosition(
        ix + Math.cos(angle) * 23,
        iy + Math.sin(angle) * 23,
      );
      slot.arrow.setRotation(angle);
      slot.arrow.setTint(t.color);
      slot.arrow.setScale(0.46 * pulse);
      slot.arrow.setVisible(true);
    }

    for (let i = count; i < MAX_EDGE_INDICATORS; i++) {
      const slot = this.slots[i]!;
      if (slot.badgeBg.visible) slot.badgeBg.setVisible(false);
      if (slot.icon.visible) slot.icon.setVisible(false);
      if (slot.arrow.visible) slot.arrow.setVisible(false);
    }
  }

  hideAll(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]!;
      slot.badgeBg.setVisible(false);
      slot.icon.setVisible(false);
      slot.arrow.setVisible(false);
    }
  }

  destroy(): void {
    this.container.destroy(true);
    this.slots.length = 0;
  }
}
