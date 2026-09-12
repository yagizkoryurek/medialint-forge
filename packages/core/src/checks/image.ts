import { en } from '../explain/en';
import { CHECK, FIX } from '../fixes/ids';
import { defineCheck } from '../types/finding';

export const imageOrientationTag = defineCheck({
  id: CHECK.imageOrientationTag,
  kinds: ['image'],
  category: 'compat',
  run(report) {
    const img = report.image;
    if (!img || img.orientation === null || img.orientation === 1) return [];
    const copy = en.imageOrientationTag(img.orientation);
    return [
      {
        id: CHECK.imageOrientationTag,
        checkId: CHECK.imageOrientationTag,
        severity: 'warn',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: {
          exifOrientation: img.orientation,
          storedWidth: img.width,
          storedHeight: img.height,
        },
        fixes: [{ fixId: FIX.applyOrientation, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const imageHugeDimensions = defineCheck({
  id: CHECK.imageHugeDimensions,
  kinds: ['image'],
  category: 'size',
  run(report, { profile }) {
    const img = report.image;
    if (!img) return [];
    const tooBig =
      img.width > profile.maxImageSide ||
      img.height > profile.maxImageSide ||
      img.width * img.height > profile.maxImagePixels;
    if (!tooBig) return [];
    const copy = en.imageHugeDimensions(img.width, img.height, profile.maxImageSide);
    return [
      {
        id: CHECK.imageHugeDimensions,
        checkId: CHECK.imageHugeDimensions,
        severity: 'warn',
        category: 'size',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: {
          width: img.width,
          height: img.height,
          megapixels: Number(((img.width * img.height) / 1e6).toFixed(1)),
          maxSide: profile.maxImageSide,
        },
        fixes: [{ fixId: FIX.resize, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const png16bit = defineCheck({
  id: CHECK.png16bit,
  kinds: ['image'],
  category: 'size',
  run(report) {
    const img = report.image;
    if (!img || img.format !== 'png' || img.bitDepth !== 16) return [];
    const copy = en.png16bit();
    return [
      {
        id: CHECK.png16bit,
        checkId: CHECK.png16bit,
        severity: 'info',
        category: 'size',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { bitDepth: 16 },
        fixes: [{ fixId: FIX.convert, params: { format: 'png' }, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const IMAGE_CHECKS = [imageOrientationTag, imageHugeDimensions, png16bit] as const;
