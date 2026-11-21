import type {
  Catalog,
  ChestTier,
  EnemyId,
  PickupId,
  PropId,
  StageCorridorBounds,
} from '../contracts/index.ts';
import type { SeededRng } from './Rng.ts';
import { SpatialHashGrid } from './SpatialHashGrid.ts';

export interface EnemyInstance {
  uid: number;
  enemyId: EnemyId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  knockVx: number;
  knockVy: number;
  facingX: -1 | 1;
  radius: number;
  scale: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  knockbackResistance: number;
  xpValue: number;
  xpTier: 'xp_blue' | 'xp_green' | 'xp_red' | 'xp_gold';
  hitFlashTimer: number;
  freezeTimer: number;
  garlicDebuffTimer: number;
  isBoss: boolean;
  isReaper: boolean;
  ignoresWalls: boolean;
  chestTier?: ChestTier;
  canEvolveChest?: boolean;
  swarmDirX: number;
  swarmDirY: number;
  swarmTimer: number;
  animTimer: number;
  animFrame: 0 | 1 | 2 | 3;
  tint?: number;
  alive: boolean;
}

export interface PropInstance {
  uid: number;
  propId: PropId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  broken: boolean;
  hitFlashTimer: number;
  rubbleDespawnTimer: number;
}

export interface SpawnEnemyOptions {
  hpScale?: number;
  speedScale?: number;
  damageScale?: number;
  chestTier?: ChestTier;
  canEvolveChest?: boolean;
  swarmDirX?: number;
  swarmDirY?: number;
  swarmTimer?: number;
}

export interface EnemyDamageOptions {
  knockX?: number;
  knockY?: number;
  knockForce?: number;
  ignoreFreeze?: boolean;
}

export class EnemySystem {
  readonly catalog: Catalog;
  readonly grid: SpatialHashGrid;
  readonly enemies: EnemyInstance[] = [];
  readonly props: PropInstance[] = [];

  private nextUid = 1;
  private readonly sepScratch: number[] = [];

  constructor(catalog: Catalog, cellSize = 96) {
    this.catalog = catalog;
    this.grid = new SpatialHashGrid(cellSize, 2048, 13);
  }

  get activeCount(): number {
    return this.enemies.length;
  }

  allocateUid(): number {
    return this.nextUid++;
  }

  spawnEnemy(
    enemyId: EnemyId,
    x: number,
    y: number,
    opts?: SpawnEnemyOptions,
  ): EnemyInstance {
    const def = this.catalog.enemies[enemyId];
    const hpScale = opts?.hpScale ?? 1;
    const speedScale = opts?.speedScale ?? 1;
    const damageScale = opts?.damageScale ?? 1;

    const maxHp = Math.max(1, Math.round(def.maxHp * hpScale));
    let chestTier = opts?.chestTier;
    if (!chestTier && def.bossChestTier) {
      if (def.bossChestTier === 'chest_bronze') chestTier = 'bronze';
      else if (def.bossChestTier === 'chest_silver') chestTier = 'silver';
      else if (def.bossChestTier === 'chest_gold') chestTier = 'gold';
      else if (def.bossChestTier === 'chest_arcana') chestTier = 'arcana';
    }

    const inst: EnemyInstance = {
      uid: this.nextUid++,
      enemyId,
      x,
      y,
      vx: 0,
      vy: 0,
      knockVx: 0,
      knockVy: 0,
      facingX: 1,
      radius: def.radius,
      scale: def.spriteScale,
      hp: maxHp,
      maxHp,
      damage: Math.max(1, Math.round(def.damage * damageScale)),
      speed: def.speed * speedScale,
      knockbackResistance: def.knockbackResistance,
      xpValue: def.xpValue,
      xpTier: def.xpTier,
      hitFlashTimer: 0,
      freezeTimer: 0,
      garlicDebuffTimer: 0,
      isBoss: def.isBoss,
      isReaper: def.isReaper,
      ignoresWalls: Boolean(def.ignoresWalls),
      chestTier,
      canEvolveChest: opts?.canEvolveChest ?? def.canEvolveChest ?? false,
      swarmDirX: opts?.swarmDirX ?? 0,
      swarmDirY: opts?.swarmDirY ?? 0,
      swarmTimer: opts?.swarmTimer ?? 0,
      animTimer: (this.nextUid % 4) * 0.11,
      animFrame: ((this.nextUid % 4) as 0 | 1 | 2 | 3),
      tint: def.tint,
      alive: true,
    };
    this.enemies.push(inst);
    return inst;
  }

