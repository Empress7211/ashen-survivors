import Phaser from 'phaser';
import type { RenderFloatingText } from '../contracts/index';
import {
  BITMAP_DIGIT_ADVANCE,
  TEX_BITMAP_DIGITS,
  isSupportedDigitGlyph,
} from './RenderAssets';

export class ImagePool {
  private readonly scene: Phaser.Scene;
  private readonly defaultTexture: string;
  private readonly depth: number;
  private readonly blendMode: number;
  private readonly items: Phaser.GameObjects.Image[] = [];
  private cursor = 0;
  private highWaterUsed = 0;

  constructor(
    scene: Phaser.Scene,
    defaultTexture: string,
    depth: number,
    initialSize = 0,
    blendMode: number = Phaser.BlendModes.NORMAL,
  ) {
    this.scene = scene;
    this.defaultTexture = defaultTexture;
    this.depth = depth;
    this.blendMode = blendMode;

    for (let i = 0; i < initialSize; i++) {
      const img = this.createImage();
      img.setVisible(false);
      this.items.push(img);
    }
  }

  private createImage(): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, this.defaultTexture);
    img.setDepth(this.depth);
    if (this.blendMode !== Phaser.BlendModes.NORMAL) {
      img.setBlendMode(this.blendMode);
    }
    return img;
  }

  beginFrame(): void {
    this.cursor = 0;
  }

  acquire(): Phaser.GameObjects.Image {
    let img: Phaser.GameObjects.Image;
    if (this.cursor < this.items.length) {
      img = this.items[this.cursor]!;
    } else {
      img = this.createImage();
      this.items.push(img);
    }
    this.cursor++;
    if (!img.visible) {
      img.setVisible(true);
    }
    return img;
  }

  endFrame(): void {
    for (let i = this.cursor; i < this.highWaterUsed; i++) {
      const img = this.items[i];
      if (img && img.visible) {
        img.setVisible(false);
      }
    }
    this.highWaterUsed = this.cursor;
  }

  hideAll(): void {
    for (let i = 0; i < this.highWaterUsed; i++) {
      const img = this.items[i];
      if (img && img.visible) {
        img.setVisible(false);
      }
    }
    this.cursor = 0;
    this.highWaterUsed = 0;
  }

  destroy(): void {
    for (let i = 0; i < this.items.length; i++) {
      this.items[i]!.destroy();
    }
    this.items.length = 0;
    this.cursor = 0;
    this.highWaterUsed = 0;
  }
}

export type FloatingTextStyleKind =
  | RenderFloatingText['kind']
  | 'player_damage';

interface StatusSlot {
  obj: Phaser.GameObjects.Text;
  uid: number;
  seenTick: number;
}

const MAX_STATUS_TEXT_POOL = 8;

function isAsciiDigitString(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    if (!isSupportedDigitGlyph(text[i]!)) return false;
  }
  return true;
}

/**
 * High-performance batched floating damage/status pool:
 * - Numeric combat damage, crits, heals, XP, and gold render as batched Image glyphs
 *   from TEX_BITMAP_DIGITS (single WebGL texture batch, zero per-hit Canvas2D uploads!).
 * - Non-ASCII Chinese status labels (at most a few per run) use an 8-slot Text pool.
 */
export class FloatingTextPool {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly digitPool: ImagePool;
  private readonly statusSlots: StatusSlot[] = [];
  private readonly uidToSlot = new Map<number, StatusSlot>();
  private readonly freeStatusSlots: StatusSlot[] = [];
  private frameCounter = 0;

  constructor(scene: Phaser.Scene, depth: number, initialDigitPool = 220) {
    this.scene = scene;
    this.depth = depth;
    this.digitPool = new ImagePool(scene, TEX_BITMAP_DIGITS, depth, initialDigitPool);

    for (let i = 0; i < MAX_STATUS_TEXT_POOL; i++) {
      const slot = this.createStatusSlot();
      this.statusSlots.push(slot);
      this.freeStatusSlots.push(slot);
    }
  }

  private createStatusSlot(): StatusSlot {
    const obj = this.scene.add.text(0, 0, '', {
      fontFamily: "'Noto Serif SC', 'Cinzel', Georgia, serif",
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#ffe89e',
      stroke: '#150b1f',
      strokeThickness: 5,
    });
    obj.setOrigin(0.5, 0.5);
    obj.setDepth(this.depth);
    obj.setVisible(false);
    return {
      obj,
      uid: 0,
      seenTick: -1,
    };
  }

