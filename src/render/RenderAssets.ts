import Phaser from 'phaser';
import { PASSIVE_IDS } from '../contracts/ids';
import type { PassiveId, StageId } from '../contracts/index';

export const ATLAS_WORLD = 'atlas_world';
export const ATLAS_ENTITIES = 'atlas_entities';
export const ATLAS_VFX = 'atlas_vfx';

export const TEX_SHADOW_ELLIPSE = 'proc_shadow_ellipse';
export const TEX_GLOW_DISC = 'proc_glow_disc';
export const TEX_VIGNETTE = 'proc_vignette';
export const TEX_EDGE_ARROW = 'proc_edge_arrow';

export function stageTextureKey(stageId: StageId): string {
  return `stage_floor_${stageId}`;
}

export function stageTexturePath(stageId: StageId): string {
  return `/assets/stages/${stageId}.jpg`;
}

export function passiveIconKey(passiveId: PassiveId): string {
  return `icon_passive_${passiveId}`;
}

export function passiveIconPath(passiveId: PassiveId): string {
  return `/assets/icons/${passiveId}.png`;
}

/**
 * Native forward nose angle (in radians) of directional sprites inside public/assets/atlases/vfx.png.
 * Used as: sprite.rotation = projectile.rotation - nativeNoseAngle so every projectile aligns with velocity.
 */
export const VFX_NATIVE_ANGLE: Readonly<Record<string, number>> = {
  magic_bolt: Math.PI, // points left (-X) in sheet
  holy_bolt: -Math.PI / 4, // points up-right
  knife_blade: -Math.PI / 4, // dagger tip points up-right
  heaven_blade: -Math.PI / 4, // sword tip points up-right
  clock_hand: -Math.PI / 4, // pointer tip points up-right
  fireball: (3 * Math.PI) / 4, // meteor nose bottom-left, tail top-right
  hellfire_meteor: Math.PI / 4, // flaming skull nose bottom-right, tail top-left
  runetracer_diamond: -Math.PI / 2, // diamond oriented vertically
  bullet_red: 0, // points right (+X)
  bullet_blue: 0, // points right (+X)
};

export const ADDITIVE_VFX_KEYS = new Set<string>([
  'whip_slash',
  'bloody_tear_slash',
  'magic_bolt',
  'holy_bolt',
  'fireball',
  'hellfire_meteor',
  'garlic_ring',
  'soul_eater_ring',
  'water_pool',
  'borra_pool',
  'runetracer_diamond',
  'lightning_bolt',
  'pentagram_sigil',
  'vandalier_beam',
  'phieraggi_beam_cap',
  'hit_spark',
  'explosion_ring',
  'laurel_shield',
]);

export function queueCorePreload(
  loader: Phaser.Loader.LoaderPlugin,
  initialStageId?: StageId,
): void {
  loader.atlas(ATLAS_WORLD, '/assets/atlases/world.png', '/assets/atlases/world.json');
  loader.atlas(ATLAS_ENTITIES, '/assets/atlases/entities.png', '/assets/atlases/entities.json');
  loader.atlas(ATLAS_VFX, '/assets/atlases/vfx.png', '/assets/atlases/vfx.json');

  if (initialStageId) {
    loader.image(stageTextureKey(initialStageId), stageTexturePath(initialStageId));
  } else {
    loader.image(stageTextureKey('mad_forest'), stageTexturePath('mad_forest'));
  }

  // Preload passive icons so stage ground passives & offscreen indicators render immediately
  for (let i = 0; i < PASSIVE_IDS.length; i++) {
    const pid = PASSIVE_IDS[i]!;
    loader.image(passiveIconKey(pid), passiveIconPath(pid));
  }
}

export function createProceduralTextures(textures: Phaser.Textures.TextureManager): void {
  if (!textures.exists(TEX_SHADOW_ELLIPSE)) {
    const c = textures.createCanvas(TEX_SHADOW_ELLIPSE, 64, 32);
    if (c) {
      const ctx = c.getContext();
      const grad = ctx.createRadialGradient(32, 16, 2, 32, 16, 30);
      grad.addColorStop(0, 'rgba(4, 3, 8, 0.62)');
      grad.addColorStop(0.58, 'rgba(4, 3, 8, 0.34)');
      grad.addColorStop(1, 'rgba(4, 3, 8, 0)');
      ctx.save();
      ctx.translate(32, 16);
      ctx.scale(1, 0.5);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      c.refresh();
    }
  }

  if (!textures.exists(TEX_GLOW_DISC)) {
    const c = textures.createCanvas(TEX_GLOW_DISC, 128, 128);
    if (c) {
      const ctx = c.getContext();
      const grad = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.42)');
      grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.1)');
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      c.refresh();
    }
  }

  if (!textures.exists(TEX_VIGNETTE)) {
    const c = textures.createCanvas(TEX_VIGNETTE, 512, 512);
    if (c) {
      const ctx = c.getContext();
      const grad = ctx.createRadialGradient(256, 256, 130, 256, 256, 360);
      grad.addColorStop(0, 'rgba(5, 4, 9, 0)');
      grad.addColorStop(0.62, 'rgba(5, 4, 9, 0.14)');
      grad.addColorStop(0.86, 'rgba(5, 4, 9, 0.48)');
      grad.addColorStop(1, 'rgba(4, 3, 7, 0.84)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 512, 512);
      c.refresh();
    }
  }

  if (!textures.exists(TEX_EDGE_ARROW)) {
    const c = textures.createCanvas(TEX_EDGE_ARROW, 48, 48);
    if (c) {
      const ctx = c.getContext();
      ctx.clearRect(0, 0, 48, 48);
      // Dark gothic outline chevron pointing RIGHT (+X)
      ctx.beginPath();
      ctx.moveTo(42, 24);
      ctx.lineTo(14, 7);
      ctx.lineTo(22, 24);
      ctx.lineTo(14, 41);
      ctx.closePath();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = 'rgba(8, 6, 12, 0.95)';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      c.refresh();
    }
  }
}
