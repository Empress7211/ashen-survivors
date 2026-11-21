/**
 * Zero-allocation 2D spatial hash grid backed by flat typed arrays.
 * Supports 1,500+ active entities with radius, rect, arc, line/beam, and nearest queries.
 */
export class SpatialHashGrid {
  readonly cellSize: number;
  private readonly invCellSize: number;
  private readonly bucketCount: number;
  private readonly bucketMask: number;
  private readonly buckets: Int32Array;

  private capacity: number;
  private xs: Float64Array;
  private ys: Float64Array;
  private radii: Float64Array;
  private next: Int32Array;
  private stamps: Uint32Array;
  private activeIds: Int32Array;
  private activeCount = 0;
  private maxEntityRadius = 0;
  private queryStamp = 1;

  constructor(cellSize = 96, initialCapacity = 2048, bucketPower = 13) {
    this.cellSize = cellSize;
    this.invCellSize = 1 / cellSize;
    this.bucketCount = 1 << bucketPower; // 8192 buckets by default
    this.bucketMask = this.bucketCount - 1;
    this.buckets = new Int32Array(this.bucketCount);
    this.buckets.fill(-1);

    this.capacity = Math.max(64, initialCapacity);
    this.xs = new Float64Array(this.capacity);
    this.ys = new Float64Array(this.capacity);
    this.radii = new Float64Array(this.capacity);
    this.next = new Int32Array(this.capacity);
    this.stamps = new Uint32Array(this.capacity);
    this.activeIds = new Int32Array(this.capacity);
  }

  get count(): number {
    return this.activeCount;
  }

  getX(id: number): number {
    return this.xs[id]!;
  }

  getY(id: number): number {
    return this.ys[id]!;
  }

  getRadius(id: number): number {
    return this.radii[id]!;
  }

  queryCellSample(
    x: number,
    y: number,
    out: number[],
    maxCount = 6,
  ): number {
    out.length = 0;
    if (this.activeCount === 0) return 0;
    const cx = Math.floor(x * this.invCellSize);
    const cy = Math.floor(y * this.invCellSize);
    let idx = this.buckets[this.hashCell(cx, cy)]!;
    while (idx !== -1 && out.length < maxCount) {
      out.push(idx);
      idx = this.next[idx]!;
    }
    return out.length;
  }

  clear(): void {
    this.buckets.fill(-1);
    this.activeCount = 0;
    this.maxEntityRadius = 0;
  }

  insert(id: number, x: number, y: number, radius = 0): void {
    if (id < 0) {
      throw new RangeError(`SpatialHashGrid id must be >= 0, got ${id}`);
    }
    if (id >= this.capacity || this.activeCount >= this.capacity) {
      this.grow(Math.max(id + 1, this.activeCount + 1));
    }

    const cx = Math.floor(x * this.invCellSize);
    const cy = Math.floor(y * this.invCellSize);
    const bucket = this.hashCell(cx, cy);

    this.xs[id] = x;
    this.ys[id] = y;
    this.radii[id] = radius;
    if (radius > this.maxEntityRadius) {
      this.maxEntityRadius = radius;
    }

    this.next[id] = this.buckets[bucket]!;
    this.buckets[bucket] = id;
    this.activeIds[this.activeCount++] = id;
  }

