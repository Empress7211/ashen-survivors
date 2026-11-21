/**
 * Zero-dependency ISO/IEC 18004 Byte-mode QR Code encoder (Error Correction Level L, Mask 0).
 * Supports Version 2-L (<= 32 bytes), Version 3-L (<= 53 bytes), and Version 4-L (<= 78 bytes).
 */

interface QrVersionSpec {
  version: number;
  size: number;
  alignmentCenter: number;
  totalCodewords: number;
  dataCodewords: number;
  ecCodewords: number;
}

const QR_SPECS: readonly QrVersionSpec[] = [
  { version: 2, size: 25, alignmentCenter: 18, totalCodewords: 44, dataCodewords: 34, ecCodewords: 10 },
  { version: 3, size: 29, alignmentCenter: 22, totalCodewords: 70, dataCodewords: 55, ecCodewords: 15 },
  { version: 4, size: 33, alignmentCenter: 26, totalCodewords: 100, dataCodewords: 80, ecCodewords: 20 },
];

// Format info for Level L (01) + Mask 0 (000) with BCH(15,5) + 0x5412 mask = 0x77c4
const FORMAT_BITS_L_MASK0 = 0x77c4;

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!;
  }
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!;
}

function buildRsGenerator(ecCount: number): Uint8Array {
  let poly: Uint8Array = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const root = GF_EXP[i]!;
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j]! ^ poly[j]!) & 0xff;
      next[j + 1] = (next[j + 1]! ^ gfMul(poly[j]!, root)) & 0xff;
    }
    poly = next;
  }
  return poly;
}

function computeRsEc(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = buildRsGenerator(ecCount);
  const work = new Uint8Array(data.length + ecCount);
  work.set(data, 0);
  for (let i = 0; i < data.length; i++) {
    const factor = work[i]!;
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) {
      work[i + j] = (work[i + j]! ^ gfMul(gen[j]!, factor)) & 0xff;
    }
  }
  return work.slice(data.length);
}

function encodeUtf8Bytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    out.push(text.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}

function pickVersion(byteLength: number): QrVersionSpec {
  for (const spec of QR_SPECS) {
    // 4-bit mode + 8-bit length = 12 bits overhead -> usable data bytes = dataCodewords - 2
    if (byteLength <= spec.dataCodewords - 2) {
      return spec;
    }
  }
  throw new Error(`QR payload too long (${byteLength} bytes, max ${QR_SPECS[QR_SPECS.length - 1]!.dataCodewords - 2})`);
}