  beginFrame(): void {
    this.frameCounter++;
    this.digitPool.beginFrame();
  }

  renderItem(
    uid: number,
    x: number,
    y: number,
    text: string,
    kind: FloatingTextStyleKind,
    progress: number,
  ): void {
    const fadeStart = kind === 'status' ? 0.7 : 0.55;
    const alpha =
      progress <= fadeStart
        ? 1
        : Math.max(0, 1 - (progress - fadeStart) / (1 - fadeStart));
    if (alpha <= 0.02) return;

    const popScale =
      kind === 'crit'
        ? progress < 0.16
          ? 1.28 - progress * 1.1
          : 1.05
        : kind === 'player_damage'
          ? progress < 0.2
            ? 1.18 - progress * 0.6
            : 1.0
          : 1.0;

    if (kind !== 'status' && isAsciiDigitString(text)) {
      this.renderDigitString(x, y, text, kind, alpha, popScale);
      return;
    }

    this.renderStatusText(uid, x, y, text, alpha, popScale);
  }

  private renderDigitString(
    x: number,
    y: number,
    text: string,
    kind: FloatingTextStyleKind,
    alpha: number,
    popScale: number,
  ): void {
    let baseScale = 0.88;
    let tint = 0xf7f4ec;
    if (kind === 'crit') {
      baseScale = 1.24;
      tint = 0xffd447;
    } else if (kind === 'player_damage') {
      baseScale = 1.08;
      tint = 0xff3656;
    } else if (kind === 'heal') {
      baseScale = 0.96;
      tint = 0x49eb8c;
    } else if (kind === 'gold') {
      baseScale = 0.96;
      tint = 0xffbf3f;
    } else if (kind === 'xp') {
      baseScale = 0.85;
      tint = 0x6fe8ff;
    }

    const scale = baseScale * popScale;
    const step = BITMAP_DIGIT_ADVANCE * scale;
    const totalW = (text.length - 1) * step;
    let cursorX = x - totalW * 0.5;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      const img = this.digitPool.acquire();
      img.setFrame(ch);
      img.setPosition(cursorX, y);
      img.setScale(scale);
      img.setAlpha(alpha);
      img.setTint(tint);
      cursorX += step;
    }
  }

  private renderStatusText(
    uid: number,
    x: number,
    y: number,
    text: string,
    alpha: number,
    popScale: number,
  ): void {
    let slot = this.uidToSlot.get(uid);
    if (!slot) {
      slot = this.freeStatusSlots.pop();
      if (!slot) {
        slot = this.statusSlots[0]!;
        for (let i = 1; i < this.statusSlots.length; i++) {
          if (this.statusSlots[i]!.seenTick < slot.seenTick) {
            slot = this.statusSlots[i]!;
          }
        }
        if (slot.uid !== 0) {
          this.uidToSlot.delete(slot.uid);
        }
      }
      slot.uid = uid;
      this.uidToSlot.set(uid, slot);
      slot.obj.setText(text);
    }

    slot.seenTick = this.frameCounter;
    const obj = slot.obj;
    if (!obj.visible) {
      obj.setVisible(true);
    }
    obj.setPosition(x, y);
    obj.setAlpha(alpha);
    obj.setScale(popScale);
  }

  endFrame(): void {
    this.digitPool.endFrame();

    const tick = this.frameCounter;
    for (const [uid, slot] of this.uidToSlot.entries()) {
      if (slot.seenTick !== tick) {
        this.uidToSlot.delete(uid);
        slot.uid = 0;
        slot.obj.setVisible(false);
        this.freeStatusSlots.push(slot);
      }
    }
  }

  hideAll(): void {
    this.digitPool.hideAll();
    for (const slot of this.uidToSlot.values()) {
      slot.uid = 0;
      slot.obj.setVisible(false);
      this.freeStatusSlots.push(slot);
    }
    this.uidToSlot.clear();
  }

  destroy(): void {
    this.digitPool.destroy();
    for (let i = 0; i < this.statusSlots.length; i++) {
      this.statusSlots[i]!.obj.destroy();
    }
    this.statusSlots.length = 0;
    this.freeStatusSlots.length = 0;
    this.uidToSlot.clear();
  }
}
