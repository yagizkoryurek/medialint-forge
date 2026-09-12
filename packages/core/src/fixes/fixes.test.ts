import { describe, expect, it } from 'vitest';
import { runChecks } from '../checks/registry';
import { estimate } from '../estimate';
import { fromImageProbe } from '../normalize/fromImageProbe';
import { webBrowsers } from '../profiles/web-browsers';
import { videoReport } from '../testing/fixtures';
import type { ImageProbeRaw } from '../types/engine';
import type { MediaReport } from '../types/report';
import { verify } from '../verify';
import { formatCommand } from './argv';
import { CHECK, FIX } from './ids';
import { resizedDims } from './image';
import { outputName as nameOf } from './naming';
import { ALL_FIXES, fixOffers, getFix, planFix } from './registry';

function image(over: Partial<ImageProbeRaw> = {}, fileName = 'photo.jpg'): MediaReport {
  const format = over.format ?? 'jpeg';
  return fromImageProbe({
    fileName,
    sizeBytes: 300_000,
    sniff: { format, extMatches: true },
    probe: {
      kind: 'image',
      format,
      width: 4000,
      height: 3000,
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
      ...over,
    },
  });
}

describe('registry', () => {
  it('has unique fix ids matching the FIX table', () => {
    const ids = ALL_FIXES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(Object.values(FIX).sort());
  });

  it('every fix referenced by a check exists', () => {
    const reports = [
      'hevc.mov',
      'prores.mov',
      'pcm-audio.mov',
      'gps.mov',
      'rotated.mp4',
      'not-faststart.mp4',
      'h264.mkv',
    ].map(videoReport);
    reports.push(
      image(
        {
          gps: { lat: 1, lon: 2 },
          orientation: 6,
          width: 9000,
          height: 9000,
          bitDepth: 16,
          format: 'png',
        },
        'x.png',
      ),
    );
    for (const r of reports) {
      for (const f of runChecks(r, webBrowsers))
        for (const ref of f.fixes) expect(getFix(ref.fixId)).toBeDefined();
    }
  });
});

describe('argv snapshots', () => {
  it.each([
    ['h264.mkv', FIX.remuxMp4],
    ['not-faststart.mp4', FIX.faststart],
    ['gps.mov', FIX.stripMetadata],
    ['hevc.mov', FIX.transcodeH264Aac],
    ['pcm-audio.mov', FIX.transcodeH264Aac],
    ['rotated.mp4', FIX.applyRotation],
    ['pcm-audio.mov', FIX.audioToAac],
  ] as const)('%s → %s', (fixture, fixId) => {
    const plan = planFix(fixId, videoReport(fixture));
    expect(plan.steps).toHaveLength(1);
    const step = plan.steps[0];
    if (step?.kind !== 'ffmpeg') throw new Error('expected ffmpeg step');
    expect({
      outputName: plan.outputName,
      expected: plan.expected,
      cmd: formatCommand(step.argv),
    }).toMatchSnapshot();
  });

  it('argv invariants: ends with /out path, no empty args, only virtual paths', () => {
    for (const fixture of ['h264.mkv', 'hevc.mov', 'gps.mov', 'rotated.mp4', 'pcm-audio.mov']) {
      const report = videoReport(fixture);
      for (const fix of ALL_FIXES) {
        if (!fix.applicable(report)) continue;
        const plan = fix.plan(report, fix.defaults(report));
        for (const step of plan.steps) {
          if (step.kind !== 'ffmpeg') continue;
          expect(step.argv.at(-1)).toBe(`/out/${plan.outputName}`);
          expect(step.argv.every((a) => a.length > 0)).toBe(true);
          const paths = step.argv.filter((a) => a.startsWith('/'));
          expect(paths.every((p) => p.startsWith('/input/') || p.startsWith('/out/'))).toBe(true);
        }
      }
    }
  });

  it('transcode copies web-safe audio and re-encodes the rest', () => {
    const copy = planFix(FIX.transcodeH264Aac, videoReport('hevc.mov')).steps[0];
    const enc = planFix(FIX.transcodeH264Aac, videoReport('pcm-audio.mov')).steps[0];
    if (copy?.kind !== 'ffmpeg' || enc?.kind !== 'ffmpeg') throw new Error();
    expect(copy.argv).toContain('copy');
    expect(enc.argv).toContain('aac');
    expect(planFix(FIX.transcodeH264Aac, videoReport('hevc.mov')).expected.resolves).not.toContain(
      CHECK.audioCodecUnsupported,
    );
    expect(planFix(FIX.transcodeH264Aac, videoReport('pcm-audio.mov')).expected.resolves).toContain(
      CHECK.audioCodecUnsupported,
    );
  });

  it('rotation bakes in swapped dimensions', () => {
    const plan = planFix(FIX.applyRotation, videoReport('rotated.mp4'));
    expect(plan.expected.dims).toEqual({ width: 180, height: 320 });
  });

  it('quality param maps to CRF', () => {
    const p = planFix(FIX.transcodeH264Aac, videoReport('hevc.mov'), { quality: 'low' }).steps[0];
    if (p?.kind !== 'ffmpeg') throw new Error();
    expect(p.argv[p.argv.indexOf('-crf') + 1]).toBe('28');
  });
});