function buildDataCodewords(bytes: Uint8Array, dataCodewords: number): Uint8Array {
  const bits: number[] = [];
  const pushBits = (value: number, bitCount: number): void => {
    for (let i = bitCount - 1; i >= 0; i--) {
      bits.push((value >>> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(bytes.length, 8); // Versions 1..9 byte count
  for (let i = 0; i < bytes.length; i++) {
    pushBits(bytes[i]!, 8);
  }

  const maxBits = dataCodewords * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminator; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const out = new Uint8Array(dataCodewords);
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) {
      b = (b << 1) | bits[i + k]!;
    }
    out[i >> 3] = b;
  }

  let padIdx = bits.length >> 3;
  let toggle = true;
  while (padIdx < dataCodewords) {
    out[padIdx++] = toggle ? 0xec : 0x11;
    toggle = !toggle;
  }
  return out;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const payload = encodeUtf8Bytes(text);
  const spec = pickVersion(payload.length);
  const { size, alignmentCenter, dataCodewords, ecCodewords } = spec;

  const data = buildDataCodewords(payload, dataCodewords);
  const ec = computeRsEc(data, ecCodewords);
  const codewords = new Uint8Array(data.length + ec.length);
  codewords.set(data, 0);
  codewords.set(ec, data.length);

  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const reserved: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunctionModule = (r: number, c: number, dark: boolean): void => {
    if (r < 0 || r >= size || c < 0 || c >= size) return;
    modules[r]![c] = dark;
    reserved[r]![c] = true;
  };

  const drawFinder = (topR: number, leftC: number): void => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = topR + dr;
        const c = leftC + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        const isBorder = dr === 0 || dr === 6 || dc === 0 || dc === 6;
        const isCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFunctionModule(r, c, inBox && (isBorder || isCore));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns along row 6 and col 6
  for (let i = 8; i < size - 8; i++) {
    const dark = i % 2 === 0;
    setFunctionModule(6, i, dark);
    setFunctionModule(i, 6, dark);
  }

  // Alignment pattern (5x5 centered at alignmentCenter, alignmentCenter)
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
      setFunctionModule(alignmentCenter + dr, alignmentCenter + dc, dark);
    }
  }

  // Dark module
  setFunctionModule(size - 8, 8, true);

  // Format information bits (MSB bit 14 -> LSB bit 0)
  const formatBit = (b: number): boolean => ((FORMAT_BITS_L_MASK0 >>> b) & 1) === 1;
  // Top-left horizontal (row 8) & vertical (col 8)
  const topLeftCols = [0, 1, 2, 3, 4, 5, 7, 8];
  for (let i = 0; i < topLeftCols.length; i++) {
    setFunctionModule(8, topLeftCols[i]!, formatBit(14 - i));
  }
  const topLeftRows = [7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < topLeftRows.length; i++) {
    setFunctionModule(topLeftRows[i]!, 8, formatBit(6 - i));
  }
  // Bottom-left vertical (col 8) & top-right horizontal (row 8)
  for (let i = 0; i < 7; i++) {
    setFunctionModule(size - 1 - i, 8, formatBit(14 - i));
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 8 + i, formatBit(7 - i));
  }

  // Zigzag placement from right to left, 2 columns at a time, skipping col 6
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let upward = true;
  for (let rightCol = size - 1; rightCol >= 1; rightCol -= 2) {
    if (rightCol === 6) rightCol -= 1;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let offset = 0; offset < 2; offset++) {
        const c = rightCol - offset;
        if (reserved[r]![c]) continue;
        let dark = false;
        if (bitIdx < totalBits) {
          const cw = codewords[bitIdx >> 3]!;
          dark = ((cw >>> (7 - (bitIdx & 7))) & 1) === 1;
          bitIdx++;
        }
        modules[r]![c] = dark;
      }
    }
    upward = !upward;
  }

  // Apply Mask 0: (row + col) % 2 === 0 across the non-reserved encoding region
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!reserved[r]![c] && ((r + c) & 1) === 0) {
        modules[r]![c] = !modules[r]![c];
      }
    }
  }

  return modules;
}

export function drawQrCodeOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  targetSizePx: number,
  quietModules = 3,
): void {
  const matrix = encodeQrMatrix(text);
  const count = matrix.length;
  const totalModules = count + quietModules * 2;
  const modPx = Math.max(2, Math.floor(targetSizePx / totalModules));
  const boxSize = modPx * totalModules;
  const ox = Math.round(x + (targetSizePx - boxSize) * 0.5);
  const oy = Math.round(y + (targetSizePx - boxSize) * 0.5);

  ctx.save();
  // Crisp white backing card for reliable camera contrast
  const r = 10;
  ctx.fillStyle = '#fbf7ee';
  ctx.beginPath();
  ctx.moveTo(ox + r, oy);
  ctx.lineTo(ox + boxSize - r, oy);
  ctx.quadraticCurveTo(ox + boxSize, oy, ox + boxSize, oy + r);
  ctx.lineTo(ox + boxSize, oy + boxSize - r);
  ctx.quadraticCurveTo(ox + boxSize, oy + boxSize, ox + boxSize - r, oy + boxSize);
  ctx.lineTo(ox + r, oy + boxSize);
  ctx.quadraticCurveTo(ox, oy + boxSize, ox, oy + boxSize - r);
  ctx.lineTo(ox, oy + r);
  ctx.quadraticCurveTo(ox, oy, ox + r, oy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#0a090d';
  for (let row = 0; row < count; row++) {
    const line = matrix[row]!;
    for (let col = 0; col < count; col++) {
      if (line[col]) {
        ctx.fillRect(
          ox + (quietModules + col) * modPx,
          oy + (quietModules + row) * modPx,
          modPx,
          modPx,
        );
      }
    }
  }
  ctx.restore();
}
