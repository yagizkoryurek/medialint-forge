/**
 * Lossless JPEG metadata removal. Walks the marker segments before the first scan (SOS) and
 * drops metadata-carrying application segments; everything from SOS onward is copied verbatim,
 * so the compressed image data is byte-identical.
 *
 * Kept (needed to decode/display correctly):
 *   APP0  "JFIF"         — density/thumbnail header (JFIF thumbnails are tiny and rare; kept for safety)
 *   APP2  "ICC_PROFILE"  — color profile; dropping it shifts colors
 *   APP14 "Adobe"        — color transform flag; dropping it can turn the image pink/green
 * Dropped:
 *   APP1  (EXIF, XMP)    — where GPS, device and edit history live
 *   APP2  "MPF"          — multi-picture index, often holds a full-size embedded preview
 *   APP13 (Photoshop/IPTC), COM comments, and any other APPn we don't recognise
 */

const SOI = 0xd8;
const SOS = 0xda;
const EOI = 0xd9;
const COM = 0xfe;

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) s += String.fromCharCode(b[at + i] ?? 0);
  return s;
}

function keepApp(marker: number, payload: Uint8Array): boolean {
  const app = marker - 0xe0;
  if (app === 0) return ascii(payload, 0, 4) === 'JFIF' || ascii(payload, 0, 4) === 'JFXX';
  if (app === 2) return ascii(payload, 0, 11) === 'ICC_PROFILE';
  if (app === 14) return ascii(payload, 0, 5) === 'Adobe';
  return false;
}

export interface StripResult {
  bytes: Uint8Array;
  removed: string[];
}

export function stripJpegMetadata(input: Uint8Array): StripResult {
  if (input[0] !== 0xff || input[1] !== SOI) throw new Error('Not a JPEG file');
  const parts: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let i = 2;

  while (i + 4 <= input.length) {
    if (input[i] !== 0xff) throw new Error(`Corrupt JPEG: expected marker at ${i}`);
    const marker = input[i + 1] ?? 0;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    if (marker === SOS || marker === EOI) {
      parts.push(input.subarray(i)); // scan data and everything after: copied verbatim
      return { bytes: concat(parts), removed };
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(input.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = ((input[i + 2] ?? 0) << 8) | (input[i + 3] ?? 0);
    const segEnd = i + 2 + len;
    if (len < 2 || segEnd > input.length) throw new Error('Corrupt JPEG: bad segment length');
    const payload = input.subarray(i + 4, segEnd);

    const isApp = marker >= 0xe0 && marker <= 0xef;
    if ((isApp && !keepApp(marker, payload)) || marker === COM) {
      removed.push(marker === COM ? 'COM' : `APP${marker - 0xe0}${describeApp(payload)}`);
    } else {
      parts.push(input.subarray(i, segEnd));
    }
    i = segEnd;
  }
  throw new Error('Corrupt JPEG: no scan data found');
}

function describeApp(payload: Uint8Array): string {
  const head = ascii(payload, 0, 29);
  if (head.startsWith('Exif')) return ' (EXIF)';
  if (head.startsWith('http://ns.adobe.com/xap/1.0/')) return ' (XMP)';
  if (head.startsWith('Photoshop')) return ' (Photoshop/IPTC)';
  if (head.startsWith('MPF')) return ' (MPF)';
  return '';
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.byteLength;
  }
  return out;
}