  spawnProp(propId: PropId, x: number, y: number): PropInstance {
    const def = this.catalog.props[propId];
    const prop: PropInstance = {
      uid: this.nextUid++,
      propId,
      x,
      y,
      hp: def.maxHp,
      maxHp: def.maxHp,
      radius: def.radius,
      broken: false,
      hitFlashTimer: 0,
      rubbleDespawnTimer: 12,
    };
    this.props.push(prop);
    return prop;
  }

  damageEnemy(
    index: number,
    rawDamage: number,
    opts?: EnemyDamageOptions,
  ): { dealt: number; killed: boolean; enemy: EnemyInstance | null } {
    const enemy = this.enemies[index];
    if (!enemy || !enemy.alive || rawDamage <= 0) {
      return { dealt: 0, killed: false, enemy: null };
    }

    const dealt = Math.max(1, Math.round(rawDamage));
    enemy.hp -= dealt;
    enemy.hitFlashTimer = 0.09; // 90ms white flash

    if (opts?.knockForce && opts.knockForce > 0) {
      let resist = enemy.knockbackResistance;
      if (enemy.garlicDebuffTimer > 0) {
        resist = Math.max(0, resist - 0.25);
      }
      const effectiveForce = opts.knockForce * (1 - Math.min(1, resist));
      if (effectiveForce > 0.5) {
        const kx = opts.knockX ?? 0;
        const ky = opts.knockY ?? 0;
        const len = Math.hypot(kx, ky);
        if (len > 1e-6) {
          enemy.knockVx += (kx / len) * effectiveForce * 6;
          enemy.knockVy += (ky / len) * effectiveForce * 6;
        }
      }
    }

    if (enemy.hp <= 0) {
      enemy.hp = 0;
      enemy.alive = false;
      return { dealt, killed: true, enemy };
    }
    return { dealt, killed: false, enemy };
  }

  freezeEnemy(index: number, seconds: number): boolean {
    const enemy = this.enemies[index];
    if (!enemy || !enemy.alive || seconds <= 0) return false;
    let duration = seconds;
    if (enemy.isReaper) {
      duration *= 0.45;
    } else if (enemy.isBoss) {
      duration *= 0.65;
    }
    if (enemy.garlicDebuffTimer > 0) {
      duration *= 1.15;
    }
    if (duration > enemy.freezeTimer) {
      enemy.freezeTimer = duration;
    }
    return true;
  }

  applyGarlicDebuff(index: number, seconds = 1.5): void {
    const enemy = this.enemies[index];
    if (!enemy || !enemy.alive) return;
    if (seconds > enemy.garlicDebuffTimer) {
      enemy.garlicDebuffTimer = seconds;
    }
  }

  damageProp(
    propIndex: number,
    damage: number,
  ): { hit: boolean; brokenNow: boolean; prop: PropInstance | null } {
    const prop = this.props[propIndex];
    if (!prop || prop.broken || damage <= 0) {
      return { hit: false, brokenNow: false, prop: null };
    }
    prop.hp -= Math.max(1, Math.round(damage));
    prop.hitFlashTimer = 0.09;
    if (prop.hp <= 0) {
      prop.hp = 0;
      prop.broken = true;
      return { hit: true, brokenNow: true, prop };
    }
    return { hit: true, brokenNow: false, prop };
  }

  rollPropLoot(
    rng: SeededRng,
    luck: number,
    orologionChanceBonus = 0,
  ): PickupId | null {
    // ~55% chance to drop loot on breaking a prop, scaled mildly with Luck
    const dropChance = Math.min(0.92, 0.52 + Math.max(0, luck - 1) * 0.14);
    if (!rng.chance(dropChance)) return null;

    const luckBoost = Math.max(0, luck - 1);
    const oroWeight = 2 + luckBoost * 3 + orologionChanceBonus * 100;
    const rosaryWeight = 2 + luckBoost * 2.5;
    const vacuumWeight = 3 + luckBoost * 2.5;
    const chickenWeight = 16 + luckBoost * 4;
    const goldBagWeight = 10 + luckBoost * 5;
    const coinWeight = 58;

    const items: PickupId[] = [
      'coin',
      'gold_bag',
      'roast_chicken',
      'vacuum_orb',
      'rosary',
      'orologion',
    ];
    const weights = [
      coinWeight,
      goldBagWeight,
      chickenWeight,
      vacuumWeight,
      rosaryWeight,
      oroWeight,
    ];
    return items[rng.weightedIndex(weights)]!;
  }

