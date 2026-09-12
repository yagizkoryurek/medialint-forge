import { describe, expect, it } from 'vitest';
import { CHECK, FIX } from '../fixes/ids';
import { fromImageProbe } from '../normalize/fromImageProbe';
import { webBrowsers } from '../profiles/web-browsers';
import { videoReport } from '../testing/fixtures';
import type { ImageProbeRaw } from '../types/engine';
import type { MediaReport } from '../types/report';
import { ALL_CHECKS, runChecks } from './registry';

const ids = (report: MediaReport) => runChecks(report, webBrowsers).map((f) => f.id);
const recommended = (report: MediaReport, checkId: string) =>
  runChecks(report, webBrowsers)
    .find((f) => f.id === checkId)
    ?.fixes.find((x) => x.recommended)?.fixId;

describe('registry', () => {
  it('has unique check ids', () => {
    const all = ALL_CHECKS.map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(Object.values(CHECK).sort());
  });

  it('sorts findings by severity', () => {
    const f = runChecks(videoReport('pcm-audio.mov'), webBrowsers);
    const sev = f.map((x) => x.severity);
    const rank = { error: 0, warn: 1, info: 2 };
    for (let i = 1; i < sev.length; i++)
      expect(rank[sev[i]!]).toBeGreaterThanOrEqual(rank[sev[i - 1]!]);
  });
});

describe('video fixtures → findings', () => {
  it('h264-ok.mp4 is clean', () => {
    expect(ids(videoReport('h264-ok.mp4'))).toEqual([]);
  });

  it('not-faststart.mp4 → faststart only', () => {
    const r = videoReport('not-faststart.mp4');
    expect(ids(r)).toEqual([CHECK.mp4NotFaststart]);
    expect(recommended(r, CHECK.mp4NotFaststart)).toBe(FIX.faststart);
  });

  it('hevc.mov → codec error + container + faststart', () => {
    const r = videoReport('hevc.mov');
    expect(ids(r)).toEqual([
      CHECK.videoCodecUnsupported,
      CHECK.containerNotMp4,
      CHECK.mp4NotFaststart,
    ]);
    expect(recommended(r, CHECK.videoCodecUnsupported)).toBe(FIX.transcodeH264Aac);
    // Streams are not web-compatible, so the container finding also points at the transcode.
    expect(recommended(r, CHECK.containerNotMp4)).toBe(FIX.transcodeH264Aac);
  });

  it('prores.mov → codec + pixfmt (10-bit) + container', () => {
    const r = videoReport('prores.mov');
    expect(ids(r)).toContain(CHECK.videoCodecUnsupported);
    expect(ids(r)).toContain(CHECK.pixfmtNotYuv420p);
    const pix = runChecks(r, webBrowsers).find((f) => f.id === CHECK.pixfmtNotYuv420p);
    expect(pix?.title).toContain('10-bit');
  });

  it('yuv422.mp4 → pixfmt error only', () => {
    expect(ids(videoReport('yuv422.mp4'))).toEqual([CHECK.pixfmtNotYuv420p]);
  });

  it('odd-dims.mp4 → odd dimensions only (VP9 in MP4 is fine)', () => {
    expect(ids(videoReport('odd-dims.mp4'))).toEqual([CHECK.oddDimensions]);
  });

  it('rotated.mp4 → rotation', () => {
    const r = videoReport('rotated.mp4');
    expect(ids(r)).toEqual([CHECK.rotationMetadata]);
    expect(recommended(r, CHECK.rotationMetadata)).toBe(FIX.applyRotation);
  });

  it('pcm-audio.mov → audio codec (video is fine → audio-only fix) + container + faststart', () => {
    const r = videoReport('pcm-audio.mov');
    expect(ids(r)).toEqual([
      CHECK.audioCodecUnsupported,
      CHECK.containerNotMp4,
      CHECK.mp4NotFaststart,
    ]);
    expect(recommended(r, CHECK.audioCodecUnsupported)).toBe(FIX.audioToAac);
    // PCM can't be remuxed into MP4, so the container finding must not suggest a bare remux.
    expect(recommended(r, CHECK.containerNotMp4)).toBe(FIX.transcodeH264Aac);
  });

  it('h264.mkv → container only, remux recommended', () => {
    const r = videoReport('h264.mkv');
    expect(ids(r)).toEqual([CHECK.containerNotMp4]);
    expect(recommended(r, CHECK.containerNotMp4)).toBe(FIX.remuxMp4);
  });

  it('vp9.webm is clean', () => {
    expect(ids(videoReport('vp9.webm'))).toEqual([]);
  });

  it('no-audio.mp4 → info only', () => {
    const f = runChecks(videoReport('no-audio.mp4'), webBrowsers);
    expect(f.map((x) => x.id)).toEqual([CHECK.audioMissing]);
    expect(f[0]?.severity).toBe('info');
  });

  it('gps.mov → container + location (warn) + device (info), metadata fixed by strip-metadata', () => {
    const r = videoReport('gps.mov');
    expect(ids(r)).toEqual([CHECK.containerNotMp4, CHECK.metadataGps, CHECK.metadataDevice]);
    expect(recommended(r, CHECK.metadataGps)).toBe(FIX.stripMetadata);
    expect(recommended(r, CHECK.metadataDevice)).toBe(FIX.stripMetadata);
  });
});

