export interface Mp4BoxScan {
  /** Top-level box types in file order, as far as the buffer allowed us to walk. */
  boxes: string[];
  /**
   * `true`  → `moov` seen before `mdat` (streamable / "faststart").
   * `false` → `mdat` seen before `moov`.
   * `null`  → could not determine (neither box within the scanned buffer).
   */
  fastStart: boolean | null;
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    (((bytes[at] ?? 0) << 24) |
      ((bytes[at + 1] ?? 0) << 16) |
      ((bytes[at + 2] ?? 0) << 8) |
      (bytes[at + 3] ?? 0)) >>>
    0
  );
}

function type4(bytes: Uint8Array, at: number): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(bytes[at + i] ?? 0);
  return s;
}

/**
 * Walks top-level ISO BMFF boxes from the start of `head`. Boxes that extend beyond the buffer
 * are still recorded (we only need their type and where the next box starts), so a 64 KB head
 * is enough to answer "does `mdat` come before `moov`?" for every real-world file:
 * if `moov` is at the front it is inside the buffer; if `mdat` is at the front we see it first.
 */
export function scanMp4Boxes(head: Uint8Array): Mp4BoxScan {
  const boxes: string[] = [];
  let offset = 0;
  let sawMoov = false;
  let sawMdat = false;

  while (offset + 8 <= head.length) {
    let size = u32(head, offset);
    const type = type4(head, offset + 4);
    if (!/^[\x20-\x7e]{4}$/.test(type)) break; // not a box header → stop walking

    if (size === 1) {
      // 64-bit largesize follows the header; JS numbers handle up to 2^53 which is plenty.
      if (offset + 16 > head.length) {
        boxes.push(type);
        break;
      }
      size = u32(head, offset + 8) * 2 ** 32 + u32(head, offset + 12);
    } else if (size === 0) {
      // Box extends to end of file.
      boxes.push(type);
      if (type === 'moov') sawMoov = true;
      if (type === 'mdat') sawMdat = true;
      break;
    }
    if (size < 8) break; // corrupt

    boxes.push(type);
    if (type === 'moov' && !sawMdat) sawMoov = true;
    if (type === 'mdat' && !sawMoov) sawMdat = true;
    if (sawMoov || sawMdat) break; // we have our answer; no need to walk further
    offset += size;
  }

  const fastStart = sawMoov ? true : sawMdat ? false : null;
  return { boxes, fastStart };
}