  compactDead(): void {
    let i = 0;
    while (i < this.enemies.length) {
      if (!this.enemies[i]!.alive) {
        const last = this.enemies.pop()!;
        if (i < this.enemies.length) {
          this.enemies[i] = last;
        }
      } else {
        i++;
      }
    }
  }

  rebuildGrid(): void {
    this.grid.clear();
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!;
      if (e.alive) {
        this.grid.insert(i, e.x, e.y, e.radius);
      }
    }
  }

  clampPlayerPosition(
    x: number,
    y: number,
    radius: number,
    corridorBounds?: StageCorridorBounds,
  ): { x: number; y: number } {
    let px = x;
    let py = y;

    if (corridorBounds) {
      if (corridorBounds.minX !== undefined) {
        px = Math.max(corridorBounds.minX + radius, px);
      }
      if (corridorBounds.maxX !== undefined) {
        px = Math.min(corridorBounds.maxX - radius, px);
      }
      if (corridorBounds.minY !== undefined) {
        py = Math.max(corridorBounds.minY + radius, py);
      }
      if (corridorBounds.maxY !== undefined) {
        py = Math.min(corridorBounds.maxY - radius, py);
      }
    }

    // Soft push-out against unbroken solid props
    for (let i = 0; i < this.props.length; i++) {
      const p = this.props[i]!;
      if (p.broken) continue;
      const dx = px - p.x;
      const dy = py - p.y;
      const minDist = radius + p.radius * 0.72;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        const dist = Math.sqrt(distSq);
        if (dist > 1e-5) {
          const push = minDist - dist;
          px += (dx / dist) * push;
          py += (dy / dist) * push;
        } else {
          px += minDist;
        }
      }
    }

    // Re-enforce corridor bounds after prop push-out
    if (corridorBounds) {
      if (corridorBounds.minX !== undefined) {
        px = Math.max(corridorBounds.minX + radius, px);
      }
      if (corridorBounds.maxX !== undefined) {
        px = Math.min(corridorBounds.maxX - radius, px);
      }
      if (corridorBounds.minY !== undefined) {
        py = Math.max(corridorBounds.minY + radius, py);
      }
      if (corridorBounds.maxY !== undefined) {
        py = Math.min(corridorBounds.maxY - radius, py);
      }
    }

    return { x: px, y: py };
  }

  update(
    dt: number,
    tick: number,
    playerX: number,
    playerY: number,
    corridorBounds?: StageCorridorBounds,
  ): void {
    // First remove any enemies killed in the previous frame
    this.compactDead();

    const knockDecay = Math.pow(0.82, dt * 60);
    const list = this.enemies;
    const minX = corridorBounds?.minX;
    const maxX = corridorBounds?.maxX;
    const minY = corridorBounds?.minY;
    const maxY = corridorBounds?.maxY;

    // Update props timers & cull old far-off props
    let pi = 0;
    while (pi < this.props.length) {
      const p = this.props[pi]!;
      if (p.hitFlashTimer > 0) {
        p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
      }
      if (p.broken) {
        p.rubbleDespawnTimer -= dt;
      }
      const distSq = (p.x - playerX) * (p.x - playerX) + (p.y - playerY) * (p.y - playerY);
      if ((p.broken && p.rubbleDespawnTimer <= 0) || distSq > 2600 * 2600) {
        const last = this.props.pop()!;
        if (pi < this.props.length) {
          this.props[pi] = last;
        }
      } else {
        pi++;
      }
    }

    // Move active enemies & update timers
    let i = 0;
    while (i < list.length) {
      const e = list[i]!;
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - dt);
      }
      if (e.garlicDebuffTimer > 0) {
        e.garlicDebuffTimer = Math.max(0, e.garlicDebuffTimer - dt);
      }

      if (e.freezeTimer > 0) {
        e.freezeTimer = Math.max(0, e.freezeTimer - dt);
        e.vx = 0;
        e.vy = 0;
      } else {
        e.animTimer += dt;
        if (e.animTimer >= 0.14) {
          e.animTimer -= 0.14;
          e.animFrame = (((e.animFrame + 1) & 3) as 0 | 1 | 2 | 3);
        }

        if (e.swarmTimer > 0) {
          e.swarmTimer -= dt;
          e.vx = e.swarmDirX * e.speed;
          e.vy = e.swarmDirY * e.speed;
        } else {
          const dx = playerX - e.x;
          const dy = playerY - e.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 1e-4) {
            e.vx = (dx / dist) * e.speed;
            e.vy = (dy / dist) * e.speed;
            if (Math.abs(dx) > 1.5) {
              e.facingX = dx >= 0 ? 1 : -1;
            }
          } else {
            e.vx = 0;
            e.vy = 0;
          }
        }
      }

      e.x += (e.vx + e.knockVx) * dt;
      e.y += (e.vy + e.knockVy) * dt;
      e.knockVx *= knockDecay;
      e.knockVy *= knockDecay;
      if (Math.abs(e.knockVx) < 1) e.knockVx = 0;
      if (Math.abs(e.knockVy) < 1) e.knockVy = 0;

      // Corridor clamping for non-wall-ignoring enemies
      if (!e.ignoresWalls && corridorBounds) {
        if (minX !== undefined && e.x < minX + e.radius) {
          e.x = minX + e.radius;
        } else if (maxX !== undefined && e.x > maxX - e.radius) {
          e.x = maxX - e.radius;
        }
        if (minY !== undefined && e.y < minY + e.radius) {
          e.y = minY + e.radius;
        } else if (maxY !== undefined && e.y > maxY - e.radius) {
          e.y = maxY - e.radius;
        }
      }

      // Cull regular enemies that wander far offscreen so spawn budget stays around player
      const dxP = e.x - playerX;
      const dyP = e.y - playerY;
      if (!e.isBoss && !e.isReaper && dxP * dxP + dyP * dyP > 1300 * 1300) {
        const last = list.pop()!;
        if (i < list.length) {
          list[i] = last;
        }
        continue;
      }
      i++;
    }

    // Rebuild grid once after movement
    this.rebuildGrid();

    // Lightweight staggered soft separation in local cell so dense hordes stay readable
    const parity = tick & 1;
    const scratch = this.sepScratch;
    for (let idx = parity; idx < list.length; idx += 2) {
      const e = list[idx]!;
      if (e.freezeTimer > 0) continue;
      const count = this.grid.queryCellSample(e.x, e.y, scratch, 5);
      for (let j = 0; j < count; j++) {
        const otherIdx = scratch[j]!;
        if (otherIdx === idx) continue;
        const o = list[otherIdx]!;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const minD = (e.radius + o.radius) * 0.72;
        const distSq = dx * dx + dy * dy;
        if (distSq < minD * minD) {
          if (distSq > 1e-4) {
            const dist = Math.sqrt(distSq);
            const push = (minD - dist) * 0.25;
            e.x += (dx / dist) * push;
            e.y += (dy / dist) * push;
          } else {
            e.x += ((idx & 1) === 0 ? 1 : -1) * 1.5;
          }
        }
      }

      // Soft prop push-out for non-wall-ignoring enemies
      if (!e.ignoresWalls) {
        for (let k = 0; k < this.props.length; k++) {
          const p = this.props[k]!;
          if (p.broken) continue;
          const dx = e.x - p.x;
          const dy = e.y - p.y;
          const minD = e.radius + p.radius * 0.65;
          const distSq = dx * dx + dy * dy;
          if (distSq < minD * minD && distSq > 1e-4) {
            const dist = Math.sqrt(distSq);
            const push = minD - dist;
            e.x += (dx / dist) * push;
            e.y += (dy / dist) * push;
          }
        }
        if (corridorBounds) {
          if (minX !== undefined && e.x < minX + e.radius) e.x = minX + e.radius;
          if (maxX !== undefined && e.x > maxX - e.radius) e.x = maxX - e.radius;
          if (minY !== undefined && e.y < minY + e.radius) e.y = minY + e.radius;
          if (maxY !== undefined && e.y > maxY - e.radius) e.y = maxY - e.radius;
        }
      }
    }

    // Finalize grid positions if separation nudged entities across cells
    this.rebuildGrid();
  }
}