  queryRadius(
    x: number,
    y: number,
    radius: number,
    out: number[],
    includeEntityRadius = true,
  ): number {
    out.length = 0;
    if (this.activeCount === 0 || radius < 0) return 0;

    const pad = includeEntityRadius ? this.maxEntityRadius : 0;
    const searchR = radius + pad;
    const minCx = Math.floor((x - searchR) * this.invCellSize);
    const maxCx = Math.floor((x + searchR) * this.invCellSize);
    const minCy = Math.floor((y - searchR) * this.invCellSize);
    const maxCy = Math.floor((y + searchR) * this.invCellSize);

    const stamp = this.nextStamp();
    const baseRSq = radius * radius;

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let idx = this.buckets[this.hashCell(cx, cy)]!;
        while (idx !== -1) {
          if (this.stamps[idx] !== stamp) {
            this.stamps[idx] = stamp;
            const dx = this.xs[idx]! - x;
            const dy = this.ys[idx]! - y;
            const distSq = dx * dx + dy * dy;
            if (includeEntityRadius) {
              const rSum = radius + this.radii[idx]!;
              if (distSq <= rSum * rSum) {
                out.push(idx);
              }
            } else if (distSq <= baseRSq) {
              out.push(idx);
            }
          }
          idx = this.next[idx]!;
        }
      }
    }
    return out.length;
  }

  queryRect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    out: number[],
    includeEntityRadius = true,
  ): number {
    out.length = 0;
    if (this.activeCount === 0 || maxX < minX || maxY < minY) return 0;

    const pad = includeEntityRadius ? this.maxEntityRadius : 0;
    const minCx = Math.floor((minX - pad) * this.invCellSize);
    const maxCx = Math.floor((maxX + pad) * this.invCellSize);
    const minCy = Math.floor((minY - pad) * this.invCellSize);
    const maxCy = Math.floor((maxY + pad) * this.invCellSize);

    const stamp = this.nextStamp();

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let idx = this.buckets[this.hashCell(cx, cy)]!;
        while (idx !== -1) {
          if (this.stamps[idx] !== stamp) {
            this.stamps[idx] = stamp;
            const ex = this.xs[idx]!;
            const ey = this.ys[idx]!;
            const er = includeEntityRadius ? this.radii[idx]! : 0;
            if (
              ex + er >= minX &&
              ex - er <= maxX &&
              ey + er >= minY &&
              ey - er <= maxY
            ) {
              out.push(idx);
            }
          }
          idx = this.next[idx]!;
        }
      }
    }
    return out.length;
  }

  queryArc(
    x: number,
    y: number,
    radius: number,
    dirX: number,
    dirY: number,
    halfAngleRad: number,
    out: number[],
    includeEntityRadius = true,
  ): number {
    out.length = 0;
    if (this.activeCount === 0 || radius < 0 || halfAngleRad < 0) return 0;
    if (halfAngleRad >= Math.PI) {
      return this.queryRadius(x, y, radius, out, includeEntityRadius);
    }

    const dirLen = Math.hypot(dirX, dirY);
    const nx = dirLen > 1e-8 ? dirX / dirLen : 1;
    const ny = dirLen > 1e-8 ? dirY / dirLen : 0;
    const cosThreshold = Math.cos(halfAngleRad);

    const pad = includeEntityRadius ? this.maxEntityRadius : 0;
    const searchR = radius + pad;
    const minCx = Math.floor((x - searchR) * this.invCellSize);
    const maxCx = Math.floor((x + searchR) * this.invCellSize);
    const minCy = Math.floor((y - searchR) * this.invCellSize);
    const maxCy = Math.floor((y + searchR) * this.invCellSize);

    const stamp = this.nextStamp();

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let idx = this.buckets[this.hashCell(cx, cy)]!;
        while (idx !== -1) {
          if (this.stamps[idx] !== stamp) {
            this.stamps[idx] = stamp;
            const dx = this.xs[idx]! - x;
            const dy = this.ys[idx]! - y;
            const er = includeEntityRadius ? this.radii[idx]! : 0;
            const rSum = radius + er;
            const distSq = dx * dx + dy * dy;
            if (distSq <= rSum * rSum) {
              const dist = Math.sqrt(distSq);
              if (dist <= Math.max(1e-6, er)) {
                out.push(idx);
              } else if (dx * nx + dy * ny >= cosThreshold * dist) {
                out.push(idx);
              }
            }
          }
          idx = this.next[idx]!;
        }
      }
    }
    return out.length;
  }

  queryLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    halfWidth: number,
    out: number[],
    includeEntityRadius = true,
  ): number {
    out.length = 0;
    if (this.activeCount === 0 || halfWidth < 0) return 0;

    const vx = x2 - x1;
    const vy = y2 - y1;
    const lenSq = vx * vx + vy * vy;
    if (lenSq <= 1e-8) {
      return this.queryRadius(x1, y1, halfWidth, out, includeEntityRadius);
    }

    const len = Math.sqrt(lenSq);
    const pad = halfWidth + (includeEntityRadius ? this.maxEntityRadius : 0);
    const step = this.cellSize * 0.5;
    const steps = Math.max(1, Math.ceil(len / step));
    const cellPad = Math.ceil(pad * this.invCellSize);

    const stamp = this.nextStamp();

    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const sx = x1 + vx * u;
      const sy = y1 + vy * u;
      const centerCx = Math.floor(sx * this.invCellSize);
      const centerCy = Math.floor(sy * this.invCellSize);

      for (let cy = centerCy - cellPad; cy <= centerCy + cellPad; cy++) {
        for (let cx = centerCx - cellPad; cx <= centerCx + cellPad; cx++) {
          let idx = this.buckets[this.hashCell(cx, cy)]!;
          while (idx !== -1) {
            if (this.stamps[idx] !== stamp) {
              this.stamps[idx] = stamp;
              const px = this.xs[idx]!;
              const py = this.ys[idx]!;
              let t = ((px - x1) * vx + (py - y1) * vy) / lenSq;
              if (t < 0) t = 0;
              else if (t > 1) t = 1;
              const projX = x1 + t * vx;
              const projY = y1 + t * vy;
              const dx = px - projX;
              const dy = py - projY;
              const hitR = halfWidth + (includeEntityRadius ? this.radii[idx]! : 0);
              if (dx * dx + dy * dy <= hitR * hitR) {
                out.push(idx);
              }
            }
            idx = this.next[idx]!;
          }
        }
      }
    }
    return out.length;
  }

  queryNearest(
    x: number,
    y: number,
    maxRadius = Infinity,
    filter?: (id: number) => boolean,
    includeEntityRadius = false,
  ): number {
    if (this.activeCount === 0 || maxRadius <= 0) return -1;

    const cx0 = Math.floor(x * this.invCellSize);
    const cy0 = Math.floor(y * this.invCellSize);
    const finiteMax = Number.isFinite(maxRadius);
    const pad = includeEntityRadius ? this.maxEntityRadius : 0;
    const maxRings = finiteMax
      ? Math.ceil((maxRadius + pad) * this.invCellSize) + 1
      : 12;
    const ringCap = Math.min(maxRings, 16);

    const stamp = this.nextStamp();
    let bestId = -1;
    let bestDist = Infinity;
    let bestDistSq = Infinity;

    for (let ring = 0; ring <= ringCap; ring++) {
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring > 0 && Math.abs(dx) < ring && Math.abs(dy) < ring) {
            continue;
          }
          let idx = this.buckets[this.hashCell(cx0 + dx, cy0 + dy)]!;
          while (idx !== -1) {
            if (this.stamps[idx] !== stamp) {
              this.stamps[idx] = stamp;
              if (!filter || filter(idx)) {
                const ex = this.xs[idx]! - x;
                const ey = this.ys[idx]! - y;
                const dSq = ex * ex + ey * ey;
                if (includeEntityRadius) {
                  const er = this.radii[idx]!;
                  const d = Math.max(0, Math.sqrt(dSq) - er);
                  if (d <= maxRadius && d < bestDist) {
                    bestDist = d;
                    bestDistSq = d * d;
                    bestId = idx;
                  }
                } else if (
                  (!finiteMax || dSq <= maxRadius * maxRadius) &&
                  dSq < bestDistSq
                ) {
                  bestDistSq = dSq;
                  bestDist = Math.sqrt(dSq);
                  bestId = idx;
                }
              }
            }
            idx = this.next[idx]!;
          }
        }
      }

      if (bestId !== -1) {
        const minNextRingDist = Math.max(0, ring * this.cellSize - pad);
        if (bestDist <= minNextRingDist) {
          return bestId;
        }
      }
    }

    if (finiteMax && maxRings <= ringCap) {
      return bestId;
    }

    // Fallback scan over remaining unvisited active entities when target is far away
    for (let i = 0; i < this.activeCount; i++) {
      const idx = this.activeIds[i]!;
      if (this.stamps[idx] === stamp) continue;
      if (filter && !filter(idx)) continue;
      const ex = this.xs[idx]! - x;
      const ey = this.ys[idx]! - y;
      const dSq = ex * ex + ey * ey;
      if (includeEntityRadius) {
        const er = this.radii[idx]!;
        const d = Math.max(0, Math.sqrt(dSq) - er);
        if (d <= maxRadius && d < bestDist) {
          bestDist = d;
          bestDistSq = d * d;
          bestId = idx;
        }
      } else if (
        (!finiteMax || dSq <= maxRadius * maxRadius) &&
        dSq < bestDistSq
      ) {
        bestDistSq = dSq;
        bestId = idx;
      }
    }

    return bestId;
  }

  private hashCell(cx: number, cy: number): number {
    return ((Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & this.bucketMask);
  }

  private nextStamp(): number {
    this.queryStamp = (this.queryStamp + 1) >>> 0;
    if (this.queryStamp === 0) {
      this.stamps.fill(0);
      this.queryStamp = 1;
    }
    return this.queryStamp;
  }

  private grow(minCapacity: number): void {
    let nextCap = this.capacity;
    while (nextCap < minCapacity) {
      nextCap *= 2;
    }
    const nextXs = new Float64Array(nextCap);
    nextXs.set(this.xs);
    const nextYs = new Float64Array(nextCap);
    nextYs.set(this.ys);
    const nextRadii = new Float64Array(nextCap);
    nextRadii.set(this.radii);
    const nextLinks = new Int32Array(nextCap);
    nextLinks.set(this.next);
    const nextStamps = new Uint32Array(nextCap);
    nextStamps.set(this.stamps);
    const nextActive = new Int32Array(nextCap);
    nextActive.set(this.activeIds);

    this.xs = nextXs;
    this.ys = nextYs;
    this.radii = nextRadii;
    this.next = nextLinks;
    this.stamps = nextStamps;
    this.activeIds = nextActive;
    this.capacity = nextCap;
  }
}
