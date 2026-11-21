import Phaser from 'phaser';
import type { RenderFloatingText } from '../contracts/index';

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

interface TextSlot {
  obj: Phaser.GameObjects.Text;
  uid: number;
  seenTick: number;
}

const MAX_TEXT_POOL = 150;

export class FloatingTextPool {
  private readonly scene: Phaser.Scene;
  private readonly depth: number;
  private readonly slots: TextSlot[] = [];
  private readonly uidToSlot = new Map<number, TextSlot>();
  private readonly freeSlots: TextSlot[] = [];
  private frameCounter = 0;

  constructor(scene: Phaser.Scene, depth: number, initialSize = 64) {
    this.scene = scene;
    this.depth = depth;
    for (let i = 0; i < initialSize; i++) {
      const slot = this.createSlot();
      this.slots.push(slot);
      this.freeSlots.push(slot);
    }
  }

  private createSlot(): TextSlot {
    const obj = this.scene.add.text(0, 0, '', {
      fontFamily: "'Cinzel', 'Noto Serif SC', Georgia, serif",
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#f5f2eb',
      stroke: '#0a070d',
      strokeThickness: 4,
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
  }

  renderItem(
    uid: number,
    x: number,
    y: number,
    text: string,
    kind: FloatingTextStyleKind,
    progress: number,
  ): void {
    let slot = this.uidToSlot.get(uid);
    if (!slot) {
      slot = this.freeSlots.pop();
      if (!slot) {
        if (this.slots.length < MAX_TEXT_POOL) {
          slot = this.createSlot();
          this.slots.push(slot);
        } else {
          // Evict oldest slot if saturated
          slot = this.slots[0]!;
          for (let i = 1; i < this.slots.length; i++) {
            if (this.slots[i]!.seenTick < slot.seenTick) {
              slot = this.slots[i]!;
            }
          }
          if (slot.uid !== 0) {
            this.uidToSlot.delete(slot.uid);
          }
        }
      }
      slot.uid = uid;
      this.uidToSlot.set(uid, slot);
      this.applyStyleAndText(slot.obj, text, kind);
    }

    slot.seenTick = this.frameCounter;
    const obj = slot.obj;
    if (!obj.visible) {
      obj.setVisible(true);
    }

    const fadeStart = kind === 'status' ? 0.7 : 0.55;
    const alpha =
      progress <= fadeStart
        ? 1
        : Math.max(0, 1 - (progress - fadeStart) / (1 - fadeStart));
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

    obj.setPosition(x, y);
    obj.setAlpha(alpha);
    obj.setScale(popScale);
  }

  private applyStyleAndText(
    obj: Phaser.GameObjects.Text,
    text: string,
    kind: FloatingTextStyleKind,
  ): void {
    if (kind === 'crit') {
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(25);
      obj.setColor('#ffd447');
      obj.setStroke('#240d04', 5);
    } else if (kind === 'player_damage') {
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(21);
      obj.setColor('#ff3656');
      obj.setStroke('#180308', 4.5);
    } else if (kind === 'heal') {
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(18);
      obj.setColor('#49eb8c');
      obj.setStroke('#061a0e', 4);
    } else if (kind === 'gold') {
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(18);
      obj.setColor('#ffbf3f');
      obj.setStroke('#1a1004', 4);
    } else if (kind === 'xp') {
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(16);
      obj.setColor('#6fe8ff');
      obj.setStroke('#071822', 3.5);
    } else if (kind === 'status') {
      obj.setFontFamily("'Noto Serif SC', 'Cinzel', Georgia, serif");
      obj.setFontSize(20);
      obj.setColor('#ffe89e');
      obj.setStroke('#150b1f', 5);
    } else {
      // 'damage'
      obj.setFontFamily("'Cinzel', Georgia, serif");
      obj.setFontSize(17);
      obj.setColor('#f7f4ec');
      obj.setStroke('#0a080f', 4);
    }
    obj.setText(text);
  }

  endFrame(): void {
    const tick = this.frameCounter;
    for (const [uid, slot] of this.uidToSlot.entries()) {
      if (slot.seenTick !== tick) {
        this.uidToSlot.delete(uid);
        slot.uid = 0;
        slot.obj.setVisible(false);
        this.freeSlots.push(slot);
      }
    }
  }

  hideAll(): void {
    for (const slot of this.uidToSlot.values()) {
      slot.uid = 0;
      slot.obj.setVisible(false);
      this.freeSlots.push(slot);
    }
    this.uidToSlot.clear();
  }

  destroy(): void {
    for (let i = 0; i < this.slots.length; i++) {
      this.slots[i]!.obj.destroy();
    }
    this.slots.length = 0;
    this.freeSlots.length = 0;
    this.uidToSlot.clear();
  }
}
