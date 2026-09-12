/**
 * Minimal header readers for JPEG/PNG/WebP: stored dimensions and format flags without decoding
 * pixels. Stored dimensions are what the file says, *before* any EXIF orientation is applied.
 */

export interface ImageHeader {
  format: 'jpeg' | 'png' | 'webp';
  width: number;
  height: number;
  bitDepth: number | null;
  hasAlpha: boolean | null;
  animated: boolean | null;
}

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u32be = (b: Uint8Array, i: number) =>
  (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0;
const u24le = (b: Uint8Array, i: number) =>
  (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16);
const u32le = (b: Uint8Array, i: number) =>
  ((b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24)) >>> 0;
const tag4 = (b: Uint8Array, i: number) =>
  String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

export function readJpegHeader(b: Uint8Array): ImageHeader | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    // Standalone markers without a length.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2);
    // SOF0..SOF15 except DHT(0xc4), JPG(0xc8), DAC(0xcc)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = u16be(b, i + 5);
      const width = u16be(b, i + 7);
      return {
        format: 'jpeg',
        width,
        height,
        bitDepth: b[i + 4] ?? 8,
        hasAlpha: false,
        animated: false,
      };
    }
    if (marker === 0xda) break; // SOS: no SOF found before scan data
    i += 2 + len;
  }
  return null;
}

export function readPngHeader(b: Uint8Array): ImageHeader | null {
  if (b.length < 33 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47)
    return null;
  // First chunk must be IHDR at offset 8: length(4) 'IHDR'(4) width(4) height(4) depth(1) colorType(1)
  if (tag4(b, 12) !== 'IHDR') return null;
  const width = u32be(b, 16);
  const height = u32be(b, 20);
  const bitDepth = b[24] ?? 8;
  const colorType = b[25] ?? 0;
  // Alpha: color types 4 (gray+alpha) and 6 (rgba); type 3 (palette) may carry tRNS — treat as unknown.
  const hasAlpha = colorType === 4 || colorType === 6 ? true : colorType === 3 ? null : false;
  // APNG: an acTL chunk before the first IDAT.
  let animated = false;
  let i = 8;
  while (i + 8 <= b.length) {
    const len = u32be(b, i);
    const type = tag4(b, i + 4);
    if (type === 'acTL') {
      animated = true;
      break;
    }
    if (type === 'IDAT' || type === 'IEND') break;
    i += 12 + len;
  }
  return { format: 'png', width, height, bitDepth, hasAlpha, animated };
}

export function readWebpHeader(b: Uint8Array): ImageHeader | null {
  if (tag4(b, 0) !== 'RIFF' || tag4(b, 8) !== 'WEBP') return null;
  const chunk = tag4(b, 12);
  const base: Omit<ImageHeader, 'width' | 'height'> = {
    format: 'webp',
    bitDepth: 8,
    hasAlpha: false,
    animated: false,
  };
  if (chunk === 'VP8X') {
    const flags = b[20] ?? 0;
    const width = 1 + u24le(b, 24);
    const height = 1 + u24le(b, 27);
    return {
      ...base,
      width,
      height,
      hasAlpha: (flags & 0x10) !== 0,
      animated: (flags & 0x02) !== 0,
    };
  }
  if (chunk === 'VP8 ') {
    // Key frame: 3-byte frame tag, then 0x9d 0x01 0x2a, then 14-bit width/height.
    const p = 20;
    if (b[p + 3] !== 0x9d || b[p + 4] !== 0x01 || b[p + 5] !== 0x2a) return null;
    const width = (((b[p + 7] ?? 0) << 8) | (b[p + 6] ?? 0)) & 0x3fff;
    const height = (((b[p + 9] ?? 0) << 8) | (b[p + 8] ?? 0)) & 0x3fff;
    return { ...base, width, height };
  }
  if (chunk === 'VP8L') {
    const p = 20;
    if (b[p] !== 0x2f) return null;
    const bits = u32le(b, p + 1);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    const alpha = ((bits >>> 28) & 1) === 1;
    return { ...base, width, height, hasAlpha: alpha };
  }
  return null;
}

export function readImageHeader(b: Uint8Array): ImageHeader | null {
  return readJpegHeader(b) ?? readPngHeader(b) ?? readWebpHeader(b);
}