describe('applicability', () => {
  it('remux is not offered when streams cannot live in MP4', () => {
    expect(getFix(FIX.remuxMp4)?.applicable(videoReport('pcm-audio.mov'))).toBe(false);
    expect(getFix(FIX.remuxMp4)?.applicable(videoReport('h264.mkv'))).toBe(true);
  });
  it('audio-to-aac only when the audio is the problem', () => {
    expect(getFix(FIX.audioToAac)?.applicable(videoReport('pcm-audio.mov'))).toBe(true);
    expect(getFix(FIX.audioToAac)?.applicable(videoReport('h264-ok.mp4'))).toBe(false);
  });
  it('apply-rotation only for rotated video', () => {
    expect(getFix(FIX.applyRotation)?.applicable(videoReport('rotated.mp4'))).toBe(true);
    expect(getFix(FIX.applyRotation)?.applicable(videoReport('h264-ok.mp4'))).toBe(false);
  });
  it('planFix rejects inapplicable fixes', () => {
    expect(() => planFix(FIX.applyRotation, videoReport('h264-ok.mp4'))).toThrow(/not applicable/);
    expect(() => planFix('nope', videoReport('h264-ok.mp4'))).toThrow(/Unknown fix/);
  });
});

describe('fixOffers ranking', () => {
  it('hevc.mov: transcode recommended first; strip metadata offered as optional', () => {
    const r = videoReport('hevc.mov');
    const offers = fixOffers(r, runChecks(r, webBrowsers));
    expect(offers[0]?.fix.id).toBe(FIX.transcodeH264Aac);
    expect(offers[0]?.recommended).toBe(true);
    expect(offers[0]?.forFindings).toContain(CHECK.videoCodecUnsupported);
    const strip = offers.find((o) => o.fix.id === FIX.stripMetadata);
    expect(strip?.forFindings).toEqual([]);
    // Remux must not be offered for an HEVC/MOV that browsers can't play... it is muxable, so it
    // appears as an optional action but never above the recommended fix.
    expect(offers.findIndex((o) => o.fix.id === FIX.remuxMp4)).toBeGreaterThan(0);
  });

  it('clean file still gets optional actions', () => {
    const r = videoReport('h264-ok.mp4');
    const offers = fixOffers(r, []);
    expect(offers.map((o) => o.fix.id)).toContain(FIX.stripMetadata);
    expect(offers.every((o) => !o.recommended)).toBe(true);
    // No-re-encode actions come first.
    expect(offers[0]?.fix.reencodes).toBe(false);
  });

  it('image with GPS + orientation ranks lossless strip above re-encodes', () => {
    const r = image({ gps: { lat: 1, lon: 2 }, orientation: 6 });
    const offers = fixOffers(r, runChecks(r, webBrowsers));
    expect(offers[0]?.fix.id).toBe(FIX.stripMetadataLossless);
    expect(offers.find((o) => o.fix.id === FIX.applyOrientation)?.recommended).toBe(true);
  });
});