function imageReport(
  overrides: Partial<ImageProbeRaw> & {
    fileName?: string;
    sniffFormat?: 'jpeg' | 'png' | 'webp';
    ext?: string;
  },
): MediaReport {
  const fileName = overrides.fileName ?? 'photo.jpg';
  const format = overrides.format ?? 'jpeg';
  return fromImageProbe({
    fileName,
    sizeBytes: 500_000,
    sniff: {
      format: overrides.sniffFormat ?? format,
      extMatches: overrides.ext === undefined ? true : overrides.ext === format,
    },
    probe: {
      kind: 'image',
      format,
      width: 1600,
      height: 1200,
      bitDepth: null,
      hasAlpha: false,
      animated: false,
      orientation: null,
      gps: null,
      make: null,
      model: null,
      software: null,
      creationTime: null,
      tags: {},
      ...overrides,
    },
  });
}

describe('image reports → findings', () => {
  it('clean JPEG has no findings', () => {
    expect(ids(imageReport({}))).toEqual([]);
  });

  it('GPS + device → privacy findings with lossless strip', () => {
    const r = imageReport({ gps: { lat: 1, lon: 2 }, make: 'Acme', model: 'X1' });
    expect(ids(r)).toEqual([CHECK.metadataGps, CHECK.metadataDevice]);
    expect(recommended(r, CHECK.metadataGps)).toBe(FIX.stripMetadataLossless);
  });

  it('orientation 6 → orientation finding', () => {
    const r = imageReport({ orientation: 6 });
    expect(ids(r)).toEqual([CHECK.imageOrientationTag]);
    expect(recommended(r, CHECK.imageOrientationTag)).toBe(FIX.applyOrientation);
  });

  it('orientation 1 is not a finding', () => {
    expect(ids(imageReport({ orientation: 1 }))).toEqual([]);
  });

  it('huge dimensions → resize', () => {
    expect(ids(imageReport({ width: 9000, height: 100 }))).toEqual([CHECK.imageHugeDimensions]);
    expect(ids(imageReport({ width: 6000, height: 5000 }))).toEqual([CHECK.imageHugeDimensions]);
    expect(ids(imageReport({ width: 4000, height: 3000 }))).toEqual([]);
  });

  it('16-bit PNG → info', () => {
    const r = imageReport({ format: 'png', fileName: 'x.png', bitDepth: 16 });
    expect(ids(r)).toEqual([CHECK.png16bit]);
    expect(ids(imageReport({ format: 'png', fileName: 'x.png', bitDepth: 8 }))).toEqual([]);
  });

  it('extension mismatch → convert to the real format', () => {
    const r = imageReport({ format: 'png', fileName: 'actually.jpg', ext: 'jpg' });
    expect(ids(r)).toEqual([CHECK.extMismatch]);
    const f = runChecks(r, webBrowsers)[0];
    expect(f?.fixes[0]).toEqual({
      fixId: FIX.convert,
      params: { format: 'png' },
      recommended: true,
    });
  });

  it('large file → size info', () => {
    const r = { ...imageReport({}), sizeBytes: 20 * 1024 * 1024 };
    expect(ids(r)).toEqual([CHECK.fileSizeLarge]);
  });
});

describe('copy quality', () => {
  it('every finding has non-empty title and explanation and unique fix refs', () => {
    const reports = [
      'hevc.mov',
      'prores.mov',
      'pcm-audio.mov',
      'gps.mov',
      'rotated.mp4',
      'odd-dims.mp4',
      'no-audio.mp4',
    ].map(videoReport);
    reports.push(
      imageReport({ gps: { lat: 1, lon: 2 }, orientation: 8, width: 9000, height: 9000 }),
    );
    for (const r of reports) {
      for (const f of runChecks(r, webBrowsers)) {
        expect(f.title.length).toBeGreaterThan(8);
        expect(f.explanation.length).toBeGreaterThan(20);
        expect(f.fixes.filter((x) => x.recommended).length).toBeLessThanOrEqual(1);
        expect(new Set(f.fixes.map((x) => x.fixId)).size).toBe(f.fixes.length);
      }
    }
  });
});
