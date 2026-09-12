import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import exifr from 'exifr';
import { describe, expect, it } from 'vitest';
import { readImageHeader } from '../image/header';
import { stripJpegMetadata } from './jpeg';
import { stripPngMetadata } from './png';
import { stripWebpMetadata } from './webp';

const MEDIA = join(import.meta.dirname, '../../../../fixtures/media');
const bytes = (name: string) => new Uint8Array(readFileSync(join(MEDIA, name)));

/** Everything from the first SOS marker onward — the compressed scan data. */
function jpegScanData(b: Uint8Array): Uint8Array {
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('bad marker');
    const m = b[i + 1] ?? 0;
    if (m === 0xda) return b.subarray(i);
    if (m >= 0xd0 && m <= 0xd7) {
      i += 2;
      continue;
    }
    i += 2 + (((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0));
  }
  throw new Error('no SOS');
}

describe('stripJpegMetadata', () => {
  it('removes EXIF (GPS, Make, Orientation) and keeps scan data byte-identical', async () => {
    const input = bytes('gps.jpg');
    const before = (await exifr.parse(input, { gps: true, translateValues: false })) as Record<
      string,
      unknown
    >;
    expect(before.latitude).toBeCloseTo(37.7749, 3);
    expect(before.Make).toBe('MediaLint Test Camera');

    const { bytes: out, removed } = stripJpegMetadata(input);
    // ffmpeg's JPEG encoder also writes a COM segment; both go.
    expect(removed).toEqual(['APP1 (EXIF)', 'COM']);
    expect(out.length).toBeLessThan(input.length);
    expect(await exifr.parse(out, { gps: true })).toBeUndefined();
    expect(Buffer.from(jpegScanData(out))).toEqual(Buffer.from(jpegScanData(input)));
    // Still a valid JPEG with the same dimensions.
    expect(readImageHeader(out)).toEqual(readImageHeader(input));
  });

  it('is idempotent: stripping a stripped JPEG changes nothing', () => {
    const once = stripJpegMetadata(bytes('plain.jpg'));
    expect(once.removed).toEqual(['COM']);
    const twice = stripJpegMetadata(once.bytes);
    expect(twice.removed).toEqual([]);
    expect(Buffer.from(twice.bytes)).toEqual(Buffer.from(once.bytes));
  });

  it('keeps ICC profiles and Adobe segments, drops XMP/COM/MPF', () => {
    const seg = (marker: number, payload: Uint8Array) => {
      const len = payload.length + 2;
      return new Uint8Array([0xff, marker, len >> 8, len & 0xff, ...payload]);
    };
    const ascii = (s: string) => new TextEncoder().encode(s);
    const plain = stripJpegMetadata(bytes('plain.jpg')).bytes;
    const synthetic = new Uint8Array([
      0xff,
      0xd8,
      ...seg(0xe2, ascii('ICC_PROFILE\0\x01\x01abc')),
      ...seg(0xe1, ascii('http://ns.adobe.com/xap/1.0/\0<x/>')),
      ...seg(0xe2, ascii('MPF\0stuff')),
      ...seg(0xee, ascii('Adobe\0\0\0\0\0\0\0')),
      ...seg(0xfe, ascii('a comment')),
      ...plain.subarray(2),
    ]);
    const { bytes: out, removed } = stripJpegMetadata(synthetic);
    expect(removed).toEqual(['APP1 (XMP)', 'APP2 (MPF)', 'COM']);
    const text = new TextDecoder('latin1').decode(out.subarray(0, 200));
    expect(text).toContain('ICC_PROFILE');
    expect(text).toContain('Adobe');
    expect(text).not.toContain('xap');
  });

  it('rejects non-JPEG input', () => {
    expect(() => stripJpegMetadata(bytes('alpha.png'))).toThrow(/Not a JPEG/);
  });
});