describe('image plans', () => {
  it('orientation swaps dims for 5–8', () => {
    expect(planFix(FIX.applyOrientation, image({ orientation: 6 })).expected.dims).toEqual({
      width: 3000,
      height: 4000,
    });
    expect(planFix(FIX.applyOrientation, image({ orientation: 3 })).expected.dims).toEqual({
      width: 4000,
      height: 3000,
    });
  });
  it('resize computes target dims after orientation', () => {
    expect(resizedDims(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(resizedDims(100, 50, 2048)).toEqual({ width: 100, height: 50 });
    expect(
      planFix(FIX.resize, image({ orientation: 6 }), { maxSide: '1920' }).expected.dims,
    ).toEqual({ width: 1440, height: 1920 });
  });
  it('convert never reuses the input name', () => {
    expect(planFix(FIX.convert, image({}, 'photo.jpg'), { format: 'jpeg' }).outputName).toBe(
      'photo.converted.jpg',
    );
    expect(planFix(FIX.convert, image({}, 'photo.jpg'), { format: 'png' }).outputName).toBe(
      'photo.png',
    );
    expect(nameOf('a/b:c.MOV', 'fixed', 'mp4')).toBe('a_b_c.fixed.mp4');
  });
});

describe('verify', () => {
  it('reports resolved / remaining / introduced and sanity', () => {
    const before = videoReport('hevc.mov');
    const bf = runChecks(before, webBrowsers);
    const plan = planFix(FIX.transcodeH264Aac, before);
    // Simulate the output: the clean H.264 fixture, renamed.
    const after = { ...videoReport('h264-ok.mp4'), fileName: plan.outputName };
    const v = verify(
      { report: before, findings: bf },
      { report: after, findings: runChecks(after, webBrowsers) },
      plan,
    );
    expect(v.ok).toBe(true);
    expect(v.resolved.map((f) => f.id).sort()).toEqual(
      [CHECK.containerNotMp4, CHECK.mp4NotFaststart, CHECK.videoCodecUnsupported].sort(),
    );
    expect(v.remaining).toEqual([]);
    expect(v.introduced).toEqual([]);
    expect(v.sanity.every((s) => s.ok)).toBe(true);
  });

  it('flags a fix that did not resolve what it promised', () => {
    const before = videoReport('not-faststart.mp4');
    const plan = planFix(FIX.faststart, before);
    const after = { ...before, fileName: plan.outputName }; // unchanged → still not faststart
    const v = verify(
      { report: before, findings: runChecks(before, webBrowsers) },
      { report: after, findings: runChecks(after, webBrowsers) },
      plan,
    );
    expect(v.ok).toBe(false);
    expect(v.remaining.map((f) => f.id)).toEqual([CHECK.mp4NotFaststart]);
  });

  it('fails sanity on wrong dimensions or duration', () => {
    const before = videoReport('h264-ok.mp4');
    const plan = planFix(FIX.stripMetadata, before);
    const after = {
      ...before,
      video: { ...before.video!, width: 100 },
      container: { ...before.container!, durationSec: 5 },
    };
    const v = verify({ report: before, findings: [] }, { report: after, findings: [] }, plan);
    expect(v.sanity.find((s) => s.id === 'dimensions')?.ok).toBe(false);
    expect(v.sanity.find((s) => s.id === 'duration')?.ok).toBe(false);
    expect(v.ok).toBe(false);
  });
});

describe('estimate', () => {
  it('stream copy is fast and near input size', () => {
    const r = videoReport('h264.mkv');
    const e = estimate(planFix(FIX.remuxMp4, r), r);
    expect(e.speed).toBe('fast');
    expect(e.sizeBytes?.[0]).toBeLessThanOrEqual(r.sizeBytes);
    expect(e.sizeBytes?.[1]).toBeGreaterThanOrEqual(r.sizeBytes);
  });
  it('transcode is slow with a size band', () => {
    const r = videoReport('hevc.mov');
    const e = estimate(planFix(FIX.transcodeH264Aac, r), r);
    expect(e.speed).toBe('slow');
    expect(e.sizeBytes?.[0]).toBeGreaterThan(0);
    expect(e.sizeBytes?.[1]).toBeGreaterThan(e.sizeBytes?.[0] ?? 0);
  });
  it('image re-encodes are fast with no size claim', () => {
    const r = image({});
    expect(estimate(planFix(FIX.resize, r), r)).toEqual({
      reencodes: true,
      sizeBytes: null,
      speed: 'fast',
    });
  });
});
