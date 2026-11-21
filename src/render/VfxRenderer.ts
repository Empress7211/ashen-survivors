import Phaser from 'phaser';
import type { RenderFrameState, RenderZoneState } from '../contracts/index';
import {
  ADDITIVE_VFX_KEYS,
  ATLAS_VFX,
  TEX_GLOW_DISC,
  VFX_NATIVE_ANGLE,
} from './RenderAssets';
import { ImagePool } from './SpritePool';

function fastHash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export class VfxRenderer {
  private readonly floorGraphics: Phaser.GameObjects.Graphics;
  private readonly topGraphics: Phaser.GameObjects.Graphics;
  private readonly zoneSpritePool: ImagePool;
  private readonly projNormalPool: ImagePool;
  private readonly projAddPool: ImagePool;
  private readonly glowPool: ImagePool;
  private readonly flashRect: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, viewW: number, viewH: number) {
    // Ground-level circles/rings (pools, garlic aura, telegraph reticles)
    this.floorGraphics = scene.add.graphics();
    this.floorGraphics.setDepth(4);
    this.floorGraphics.setBlendMode(Phaser.BlendModes.ADD);

    // Zone sprites (slashes, pools, lightning caps, pentagram, explosions)
    this.zoneSpritePool = new ImagePool(
      scene,
      ATLAS_VFX,
      15,
      48,
      Phaser.BlendModes.ADD,
    );

    // Crisp opaque/outlined projectiles (knives, axes, crosses, bones, bibles, cherries, flasks)
    this.projNormalPool = new ImagePool(
      scene,
      ATLAS_VFX,
      16,
      96,
      Phaser.BlendModes.NORMAL,
    );

    // Additive radiant projectiles (bolts, fireballs, meteors, runetracer, phiera bullets)
    this.projAddPool = new ImagePool(
      scene,
      ATLAS_VFX,
      17,
      96,
      Phaser.BlendModes.ADD,
    );

    // Soft additive halo discs behind bright projectiles/explosions
    this.glowPool = new ImagePool(
      scene,
      TEX_GLOW_DISC,
      15,
      64,
      Phaser.BlendModes.ADD,
    );

    // Vector lightning bolts, prismatic Phieraggi laser beams, whip trails, clock hands, laurel arcs
    this.topGraphics = scene.add.graphics();
    this.topGraphics.setDepth(18);
    this.topGraphics.setBlendMode(Phaser.BlendModes.ADD);

    // Full-screen flash overlay (screen-space, scrollFactor 0)
    this.flashRect = scene.add.rectangle(0, 0, viewW, viewH, 0xffffff, 0);
    this.flashRect.setOrigin(0.5, 0.5);
    this.flashRect.setScrollFactor(0);
    this.flashRect.setDepth(30);
    this.flashRect.setBlendMode(Phaser.BlendModes.ADD);
    this.flashRect.setVisible(false);
  }

  resizeOverlay(viewW: number, viewH: number, camZoom: number): void {
    const invZoom = camZoom > 0 ? 1 / camZoom : 1;
    this.flashRect.setPosition(viewW * 0.5, viewH * 0.5);
    this.flashRect.setSize(viewW * invZoom + 8, viewH * invZoom + 8);
  }

  render(
    state: RenderFrameState,
    camCenterX: number,
    camCenterY: number,
    visW: number,
    visH: number,
    highQuality: boolean,
  ): void {
    this.floorGraphics.clear();
    this.topGraphics.clear();
    this.zoneSpritePool.beginFrame();
    this.projNormalPool.beginFrame();
    this.projAddPool.beginFrame();
    this.glowPool.beginFrame();

    const cullLeft = camCenterX - visW * 0.5 - 240;
    const cullRight = camCenterX + visW * 0.5 + 240;
    const cullTop = camCenterY - visH * 0.5 - 240;
    const cullBottom = camCenterY + visH * 0.5 + 240;

    // 1. Player passive auras (Garlic / Soul Eater + Laurel protective shield)
    this.renderPlayerAuras(state);

    // 2. Active Zones (pools, slashes, lightning, explosions, pentagrams, clock hand, shield burst)
    const zones = state.zones;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i]!;
      if (
        z.kind !== 'pentagram' &&
        z.kind !== 'lightning' &&
        (z.x + z.radius < cullLeft ||
          z.x - z.radius > cullRight ||
          z.y + z.radius < cullTop ||
          z.y - z.radius > cullBottom)
      ) {
        continue;
      }
      this.renderZone(z, state.tick, highQuality);
    }

    // 3. Projectiles & Orbiters
    const projectiles = state.projectiles;
    const drawProjAccents = highQuality && projectiles.length <= 90;
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i]!;
      if (
        p.x < cullLeft ||
        p.x > cullRight ||
        p.y < cullTop ||
        p.y > cullBottom
      ) {
        continue;
      }

      const useAdditive = ADDITIVE_VFX_KEYS.has(p.vfxKey);
      const sprite = useAdditive
        ? this.projAddPool.acquire()
        : this.projNormalPool.acquire();
      if (sprite.frame.name !== p.vfxKey) {
        sprite.setFrame(p.vfxKey);
      }
      sprite.setOrigin(0.5, 0.5);
      sprite.setPosition(p.x, p.y);
      sprite.setScale(p.scale * 0.68);
      sprite.setAlpha(p.alpha);
      sprite.setFlipX(Boolean(p.flipX));

      // Keep Bible / Vesper tomes upright for readability; orient directional projectiles
      if (p.vfxKey === 'bible_page' || p.vfxKey === 'vesper_tome') {
        sprite.setRotation(Math.sin(p.rotation) * 0.14);
      } else {
        const nativeOffset = VFX_NATIVE_ANGLE[p.vfxKey] ?? 0;
        sprite.setRotation(p.rotation - nativeOffset);
      }

      if (p.tint !== undefined) {
        sprite.setTint(p.tint);
      } else if (sprite.isTinted) {
        sprite.clearTint();
      }

      if (drawProjAccents) {
        this.renderProjectileAccent(p.vfxKey, p.x, p.y, p.vx, p.vy, p.scale, p.alpha);
      }
    }

    // 4. Beams (Phieraggi 360° rotating prismatic lasers)
    const beams = state.beams;
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i]!;
      this.renderBeam(b, state.tick, highQuality);
    }

    // 5. Screen Flash overlay
    if (state.screenFlash && state.screenFlash.alpha > 0.01) {
      this.flashRect.setVisible(true);
      this.flashRect.setFillStyle(
        state.screenFlash.color,
        Math.min(0.6, state.screenFlash.alpha),
      );
    } else if (this.flashRect.visible) {
      this.flashRect.setVisible(false);
    }

    this.zoneSpritePool.endFrame();
    this.projNormalPool.endFrame();
    this.projAddPool.endFrame();
    this.glowPool.endFrame();
  }

  private renderPlayerAuras(state: RenderFrameState): void {
    const p = state.player;
    const fg = this.floorGraphics;

    if (p.garlicRadius > 0) {
      const pulse = 1 + Math.sin(state.tick * 0.1) * 0.025;
      const r = p.garlicRadius * pulse;
      const color = p.soulEaterActive ? 0xb52bff : 0xc8ffd9;
      const ringColor = p.soulEaterActive ? 0xff467e : 0x9effbc;

      fg.lineStyle(2.2, ringColor, p.soulEaterActive ? 0.48 : 0.34);
      fg.strokeCircle(p.x, p.y, r);
      fg.fillStyle(color, p.soulEaterActive ? 0.09 : 0.06);
      fg.fillCircle(p.x, p.y, r);
    }

    if (p.laurelShieldCharges > 0) {
      const tg = this.topGraphics;
      const shieldR = 30;
      const baseAngle = state.tick * 0.05;
      const segs = Math.min(4, p.laurelShieldCharges);
      const arcSpan = (Math.PI * 1.4) / segs;

      tg.lineStyle(2.8, 0x52f7be, 0.72);
      for (let i = 0; i < segs; i++) {
        const a0 = baseAngle + (i / segs) * Math.PI * 2;
        tg.beginPath();
        tg.arc(p.x, p.y, shieldR, a0, a0 + arcSpan, false);
        tg.strokePath();
      }
      tg.fillStyle(0x52f7be, 0.11);
      tg.fillCircle(p.x, p.y, shieldR);
    }
  }

  private renderZone(
    z: RenderZoneState,
    tick: number,
    highQuality: boolean,
  ): void {
    const fade = Math.max(0, 1 - z.progress);
    const fg = this.floorGraphics;
    const tg = this.topGraphics;

    if (z.kind === 'aura') {
      const vfxSprite = this.zoneSpritePool.acquire();
      vfxSprite.setTexture(ATLAS_VFX, z.vfxKey);
      vfxSprite.setOrigin(0.5, 0.5);
      vfxSprite.setPosition(z.x, z.y);
      const scale = (z.radius * 2) / 96;
      vfxSprite.setScale(scale);
      vfxSprite.setRotation(tick * 0.015);
      vfxSprite.setAlpha(z.alpha * 0.32 * (0.65 + 0.35 * fade));
      vfxSprite.setFlipX(false);
      vfxSprite.clearTint();
      return;
    }

    if (z.kind === 'pool') {
      const isBorra = z.vfxKey === 'borra_pool';
      const fadeAlpha = z.alpha * (z.progress > 0.75 ? (1 - z.progress) / 0.25 : 1);
      const poolSprite = this.zoneSpritePool.acquire();
      poolSprite.setTexture(ATLAS_VFX, z.vfxKey);
      poolSprite.setOrigin(0.5, 0.5);
      poolSprite.setPosition(z.x, z.y);
      poolSprite.setScale(((z.radius * 2) / 96) * 1.05);
      poolSprite.setRotation(z.rotation);
      poolSprite.setAlpha(fadeAlpha * 0.65);
      poolSprite.setFlipX(false);
      poolSprite.clearTint();

      const rimColor = isBorra ? 0xa36bff : 0x3ce5ff;
      fg.lineStyle(2.2, rimColor, fadeAlpha * 0.6);
      fg.strokeCircle(z.x, z.y, z.radius);
      fg.fillStyle(rimColor, fadeAlpha * 0.14);
      fg.fillCircle(z.x, z.y, z.radius * 0.92);

      // Shimmering rising bubbles inside pool
      if (highQuality) {
        const bubbleCount = isBorra ? 4 : 3;
        for (let b = 0; b < bubbleCount; b++) {
          const seed = z.uid * 19 + b * 7;
          const phase = (tick * 0.045 + fastHash(seed)) % 1;
          const ang = fastHash(seed + 1) * Math.PI * 2;
          const dist = fastHash(seed + 2) * z.radius * 0.72;
          const bx = z.x + Math.cos(ang) * dist;
          const by = z.y + Math.sin(ang) * dist - phase * 14;
          fg.lineStyle(1.4, 0xc7f9ff, (1 - phase) * fadeAlpha * 0.75);
          fg.strokeCircle(bx, by, 3 + phase * 4.5);
        }
      }
      return;
    }

    if (z.kind === 'slash') {
      const isBloody = z.vfxKey === 'bloody_tear_slash';
      const dir = z.flipX ? -1 : 1;
      const slashSprite = this.zoneSpritePool.acquire();
      slashSprite.setTexture(ATLAS_VFX, z.vfxKey);
      slashSprite.setOrigin(0.5, 0.5);
      slashSprite.setPosition(z.x, z.y);
      const sx = (z.radius * 2) / 96;
      const sy = sx * 0.62;
      slashSprite.setScale(sx, sy);
      slashSprite.setFlipX(Boolean(z.flipX));
      slashSprite.setRotation(isBloody ? dir * Math.PI * 0.85 : 0);
      slashSprite.setAlpha(z.alpha * fade);
      if (isBloody) {
        slashSprite.setTint(0xff4268);
      } else {
        slashSprite.clearTint();
      }

      // Razor-sharp whip lash curve for crisp directional impact
      const arcColor = isBloody ? 0xff2b55 : 0xfff0c2;
      const coreColor = isBloody ? 0xffb3c4 : 0xffffff;
      const startA = dir > 0 ? -0.52 : Math.PI - 0.52;
      const endA = dir > 0 ? 0.52 : Math.PI + 0.52;
      const rx = z.radius * 0.92;
      const ry = Math.max(18, z.radius * 0.28);

      tg.lineStyle(6, arcColor, fade * 0.7);
      tg.beginPath();
      for (let s = 0; s <= 10; s++) {
        const a = startA + ((endA - startA) * s) / 10;
        const px = z.x - dir * z.radius * 0.35 + Math.cos(a) * rx;
        const py = z.y + Math.sin(a) * ry;
        if (s === 0) tg.moveTo(px, py);
        else tg.lineTo(px, py);
      }
      tg.strokePath();

      tg.lineStyle(2.2, coreColor, fade * 0.95);
      tg.beginPath();
      for (let s = 0; s <= 10; s++) {
        const a = startA + ((endA - startA) * s) / 10;
        const px = z.x - dir * z.radius * 0.35 + Math.cos(a) * rx;
        const py = z.y + Math.sin(a) * ry;
        if (s === 0) tg.moveTo(px, py);
        else tg.lineTo(px, py);
      }
      tg.strokePath();
      return;
    }

    if (z.kind === 'lightning') {
      const boltFlicker = Math.floor(z.progress * 6);
      const topX = z.x + (fastHash(z.uid * 31) - 0.5) * 70;
      const topY = z.y - 440;
      const segs = 8;

      const ptsX: number[] = [topX];
      const ptsY: number[] = [topY];
      for (let s = 1; s < segs; s++) {
        const t = s / segs;
        const jitter = (fastHash(z.uid * 97 + s * 17 + boltFlicker * 13) - 0.5) * 44;
        ptsX.push(topX + (z.x - topX) * t + jitter);
        ptsY.push(topY + (z.y - topY) * t);
      }
      ptsX.push(z.x);
      ptsY.push(z.y);

      // Outer electric cyan-violet glow stroke
      tg.lineStyle(9, 0x5ed6ff, fade * 0.52);
      tg.beginPath();
      tg.moveTo(ptsX[0]!, ptsY[0]!);
      for (let s = 1; s < ptsX.length; s++) tg.lineTo(ptsX[s]!, ptsY[s]!);
      tg.strokePath();

      // Inner white-gold core bolt
      tg.lineStyle(2.6, 0xfff8d6, fade * 0.96);
      tg.beginPath();
      tg.moveTo(ptsX[0]!, ptsY[0]!);
      for (let s = 1; s < ptsX.length; s++) tg.lineTo(ptsX[s]!, ptsY[s]!);
      tg.strokePath();

      // Strike crater shockwave ring
      const ringR = z.radius * (0.45 + 0.55 * z.progress);
      tg.lineStyle(3, 0x7ce8ff, fade * 0.8);
      tg.strokeCircle(z.x, z.y, ringR);

      const boltSprite = this.zoneSpritePool.acquire();
      boltSprite.setTexture(ATLAS_VFX, 'lightning_bolt');
      boltSprite.setOrigin(0.5, 0.8);
      boltSprite.setPosition(z.x, z.y + 8);
      boltSprite.setScale(1.15);
      boltSprite.setRotation(0);
      boltSprite.setAlpha(fade * 0.9);
      boltSprite.setFlipX(false);
      boltSprite.clearTint();

      if (highQuality) {
        const glow = this.glowPool.acquire();
        glow.setPosition(z.x, z.y);
        glow.setScale((z.radius * 2.2) / 128);
        glow.setAlpha(fade * 0.55);
        glow.setTint(0x70e4ff);
      }
      return;
    }

    if (z.kind === 'explosion' || z.kind === 'shield_burst') {
      const color =
        z.tint ?? (z.kind === 'shield_burst' ? 0x52f7be : 0xff8f3d);
      const expand = 0.45 + 0.65 * z.progress;
      const sprite = this.zoneSpritePool.acquire();
      sprite.setTexture(ATLAS_VFX, z.vfxKey);
      sprite.setOrigin(0.5, 0.5);
      sprite.setPosition(z.x, z.y);
      sprite.setScale(((z.radius * 2) / 96) * expand);
      sprite.setRotation(z.rotation);
      sprite.setAlpha(z.alpha * fade);
      sprite.setFlipX(false);
      if (z.tint !== undefined) sprite.setTint(z.tint);
      else sprite.clearTint();

      tg.lineStyle(3.2, color, fade * 0.82);
      tg.strokeCircle(z.x, z.y, z.radius * (0.35 + 0.65 * z.progress));

      if (highQuality) {
        const glow = this.glowPool.acquire();
        glow.setPosition(z.x, z.y);
        glow.setScale(((z.radius * 2) / 128) * (0.6 + 0.4 * z.progress));
        glow.setAlpha(fade * 0.45);
        glow.setTint(color);
      }
      return;
    }

    if (z.kind === 'bombard_telegraph') {
      const color = z.tint ?? 0xffb347;
      fg.lineStyle(2, color, 0.72);
      fg.strokeCircle(z.x, z.y, z.radius);
      fg.fillStyle(color, 0.14 + 0.16 * z.progress);
      fg.fillCircle(z.x, z.y, z.radius * Math.max(0.15, z.progress));
      return;
    }

    if (z.kind === 'pentagram') {
      const color = z.weaponId === 'gorgeous_moon' ? 0x67b8ff : 0xeb2b5c;
      const sigil = this.zoneSpritePool.acquire();
      sigil.setTexture(ATLAS_VFX, 'pentagram_sigil');
      sigil.setOrigin(0.5, 0.5);
      sigil.setPosition(z.x, z.y);
      const scale = ((z.radius * 2) / 96) * (0.65 + 0.35 * z.progress);
      sigil.setScale(scale);
      sigil.setRotation(z.progress * 0.9);
      sigil.setAlpha(z.alpha * fade * 0.75);
      sigil.setFlipX(false);
      sigil.setTint(color);

      tg.lineStyle(3.5, color, fade * 0.68);
      tg.strokeCircle(z.x, z.y, z.radius * (0.4 + 0.6 * z.progress));
      return;
    }

    if (z.kind === 'clock_hand') {
      const endX = z.endX ?? z.x + Math.cos(z.rotation) * z.radius;
      const endY = z.endY ?? z.y + Math.sin(z.rotation) * z.radius;

      // Clock dial tick ring around player
      tg.lineStyle(2, 0x73e8ff, fade * 0.65);
      tg.strokeCircle(z.x, z.y, 44);

      // Freezing lancet sweep beam
      tg.lineStyle(10, 0x4ad4ff, fade * 0.36);
      tg.lineBetween(z.x, z.y, endX, endY);
      tg.lineStyle(3, 0xdcf9ff, fade * 0.92);
      tg.lineBetween(z.x, z.y, endX, endY);

      const hand = this.zoneSpritePool.acquire();
      hand.setTexture(ATLAS_VFX, 'clock_hand');
      hand.setOrigin(0.25, 0.5);
      hand.setPosition(z.x + Math.cos(z.rotation) * 28, z.y + Math.sin(z.rotation) * 28);
      hand.setScale(1.1);
      hand.setRotation(z.rotation - (VFX_NATIVE_ANGLE.clock_hand ?? 0));
      hand.setAlpha(fade * 0.95);
      hand.setFlipX(false);
      hand.clearTint();
    }
  }

  private renderProjectileAccent(
    vfxKey: string,
    x: number,
    y: number,
    vx: number,
    vy: number,
    scale: number,
    alpha: number,
  ): void {
    let glowColor = 0;
    let trailColor = 0;

    if (vfxKey === 'magic_bolt') {
      glowColor = 0x56ccf2;
      trailColor = 0x56ccf2;
    } else if (vfxKey === 'holy_bolt') {
      glowColor = 0xffdc73;
      trailColor = 0xffeb99;
    } else if (vfxKey === 'fireball') {
      glowColor = 0xff7b29;
      trailColor = 0xff9340;
    } else if (vfxKey === 'hellfire_meteor') {
      glowColor = 0xff3b2f;
      trailColor = 0xff5a36;
    } else if (vfxKey === 'runetracer_diamond') {
      glowColor = 0x72f5ff;
      trailColor = 0xd966ff;
    } else if (vfxKey === 'bullet_red') {
      glowColor = 0xff3b68;
      trailColor = 0xff5c85;
    } else if (vfxKey === 'bullet_blue') {
      glowColor = 0x52c7ff;
      trailColor = 0x80d8ff;
    } else if (vfxKey === 'death_scythe') {
      glowColor = 0xe82a4d;
    } else if (vfxKey === 'heaven_blade') {
      glowColor = 0xffe994;
    }

    if (glowColor !== 0) {
      const glow = this.glowPool.acquire();
      glow.setPosition(x, y);
      glow.setScale(0.42 * scale);
      glow.setAlpha(0.32 * alpha);
      glow.setTint(glowColor);
    }

    if (trailColor !== 0 && (vx !== 0 || vy !== 0)) {
      const spd = Math.hypot(vx, vy);
      if (spd > 20) {
        const len = Math.min(34, spd * 0.055);
        const nx = vx / spd;
        const ny = vy / spd;
        this.topGraphics.lineStyle(3.2 * scale, trailColor, 0.55 * alpha);
        this.topGraphics.lineBetween(x, y, x - nx * len, y - ny * len);
      }
    }
  }

  private renderBeam(
    b: RenderFrameState['beams'][number],
    tick: number,
    highQuality: boolean,
  ): void {
    const tg = this.topGraphics;
    const alpha = Math.max(0, Math.min(1, b.alpha));

    // Outer prismatic halo
    tg.lineStyle(b.width * 1.45, b.color, alpha * 0.28);
    tg.lineBetween(b.x1, b.y1, b.x2, b.y2);

    // Mid core color
    tg.lineStyle(b.width * 0.7, b.color, alpha * 0.65);
    tg.lineBetween(b.x1, b.y1, b.x2, b.y2);

    // Pure white laser core
    tg.lineStyle(Math.max(3, b.width * 0.24), 0xffffff, alpha * 0.95);
    tg.lineBetween(b.x1, b.y1, b.x2, b.y2);

    // Origin star flare cap
    const cap = this.zoneSpritePool.acquire();
    cap.setTexture(ATLAS_VFX, 'phieraggi_beam_cap');
    cap.setOrigin(0.5, 0.5);
    cap.setPosition(b.x1, b.y1);
    cap.setScale(0.65 + Math.sin(tick * 0.25) * 0.08);
    cap.setRotation(tick * 0.09);
    cap.setAlpha(alpha * 0.72);
    cap.setFlipX(false);
    cap.setTint(b.color);

    if (highQuality) {
      const tipGlow = this.glowPool.acquire();
      tipGlow.setPosition(b.x2, b.y2);
      tipGlow.setScale(0.7);
      tipGlow.setAlpha(alpha * 0.45);
      tipGlow.setTint(b.color);
    }
  }

  hideAll(): void {
    this.floorGraphics.clear();
    this.topGraphics.clear();
    this.zoneSpritePool.hideAll();
    this.projNormalPool.hideAll();
    this.projAddPool.hideAll();
    this.glowPool.hideAll();
    this.flashRect.setVisible(false);
  }

  destroy(): void {
    this.floorGraphics.destroy();
    this.topGraphics.destroy();
    this.zoneSpritePool.destroy();
    this.projNormalPool.destroy();
    this.projAddPool.destroy();
    this.glowPool.destroy();
    this.flashRect.destroy();
  }
}
