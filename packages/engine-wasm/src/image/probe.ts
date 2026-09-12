import type { ImageProbeRaw } from '@medialint/core';
import exifr from 'exifr';
import { readImageHeader } from './header';

type ExifrOptions = Exclude<Parameters<typeof exifr.parse>[1], boolean | undefined>;

const EXIFR_OPTIONS: ExifrOptions = {
  tiff: true,
  exif: true,
  gps: true,
  xmp: false,
  icc: false,
  iptc: false,
  jfif: false,
  ihdr: false,
  translateKeys: true,
  translateValues: false, // numeric Orientation etc.
  reviveValues: true,
  mergeOutput: true,
};

function str(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).replace(/\0+$/, '').trim();
  return s === '' ? null : s;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Finds the EXIF chunk payload in a WebP file (exifr does not walk RIFF containers). */
function webpExifPayload(bytes: Uint8Array): Uint8Array | null {
  let i = 12;
  while (i + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[i] ?? 0,
      bytes[i + 1] ?? 0,
      bytes[i + 2] ?? 0,
      bytes[i + 3] ?? 0,
    );
    const size =
      (bytes[i + 4] ?? 0) |
      ((bytes[i + 5] ?? 0) << 8) |
      ((bytes[i + 6] ?? 0) << 16) |
      ((bytes[i + 7] ?? 0) << 24);
    if (type === 'EXIF') {
      let p = bytes.subarray(i + 8, i + 8 + size);
      // Some writers prefix the TIFF header with "Exif\0\0".
      if (p[0] === 0x45 && p[1] === 0x78 && p[2] === 0x69 && p[3] === 0x66) p = p.subarray(6);
      return p;
    }
    i += 8 + size + (size & 1);
  }
  return null;
}

export async function probeImage(blob: Blob): Promise<ImageProbeRaw> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new Error('Unrecognised or corrupt image header');

  let exif: Record<string, unknown> = {};
  try {
    const src = header.format === 'webp' ? webpExifPayload(bytes) : bytes;
    if (src) {
      const parsed = (await exifr.parse(src, EXIFR_OPTIONS)) as Record<string, unknown> | undefined;
      if (parsed) exif = parsed;
    }
  } catch {
    // Unparseable metadata is not an error for the report; we simply have none.
  }

  const lat = num(exif.latitude);
  const lon = num(exif.longitude);
  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(exif)) {
    if (v === undefined || v === null) continue;
    if (v instanceof Uint8Array || ArrayBuffer.isView(v)) continue;
    if (typeof v === 'object' && !(v instanceof Date)) continue;
    tags[k] = v instanceof Date ? v.toISOString() : String(v);
  }

  return {
    kind: 'image',
    format: header.format,
    width: header.width,
    height: header.height,
    bitDepth: header.bitDepth,
    hasAlpha: header.hasAlpha,
    animated: header.animated,
    orientation: num(exif.Orientation),
    gps: lat !== null && lon !== null ? { lat, lon } : null,
    make: str(exif.Make),
    model: str(exif.Model),
    software: str(exif.Software),
    creationTime:
      exif.DateTimeOriginal instanceof Date
        ? exif.DateTimeOriginal.toISOString()
        : str(exif.DateTimeOriginal),
    tags,
  };
}
