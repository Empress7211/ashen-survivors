import { describe, expect, it } from 'vitest';
import { encodeQrMatrix } from '../src/ui/qrCode.ts';

describe('ISO/IEC 18004 QR Encoder', () => {
  it('encodes https://survive.ilovesjtu.com as a valid 25x25 Version 2-L Mask 0 matrix', () => {
    const matrix = encodeQrMatrix('https://survive.ilovesjtu.com');
    expect(matrix).toHaveLength(25);
    for (const row of matrix) {
      expect(row).toHaveLength(25);
    }

    // Top-left 7x7 finder corners & center
    expect(matrix[0]![0]).toBe(true);
    expect(matrix[0]![6]).toBe(true);
    expect(matrix[6]![0]).toBe(true);
    expect(matrix[6]![6]).toBe(true);
    expect(matrix[1]![1]).toBe(false);
    expect(matrix[3]![3]).toBe(true);
    expect(matrix[7]![7]).toBe(false); // separator

    // Top-right & bottom-left finder centers
    expect(matrix[3]![21]).toBe(true);
    expect(matrix[21]![3]).toBe(true);

    // Timing pattern alternating along row 6
    expect(matrix[6]![8]).toBe(true);
    expect(matrix[6]![9]).toBe(false);
    expect(matrix[6]![10]).toBe(true);

    // Version 2 alignment pattern centered at (18, 18)
    expect(matrix[18]![18]).toBe(true);
    expect(matrix[17]![18]).toBe(false);
    expect(matrix[16]![16]).toBe(true);

    // Mandatory dark module at (size - 8, 8) = (17, 8)
    expect(matrix[17]![8]).toBe(true);

    // Format info 0x77c4 (MSB bit 14 = 1, bit 13 = 1, bit 12 = 1, bit 11 = 0)
    expect(matrix[8]![0]).toBe(true);
    expect(matrix[8]![1]).toBe(true);
    expect(matrix[8]![2]).toBe(true);
    expect(matrix[8]![3]).toBe(false);
  });

  it('scales cleanly to Version 3 and Version 4 for longer URLs', () => {
    const v3 = encodeQrMatrix('https://survive.ilovesjtu.com/?h=antonio'); // 40 bytes -> V3-L (<=53)
    expect(v3).toHaveLength(29);
    expect(v3[22]![22]).toBe(true);

    const v4 = encodeQrMatrix(
      'https://survive.ilovesjtu.com/?hero=red_death&stage=cappella_magna',
    ); // 66 bytes -> V4-L (<=78)
    expect(v4).toHaveLength(33);
    expect(v4[26]![26]).toBe(true);
  });
});
