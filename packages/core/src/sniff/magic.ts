import type { SniffedFormat, SniffResult } from '../types/report';
import { scanMp4Boxes } from './mp4boxes';

/** Lower-case extension without the dot, or '' when there is none. */
export function extOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i <= 0 || i === fileName.length - 1) return '';
  return fileName.slice(i + 1).toLowerCase();
}

/** Which sniffed formats an extension may legitimately contain. */
const EXT_ACCEPTS: Record<string, ReadonlyArray<SniffedFormat>> = {
  mp4: ['mp4', 'mov'],
  m4v: ['mp4', 'mov'],
  mov: ['mov', 'mp4'],
  qt: ['mov'],
  mkv: ['mkv'],
  webm: ['webm'],
  jpg: ['jpeg'],
  jpeg: ['jpeg'],
  jpe: ['jpeg'],
  png: ['png'],
  webp: ['webp'],
};

export function extMatchesFormat(ext: string, format: SniffedFormat): boolean {
  if (format === 'unknown') return true; // nothing to contradict
  const accepts = EXT_ACCEPTS[ext];
  if (!accepts) return false;
  return accepts.includes(format);
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let s = '';
  for (let i = start; i < start + len && i < bytes.length; i++)
    s += String.fromCharCode(bytes[i] ?? 0);
  return s;
}

const MOV_BRANDS = new Set(['qt  ']);
/** Box types that can legitimately open a QuickTime file that has no `ftyp`. */
const MOV_OPENING_BOXES = new Set(['moov', 'mdat', 'free', 'wide', 'skip', 'pnot']);

/** Reads the EBML DocType ("matroska" | "webm") from the first bytes of an EBML file. */
function ebmlDocType(head: Uint8Array): string | null {
  // DocType element id is 0x4282; it sits inside the EBML header within the first ~64 bytes.
  const limit = Math.min(head.length - 2, 128);
  for (let i = 4; i < limit; i++) {
    if (head[i] === 0x42 && head[i + 1] === 0x82) {
      const lenByte = head[i + 2] ?? 0;
      // DocType strings are short, so the size is a one-byte vint: 0b1xxxxxxx.
      if ((lenByte & 0x80) === 0) return null;
      const len = lenByte & 0x7f;
      return ascii(head, i + 3, len);
    }
  }
  return null;
}

/**
 * Detects the real container/format from the first bytes of a file, ignoring its extension.
 * `head` should be the first 64 KB (or the whole file if smaller).
 */
export function sniff(fileName: string, head: Uint8Array): SniffResult {
  const ext = extOf(fileName);
  const result = (format: SniffedFormat, extra: Partial<SniffResult> = {}): SniffResult => ({
    format,
    extMatches: extMatchesFormat(ext, format),
    ...extra,
  });

  if (head.length < 12) return result('unknown');

  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return result('jpeg');

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 &&
    ascii(head, 1, 3) === 'PNG' &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return result('png');
  }

  // WebP: "RIFF" .... "WEBP"
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return result('webp');

  // EBML (Matroska / WebM): 1A 45 DF A3
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    const docType = ebmlDocType(head);
    if (docType === 'webm') return result('webm');
    return result('mkv');
  }

  // ISO BMFF (MP4 / MOV): size + 'ftyp' at offset 4
  const boxType = ascii(head, 4, 4);
  if (boxType === 'ftyp') {
    const brand = ascii(head, 8, 4);
    const boxes = scanMp4Boxes(head);
    const format: SniffedFormat = MOV_BRANDS.has(brand) ? 'mov' : 'mp4';
    return result(format, {
      brand,
      ...(boxes.fastStart !== null ? { fastStart: boxes.fastStart } : {}),
    });
  }
  if (MOV_OPENING_BOXES.has(boxType)) {
    const boxes = scanMp4Boxes(head);
    return result('mov', boxes.fastStart !== null ? { fastStart: boxes.fastStart } : {});
  }

  return result('unknown');
}