describe('stripPngMetadata', () => {
  it('keeps critical + rendering chunks and drops text/exif chunks', () => {
    const input = bytes('alpha.png');
    const { bytes: out, removed } = stripPngMetadata(input);
    // ffmpeg writes no text chunks with bitexact, so this should be a no-op…
    expect(removed).toEqual([]);
    expect(Buffer.from(out)).toEqual(Buffer.from(input));
    // …but a synthetic tEXt/eXIf chunk must go.
    const chunk = (type: string, data: Uint8Array) => {
      const len = data.length;
      return new Uint8Array([
        len >>> 24,
        (len >>> 16) & 0xff,
        (len >>> 8) & 0xff,
        len & 0xff,
        ...new TextEncoder().encode(type),
        ...data,
        0,
        0,
        0,
        0,
      ]);
    };
    const withText = new Uint8Array([
      ...input.subarray(0, 33), // signature + IHDR
      ...chunk('tEXt', new TextEncoder().encode('Comment\0hello')),
      ...chunk('eXIf', new Uint8Array([0x49, 0x49, 0x2a, 0])),
      ...chunk('gAMA', new Uint8Array([0, 0, 0xb1, 0x8f])),
      ...input.subarray(33),
    ]);
    const r = stripPngMetadata(withText);
    expect(r.removed).toEqual(['tEXt', 'eXIf']);
    expect(readImageHeader(r.bytes)).toEqual(readImageHeader(input));
    expect(new TextDecoder('latin1').decode(r.bytes)).toContain('gAMA');
  });
});

describe('stripWebpMetadata', () => {
  it('is a no-op without EXIF/XMP and preserves dimensions', () => {
    const input = bytes('plain.webp');
    const r = stripWebpMetadata(input);
    expect(r.removed).toEqual([]);
    expect(readImageHeader(r.bytes)).toEqual(readImageHeader(input));
  });

  it('drops EXIF/XMP chunks, clears VP8X flags and fixes the RIFF size', () => {
    const input = bytes('plain.webp');
    const header = readImageHeader(input);
    if (!header) throw new Error('bad fixture');
    // Build a VP8X container around the existing VP8 chunk with an EXIF chunk appended.
    const le32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
    const le24 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff];
    const enc = (s: string) => [...new TextEncoder().encode(s)];
    const vp8chunk = input.subarray(12);
    const vp8x = [
      ...enc('VP8X'),
      ...le32(10),
      0x08,
      0,
      0,
      0,
      ...le24(header.width - 1),
      ...le24(header.height - 1),
    ];
    const exif = [...enc('EXIF'), ...le32(4), 0x49, 0x49, 0x2a, 0];
    const body = [...vp8x, ...vp8chunk, ...exif];
    const synthetic = new Uint8Array([
      ...enc('RIFF'),
      ...le32(4 + body.length),
      ...enc('WEBP'),
      ...body,
    ]);

    const r = stripWebpMetadata(synthetic);
    expect(r.removed).toEqual(['EXIF']);
    expect(r.bytes.length).toBe(synthetic.length - exif.length);
    // RIFF size field = total - 8
    const riffSize =
      (r.bytes[4] ?? 0) |
      ((r.bytes[5] ?? 0) << 8) |
      ((r.bytes[6] ?? 0) << 16) |
      ((r.bytes[7] ?? 0) << 24);
    expect(riffSize).toBe(r.bytes.length - 8);
    expect((r.bytes[20] ?? 0) & 0x08).toBe(0); // EXIF flag cleared
    expect(readImageHeader(r.bytes)).toMatchObject({
      format: 'webp',
      width: header.width,
      height: header.height,
    });
  });
});

describe('readImageHeader', () => {
  it('reads dimensions and flags from the fixtures', () => {
    expect(readImageHeader(bytes('gps.jpg'))).toMatchObject({
      format: 'jpeg',
      width: 320,
      height: 180,
    });
    expect(readImageHeader(bytes('16bit.png'))).toMatchObject({
      format: 'png',
      width: 64,
      height: 64,
      bitDepth: 16,
      animated: false,
    });
    expect(readImageHeader(bytes('alpha.png'))).toMatchObject({
      format: 'png',
      hasAlpha: true,
      bitDepth: 8,
    });
    expect(readImageHeader(bytes('big.webp'))).toMatchObject({
      format: 'webp',
      width: 8200,
      height: 64,
    });
    expect(readImageHeader(bytes('plain.webp'))).toMatchObject({
      format: 'webp',
      width: 320,
      height: 180,
    });
    expect(readImageHeader(bytes('h264-ok.mp4'))).toBeNull();
  });
});
