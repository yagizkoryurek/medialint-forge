import { concat, type StripResult } from './jpeg';

/**
 * Lossless PNG metadata removal. Critical chunks (uppercase first letter) are always kept;
 * ancillary chunks are kept only when they affect rendering. Image data (IDAT/fdAT) is untouched.
 */
const KEEP_ANCILLARY = new Set([
  'tRNS', // transparency for palette/gray/rgb
  'gAMA',
  'cHRM',
  'sRGB',
  'iCCP', // color profile
  'sBIT',
  'bKGD',
  'pHYs',
  'sPLT',
  'hIST',
  'acTL', // APNG animation control
  'fcTL',
  'fdAT',
  'cICP', // HDR/colour-space signalling
  'mDCv',
  'cLLi',
]);

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function u32be(b: Uint8Array, i: number): number {
  return (
    (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0
  );
}

export function stripPngMetadata(input: Uint8Array): StripResult {
  for (let i = 0; i < 8; i++) if (input[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  const parts: Uint8Array[] = [input.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;
  while (i + 12 <= input.length) {
    const len = u32be(input, i);
    const type = String.fromCharCode(
      input[i + 4] ?? 0,
      input[i + 5] ?? 0,
      input[i + 6] ?? 0,
      input[i + 7] ?? 0,
    );
    const end = i + 12 + len;
    if (end > input.length) throw new Error('Corrupt PNG: chunk exceeds file');
    const critical = (type.charCodeAt(0) & 0x20) === 0;
    if (critical || KEEP_ANCILLARY.has(type)) parts.push(input.subarray(i, end));
    else removed.push(type);
    i = end;
    if (type === 'IEND') break;
  }
  return { bytes: concat(parts), removed };
}
