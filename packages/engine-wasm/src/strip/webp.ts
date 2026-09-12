import { concat, type StripResult } from './jpeg';

/**
 * Lossless WebP metadata removal. Drops the EXIF and XMP chunks, clears their flag bits in the
 * VP8X header, and rewrites the RIFF size. Bitstream (VP8/VP8L/ALPH/ANMF) and ICCP are untouched.
 */
const DROP = new Set(['EXIF', 'XMP ']);
const FLAG_XMP = 0x04;
const FLAG_EXIF = 0x08;

function u32le(b: Uint8Array, i: number): number {
  return (
    ((b[i] ?? 0) | ((b[i + 1] ?? 0) << 8) | ((b[i + 2] ?? 0) << 16) | ((b[i + 3] ?? 0) << 24)) >>> 0
  );
}
function setU32le(b: Uint8Array, i: number, v: number) {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
}
const tag = (b: Uint8Array, i: number) =>
  String.fromCharCode(b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0);

export function stripWebpMetadata(input: Uint8Array): StripResult {
  if (tag(input, 0) !== 'RIFF' || tag(input, 8) !== 'WEBP') throw new Error('Not a WebP file');
  const chunks: Uint8Array[] = [];
  const removed: string[] = [];
  let i = 12;
  const end = Math.min(input.length, 8 + u32le(input, 4));
  while (i + 8 <= end) {
    const type = tag(input, i);
    const size = u32le(input, i + 4);
    const padded = size + (size & 1);
    const chunkEnd = Math.min(end, i + 8 + padded);
    if (DROP.has(type)) removed.push(type.trim());
    else chunks.push(input.slice(i, chunkEnd)); // copy so VP8X flags can be edited safely
    i = chunkEnd;
  }
  if (removed.length === 0) return { bytes: input, removed };

  const vp8x = chunks.find((c) => tag(c, 0) === 'VP8X');
  if (vp8x && vp8x.length >= 9) vp8x[8] = (vp8x[8] ?? 0) & ~(FLAG_EXIF | FLAG_XMP);

  const body = concat(chunks);
  const header = new Uint8Array(12);
  header.set(input.subarray(0, 12));
  setU32le(header, 4, 4 + body.byteLength);
  return { bytes: concat([header, body]), removed };
}
