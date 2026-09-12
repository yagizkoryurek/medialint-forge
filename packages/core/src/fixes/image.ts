import { defineFix } from '../types/fix';
import type { MediaReport } from '../types/report';
import { CHECK, FIX } from './ids';
import { outputName } from './naming';

export type ImageFormat = 'jpeg' | 'png' | 'webp';
const EXT: Record<ImageFormat, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export const IMAGE_FORMAT_OPTIONS = [
  { value: 'jpeg', label: 'JPEG (photos, smallest)' },
  { value: 'png', label: 'PNG (lossless, transparency)' },
  { value: 'webp', label: 'WebP (modern, small)' },
] as const;

function sourceFormat(report: MediaReport): ImageFormat {
  return report.image?.format ?? 'jpeg';
}

/** Orientations 5–8 swap width and height when applied. */
function orientedDims(report: MediaReport) {
  const img = report.image;
  if (!img) return undefined;
  const swap = img.orientation !== null && img.orientation >= 5;
  return swap ? { width: img.height, height: img.width } : { width: img.width, height: img.height };
}

export const stripMetadataLossless = defineFix<Record<string, never>>({
  id: FIX.stripMetadataLossless,
  kinds: ['image'],
  title: 'Remove metadata (lossless)',
  reencodes: false,
  describe: (report) =>
    `Removes EXIF, XMP and other metadata blocks from the ${sourceFormat(report).toUpperCase()} without touching a single pixel. Color profile is kept so colors don't shift.`,
  defaults: () => ({}),
  applicable: (report) => report.kind === 'image' && !!report.image,
  plan(report) {
    const fmt = sourceFormat(report);
    const out = outputName(report.fileName, 'nometa', EXT[fmt]);
    return {
      fixId: FIX.stripMetadataLossless,
      outputName: out,
      outputKind: 'image',
      reencodes: false,
      steps: [{ kind: 'image', op: 'stripMeta', params: { format: fmt } }],
      expected: {
        resolves: [CHECK.metadataGps, CHECK.metadataDevice],
        ...(report.image
          ? { dims: { width: report.image.width, height: report.image.height } }
          : {}),
      },
    };
  },
});

export interface OrientParams extends Record<string, unknown> {
  format: ImageFormat;
}

export const applyOrientation = defineFix<OrientParams>({
  id: FIX.applyOrientation,
  kinds: ['image'],
  title: 'Rotate the pixels to match the orientation tag',
  reencodes: true,
  params: [{ key: 'format', label: 'Save as', type: 'select', options: IMAGE_FORMAT_OPTIONS }],
  describe: (report, { format }) =>
    `Physically rotates the image the way the EXIF tag asks (orientation ${report.image?.orientation ?? 1}), then saves it as ${format.toUpperCase()} with the tag reset. Metadata is not carried over.`,
  defaults: (report) => ({ format: sourceFormat(report) }),
  applicable: (report) =>
    report.kind === 'image' &&
    !!report.image &&
    report.image.orientation !== null &&
    report.image.orientation !== 1,
  plan(report, { format }) {
    const out = outputName(report.fileName, 'upright', EXT[format]);
    const dims = orientedDims(report);
    return {
      fixId: FIX.applyOrientation,
      outputName: out,
      outputKind: 'image',
      reencodes: true,
      steps: [
        {
          kind: 'image',
          op: 'orient',
          params: { orientation: report.image?.orientation ?? 1, format },
        },
      ],
      expected: {
        resolves: [CHECK.imageOrientationTag, CHECK.metadataGps, CHECK.metadataDevice],
        ...(dims ? { dims } : {}),
      },
    };
  },
});

export interface ResizeParams extends Record<string, unknown> {
  maxSide: '4096' | '2048' | '1920';
  format: ImageFormat;
}

export function resizedDims(width: number, height: number, maxSide: number) {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export const resize = defineFix<ResizeParams>({
  id: FIX.resize,
  kinds: ['image'],
  title: 'Shrink the image',
  reencodes: true,
  params: [
    {
      key: 'maxSide',
      label: 'Longest side',
      type: 'select',
      options: [
        { value: '4096', label: '4096 px (4K)' },
        { value: '2048', label: '2048 px' },
        { value: '1920', label: '1920 px (Full HD)' },
      ],
    },
    { key: 'format', label: 'Save as', type: 'select', options: IMAGE_FORMAT_OPTIONS },
  ],
  describe: (report, { maxSide, format }) => {
    const img = report.image;
    const d = img ? resizedDims(img.width, img.height, Number(maxSide)) : null;
    return `Scales the image down so its longest side is ${maxSide}px${d ? ` (${d.width}×${d.height})` : ''} and saves it as ${format.toUpperCase()}. Any orientation tag is applied; metadata is not carried over.`;
  },
  defaults: (report) => ({ maxSide: '2048', format: sourceFormat(report) }),
  applicable: (report) => report.kind === 'image' && !!report.image,
  plan(report, { maxSide, format }) {
    const out = outputName(report.fileName, `${maxSide}px`, EXT[format]);
    const od = orientedDims(report);
    const dims = od ? resizedDims(od.width, od.height, Number(maxSide)) : undefined;
    return {
      fixId: FIX.resize,
      outputName: out,
      outputKind: 'image',
      reencodes: true,
      steps: [
        {
          kind: 'image',
          op: 'resize',
          params: { maxSide: Number(maxSide), format, orientation: report.image?.orientation ?? 1 },
        },
      ],
      expected: {
        resolves: [
          CHECK.imageHugeDimensions,
          CHECK.fileSizeLarge,
          CHECK.imageOrientationTag,
          CHECK.metadataGps,
          CHECK.metadataDevice,
        ],
        ...(dims ? { dims } : {}),
      },
    };
  },
});

export interface ConvertParams extends Record<string, unknown> {
  format: ImageFormat;
}

export const convert = defineFix<ConvertParams>({
  id: FIX.convert,
  kinds: ['image'],
  title: 'Save in a different image format',
  reencodes: true,
  params: [{ key: 'format', label: 'Save as', type: 'select', options: IMAGE_FORMAT_OPTIONS }],
  describe: (_report, { format }) =>
    `Re-saves the image as ${format.toUpperCase()} (8-bit) with a matching extension. Any orientation tag is applied; metadata is not carried over.`,
  defaults: (report) => ({ format: sourceFormat(report) }),
  applicable: (report) => report.kind === 'image' && !!report.image,
  plan(report, { format }) {
    const out = outputName(report.fileName, '', EXT[format]);
    const dims = orientedDims(report);
    return {
      fixId: FIX.convert,
      outputName: out,
      outputKind: 'image',
      reencodes: true,
      steps: [
        {
          kind: 'image',
          op: 'convert',
          params: { format, orientation: report.image?.orientation ?? 1 },
        },
      ],
      expected: {
        resolves: [
          CHECK.extMismatch,
          CHECK.png16bit,
          CHECK.imageOrientationTag,
          CHECK.metadataGps,
          CHECK.metadataDevice,
        ],
        ...(dims ? { dims } : {}),
      },
    };
  },
});

export const IMAGE_FIXES = [stripMetadataLossless, applyOrientation, resize, convert] as const;
