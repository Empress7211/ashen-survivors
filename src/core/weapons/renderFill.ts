import type {
  RenderBeamState,
  RenderProjectileState,
  RenderZoneState,
} from '../../contracts/index.ts';
import type {
  ActiveBeam,
  ActiveOrbiter,
  ActiveProjectile,
  ActiveZone,
} from './types.ts';

/** Fill a reusable RenderZoneState array in place with zero per-frame allocations. */
export function fillRenderZones(
  zones: readonly ActiveZone[],
  out: RenderZoneState[],
): void {
  const count = zones.length;
  for (let i = 0; i < count; i++) {
    const z = zones[i]!;
    const progress = z.maxLife > 0 ? 1 - z.life / z.maxLife : 1;
    let slot = out[i];
    if (!slot) {
      slot = {
        uid: z.uid,
        kind: z.kind,
        weaponId: z.weaponId,
        vfxKey: z.vfxKey,
        x: z.x,
        y: z.y,
        endX: z.endX,
        endY: z.endY,
        radius: z.radius,
        rotation: z.rotation,
        progress,
        alpha: z.alpha,
        flipX: z.flipX,
        tint: z.tint,
      };
      out.push(slot);
    } else {
      slot.uid = z.uid;
      slot.kind = z.kind;
      slot.weaponId = z.weaponId;
      slot.vfxKey = z.vfxKey;
      slot.x = z.x;
      slot.y = z.y;
      slot.endX = z.endX;
      slot.endY = z.endY;
      slot.radius = z.radius;
      slot.rotation = z.rotation;
      slot.progress = progress;
      slot.alpha = z.alpha;
      slot.flipX = z.flipX;
      slot.tint = z.tint;
    }
  }
  out.length = count;
}

/** Fill a reusable RenderProjectileState array with projectiles only. */
export function fillRenderProjectiles(
  projectiles: readonly ActiveProjectile[],
  out: RenderProjectileState[],
): void {
  const count = projectiles.length;
  for (let i = 0; i < count; i++) {
    const p = projectiles[i]!;
    let slot = out[i];
    if (!slot) {
      slot = {
        uid: p.uid,
        weaponId: p.weaponId,
        vfxKey: p.vfxKey,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        rotation: p.rotation,
        scale: p.scale,
        alpha: p.alpha,
      };
      out.push(slot);
    } else {
      slot.uid = p.uid;
      slot.weaponId = p.weaponId;
      slot.vfxKey = p.vfxKey;
      slot.x = p.x;
      slot.y = p.y;
      slot.vx = p.vx;
      slot.vy = p.vy;
      slot.rotation = p.rotation;
      slot.scale = p.scale;
      slot.alpha = p.alpha;
    }
  }
  out.length = count;
}

/** Fill a reusable RenderProjectileState array with both active projectiles and orbiters. */
export function fillRenderProjectilesAndOrbiters(
  projectiles: readonly ActiveProjectile[],
  orbiters: readonly ActiveOrbiter[],
  playerX: number,
  playerY: number,
  out: RenderProjectileState[],
): void {
  let cursor = 0;
  const pLen = projectiles.length;
  for (let i = 0; i < pLen; i++) {
    const p = projectiles[i]!;
    let slot = out[cursor];
    if (!slot) {
      slot = {
        uid: p.uid,
        weaponId: p.weaponId,
        vfxKey: p.vfxKey,
        x: p.x,
        y: p.y,
        vx: p.vx,
        vy: p.vy,
        rotation: p.rotation,
        scale: p.scale,
        alpha: p.alpha,
      };
      out.push(slot);
    } else {
      slot.uid = p.uid;
      slot.weaponId = p.weaponId;
      slot.vfxKey = p.vfxKey;
      slot.x = p.x;
      slot.y = p.y;
      slot.vx = p.vx;
      slot.vy = p.vy;
      slot.rotation = p.rotation;
      slot.scale = p.scale;
      slot.alpha = p.alpha;
    }
    cursor++;
  }

  const oLen = orbiters.length;
  for (let i = 0; i < oLen; i++) {
    const o = orbiters[i]!;
    const ox = playerX + Math.cos(o.angle) * o.orbitRadius;
    const oy = playerY + Math.sin(o.angle) * o.orbitRadius;
    const rot = o.angle + Math.PI * 0.5;
    const scale = Math.max(0.85, o.hitRadius / 22);
    let slot = out[cursor];
    if (!slot) {
      slot = {
        uid: o.uid,
        weaponId: o.weaponId,
        vfxKey: o.vfxKey,
        x: ox,
        y: oy,
        vx: 0,
        vy: 0,
        rotation: rot,
        scale,
        alpha: 1,
      };
      out.push(slot);
    } else {
      slot.uid = o.uid;
      slot.weaponId = o.weaponId;
      slot.vfxKey = o.vfxKey;
      slot.x = ox;
      slot.y = oy;
      slot.vx = 0;
      slot.vy = 0;
      slot.rotation = rot;
      slot.scale = scale;
      slot.alpha = 1;
    }
    cursor++;
  }
  out.length = cursor;
}

/** Fill a reusable RenderBeamState array in place with zero per-frame allocations. */
export function fillRenderBeams(
  beams: readonly ActiveBeam[],
  playerX: number,
  playerY: number,
  out: RenderBeamState[],
): void {
  const count = beams.length;
  for (let i = 0; i < count; i++) {
    const b = beams[i]!;
    const x2 = playerX + Math.cos(b.angle) * b.length;
    const y2 = playerY + Math.sin(b.angle) * b.length;
    const alpha = Math.min(1, b.life * 4);
    let slot = out[i];
    if (!slot) {
      slot = {
        uid: b.uid,
        weaponId: b.weaponId,
        vfxKey: b.vfxKey,
        x1: playerX,
        y1: playerY,
        x2,
        y2,
        width: b.width,
        alpha,
        color: b.color,
      };
      out.push(slot);
    } else {
      slot.uid = b.uid;
      slot.weaponId = b.weaponId;
      slot.vfxKey = b.vfxKey;
      slot.x1 = playerX;
      slot.y1 = playerY;
      slot.x2 = x2;
      slot.y2 = y2;
      slot.width = b.width;
      slot.alpha = alpha;
      slot.color = b.color;
    }
  }
  out.length = count;
}
