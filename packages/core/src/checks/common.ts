import { en } from '../explain/en';
import { CHECK, FIX } from '../fixes/ids';
import type { Finding } from '../types/finding';
import { defineCheck } from '../types/finding';
import type { MediaReport } from '../types/report';

/** Are the streams of this video already fine for the web (so a remux alone fixes the wrapper)? */
export function streamsWebCompatible(
  report: MediaReport,
  videoCodecs: ReadonlyArray<string>,
  audioCodecs: ReadonlyArray<string>,
  pixFmts: ReadonlyArray<string>,
): boolean {
  const v = report.video;
  if (!v) return false;
  if (!videoCodecs.includes(v.codec)) return false;
  if (v.pixFmt && !pixFmts.includes(v.pixFmt)) return false;
  const a = report.audio[0];
  if (a && !audioCodecs.includes(a.codec)) return false;
  return true;
}

export const extMismatch = defineCheck({
  id: CHECK.extMismatch,
  kinds: ['video', 'image'],
  category: 'integrity',
  run(report) {
    const { sniff, ext } = report;
    if (sniff.format === 'unknown' || sniff.extMatches) return [];
    const copy = en.extMismatch(ext || '(none)', sniff.format);
    const fixes: Finding['fixes'] =
      report.kind === 'image'
        ? [
            {
              fixId: FIX.convert,
              params: { format: report.image?.format ?? sniff.format },
              recommended: true,
            },
          ]
        : [{ fixId: FIX.remuxMp4, recommended: true }];
    return [
      {
        id: CHECK.extMismatch,
        checkId: CHECK.extMismatch,
        severity: 'warn',
        category: 'integrity',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: '',
        evidence: {
          extension: ext || '(none)',
          detectedFormat: sniff.format,
          ...(sniff.brand ? { brand: sniff.brand } : {}),
        },
        fixes,
        source: 'sniff',
      },
    ];
  },
});

export const metadataGps = defineCheck({
  id: CHECK.metadataGps,
  kinds: ['video', 'image'],
  category: 'privacy',
  run(report) {
    const gps = report.metadata.gps;
    if (!gps) return [];
    const copy = en.metadataGps(gps.lat, gps.lon);
    return [
      {
        id: CHECK.metadataGps,
        checkId: CHECK.metadataGps,
        severity: 'warn',
        category: 'privacy',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { latitude: gps.lat, longitude: gps.lon },
        fixes: [
          report.kind === 'image'
            ? { fixId: FIX.stripMetadataLossless, recommended: true }
            : { fixId: FIX.stripMetadata, recommended: true },
        ],
        source: 'probe',
      },
    ];
  },
});

export const metadataDevice = defineCheck({
  id: CHECK.metadataDevice,
  kinds: ['video', 'image'],
  category: 'privacy',
  run(report) {
    const { make, model } = report.metadata;
    if (!make && !model) return [];
    const copy = en.metadataDevice(make, model);
    return [
      {
        id: CHECK.metadataDevice,
        checkId: CHECK.metadataDevice,
        severity: 'info',
        category: 'privacy',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { ...(make ? { make } : {}), ...(model ? { model } : {}) },
        fixes: [
          report.kind === 'image'
            ? { fixId: FIX.stripMetadataLossless, recommended: true }
            : { fixId: FIX.stripMetadata, recommended: true },
        ],
        source: 'probe',
      },
    ];
  },
});

export const fileSizeLarge = defineCheck({
  id: CHECK.fileSizeLarge,
  kinds: ['video', 'image'],
  category: 'size',
  run(report, { profile }) {
    const limit = report.kind === 'video' ? profile.maxVideoBytes : profile.maxImageBytes;
    if (report.sizeBytes <= limit) return [];
    const copy = en.fileSizeLarge(report.sizeBytes, limit, report.kind);
    return [
      {
        id: CHECK.fileSizeLarge,
        checkId: CHECK.fileSizeLarge,
        severity: 'info',
        category: 'size',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: { sizeBytes: report.sizeBytes, limitBytes: limit },
        fixes: [
          report.kind === 'video'
            ? { fixId: FIX.transcodeH264Aac, params: { quality: 'low' }, recommended: true }
            : { fixId: FIX.resize, recommended: true },
        ],
        source: 'probe',
      },
    ];
  },
});
