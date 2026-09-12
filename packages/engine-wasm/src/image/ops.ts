import { stripJpegMetadata } from '../strip/jpeg';
import { stripPngMetadata } from '../strip/png';
import { stripWebpMetadata } from '../strip/webp';
import { readImageHeader } from './header';

export type ImageFormat = 'jpeg' | 'png' | 'webp';
const MIME: Record<ImageFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const JPEG_QUALITY = 0.92;
const WEBP_QUALITY = 0.9;

export interface ImageOpResult {
  blob: Blob;
  log: string[];
}

/** Which formats this browser's canvas can actually encode (Safari lacks WebP encoding). */
export async function detectImageEncoders(): Promise<ImageFormat[]> {
  const out: ImageFormat[] = ['jpeg', 'png'];
  try {
    const c = new OffscreenCanvas(2, 2);
    const b = await c.convertToBlob({ type: 'image/webp' });
    if (b.type === 'image/webp') out.push('webp');
  } catch {
    /* no OffscreenCanvas or no webp */
  }
  return out;
}

export async function stripMetadata(blob: Blob): Promise<ImageOpResult> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const header = readImageHeader(bytes);
  if (!header) throw new Error('Unrecognised image');
  const r =
    header.format === 'jpeg'
      ? stripJpegMetadata(bytes)
      : header.format === 'png'
        ? stripPngMetadata(bytes)
        : stripWebpMetadata(bytes);
  return {
    blob: new Blob([r.bytes as BlobPart], { type: MIME[header.format] }),
    log: [
      `stripMeta(${header.format}): removed ${r.removed.length ? r.removed.join(', ') : 'nothing'}`,
    ],
  };
}

/**
 * Decodes with the EXIF orientation *ignored*, then applies it ourselves so the result is the
 * same in every browser. Orientation values follow the EXIF spec (1 = normal … 8).
 */
async function decodeUnoriented(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'none' });
  } catch {
    return await createImageBitmap(blob);
  }
}

/** Draws `bitmap` rotated/flipped per EXIF `orientation` into an outW×outH canvas (output size). */
function orientedCanvas(
  bitmap: ImageBitmap,
  orientation: number,
  outW: number,
  outH: number,
): OffscreenCanvas {
  const swap = orientation >= 5;
  const canvas = new OffscreenCanvas(outW, outH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  // Size the source is drawn at *before* the rotation transform is applied.
  const sw = swap ? outH : outW;
  const sh = swap ? outW : outH;
  ctx.save();
  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, outW, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, outW, outH);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, outH);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, outW, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, outW, outH);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, outH);
      break;
    default:
      break;
  }
  ctx.drawImage(bitmap, 0, 0, sw, sh);
  ctx.restore();
  return canvas;
}

export interface RenderOptions {
  orientation: number;
  format: ImageFormat;
  /** Longest side after orientation; omit to keep the size. */
  maxSide?: number;
}

/** Shared by orient / resize / convert: decode → (rotate) → (scale) → encode. Metadata is not carried over. */
export async function render(blob: Blob, opts: RenderOptions): Promise<ImageOpResult> {
  const bitmap = await decodeUnoriented(blob);
  try {
    const swap = opts.orientation >= 5;
    const srcW = swap ? bitmap.height : bitmap.width; // oriented size
    const srcH = swap ? bitmap.width : bitmap.height;
    let outW = srcW;
    let outH = srcH;
    if (opts.maxSide && Math.max(srcW, srcH) > opts.maxSide) {
      const scale = opts.maxSide / Math.max(srcW, srcH);
      outW = Math.max(1, Math.round(srcW * scale));
      outH = Math.max(1, Math.round(srcH * scale));
    }
    const canvas = orientedCanvas(bitmap, opts.orientation, outW, outH);
    const quality =
      opts.format === 'jpeg' ? JPEG_QUALITY : opts.format === 'webp' ? WEBP_QUALITY : undefined;
    const out = await canvas.convertToBlob({
      type: MIME[opts.format],
      ...(quality !== undefined ? { quality } : {}),
    });
    if (out.type !== MIME[opts.format]) {
      throw new Error(
        `This browser cannot encode ${opts.format.toUpperCase()} (got ${out.type || 'unknown'}).`,
      );
    }
    return {
      blob: out,
      log: [
        `render: orientation=${opts.orientation} ${bitmap.width}×${bitmap.height} → ${outW}×${outH} ${opts.format}`,
      ],
    };
  } finally {
    bitmap.close();
  }
}
