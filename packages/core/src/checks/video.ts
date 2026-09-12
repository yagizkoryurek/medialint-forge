import { en } from '../explain/en';
import { CHECK, FIX } from '../fixes/ids';
import { defineCheck } from '../types/finding';
import type { Profile } from '../types/profile';
import type { MediaReport } from '../types/report';
import { streamsWebCompatible } from './common';

function audioCodecsFor(profile: Profile, container: string): ReadonlyArray<string> {
  return profile.audioCodecs[container] ?? profile.audioCodecs['*'] ?? [];
}

export const videoCodecUnsupported = defineCheck({
  id: CHECK.videoCodecUnsupported,
  kinds: ['video'],
  category: 'compat',
  run(report, { profile }) {
    const v = report.video;
    if (!v || profile.videoCodecs.includes(v.codec)) return [];
    const copy = en.videoCodecUnsupported(v.codec);
    return [
      {
        id: CHECK.videoCodecUnsupported,
        checkId: CHECK.videoCodecUnsupported,
        severity: 'error',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: {
          codec: v.codec,
          ...(v.profile ? { profile: v.profile } : {}),
          accepted: profile.videoCodecs.join(', '),
        },
        fixes: [{ fixId: FIX.transcodeH264Aac, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const containerNotMp4 = defineCheck({
  id: CHECK.containerNotMp4,
  kinds: ['video'],
  category: 'compat',
  run(report, { profile }) {
    const fmt = report.sniff.format;
    if (fmt === 'unknown' || profile.containers.includes(fmt)) return [];
    const streamsOk = streamsWebCompatible(
      report,
      profile.videoCodecs,
      // After a remux to MP4 the audio must be MP4-compatible.
      audioCodecsFor(profile, 'mp4'),
      profile.pixFmts,
    );
    const copy = en.containerNotMp4(fmt, streamsOk);
    return [
      {
        id: CHECK.containerNotMp4,
        checkId: CHECK.containerNotMp4,
        severity: 'warn',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: {
          container: fmt,
          formatName: report.container?.formatName ?? '',
          streamsWebCompatible: streamsOk,
        },
        fixes: [
          streamsOk
            ? { fixId: FIX.remuxMp4, recommended: true }
            : { fixId: FIX.transcodeH264Aac, recommended: true },
        ],
        source: 'sniff',
      },
    ];
  },
});

export const mp4NotFaststart = defineCheck({
  id: CHECK.mp4NotFaststart,
  kinds: ['video'],
  category: 'compat',
  run(report) {
    const { sniff } = report;
    if ((sniff.format !== 'mp4' && sniff.format !== 'mov') || sniff.fastStart !== false) return [];
    const copy = en.mp4NotFaststart();
    return [
      {
        id: CHECK.mp4NotFaststart,
        checkId: CHECK.mp4NotFaststart,
        severity: 'warn',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { moovBeforeMdat: false },
        fixes: [{ fixId: FIX.faststart, recommended: true }],
        source: 'sniff',
      },
    ];
  },
});

export const pixfmtNotYuv420p = defineCheck({
  id: CHECK.pixfmtNotYuv420p,
  kinds: ['video'],
  category: 'compat',
  run(report, { profile }) {
    const v = report.video;
    if (!v || !v.pixFmt || profile.pixFmts.includes(v.pixFmt)) return [];
    const copy = en.pixfmtNotYuv420p(v.pixFmt, v.bitDepth);
    return [
      {
        id: CHECK.pixfmtNotYuv420p,
        checkId: CHECK.pixfmtNotYuv420p,
        severity: 'error',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: { pixFmt: v.pixFmt, ...(v.bitDepth ? { bitDepth: v.bitDepth } : {}) },
        fixes: [{ fixId: FIX.transcodeH264Aac, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const oddDimensions = defineCheck({
  id: CHECK.oddDimensions,
  kinds: ['video'],
  category: 'compat',
  run(report) {
    const v = report.video;
    if (!v || !v.width || !v.height) return [];
    if (v.width % 2 === 0 && v.height % 2 === 0) return [];
    const copy = en.oddDimensions(v.width, v.height);
    return [
      {
        id: CHECK.oddDimensions,
        checkId: CHECK.oddDimensions,
        severity: 'warn',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { width: v.width, height: v.height },
        fixes: [{ fixId: FIX.transcodeH264Aac, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const rotationMetadata = defineCheck({
  id: CHECK.rotationMetadata,
  kinds: ['video'],
  category: 'compat',
  run(report) {
    const v = report.video;
    if (!v || v.rotation === 0) return [];
    const copy = en.rotationMetadata(v.rotation);
    return [
      {
        id: CHECK.rotationMetadata,
        checkId: CHECK.rotationMetadata,
        severity: 'warn',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { rotationClockwise: v.rotation, storedWidth: v.width, storedHeight: v.height },
        fixes: [{ fixId: FIX.applyRotation, recommended: true }],
        source: 'probe',
      },
    ];
  },
});

export const fpsVfr = defineCheck({
  id: CHECK.fpsVfr,
  kinds: ['video'],
  category: 'integrity',
  run(report) {
    const v = report.video;
    if (!v || !v.isVFR || v.fpsAvg === null || v.fpsR === null) return [];
    const copy = en.fpsVfr(v.fpsAvg, v.fpsR);
    return [
      {
        id: CHECK.fpsVfr,
        checkId: CHECK.fpsVfr,
        severity: 'info',
        category: 'integrity',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: {
          averageFps: Number(v.fpsAvg.toFixed(3)),
          nominalFps: Number(v.fpsR.toFixed(3)),
        },
        fixes: [],
        source: 'probe',
      },
    ];
  },
});

export const audioCodecUnsupported = defineCheck({
  id: CHECK.audioCodecUnsupported,
  kinds: ['video'],
  category: 'compat',
  run(report, { profile }) {
    const a = report.audio[0];
    if (!a) return [];
    const container = report.sniff.format === 'unknown' ? '*' : report.sniff.format;
    const accepted = audioCodecsFor(profile, container);
    if (accepted.includes(a.codec)) return [];
    const copy = en.audioCodecUnsupported(a.codec, container);
    const videoOk = report.video ? profile.videoCodecs.includes(report.video.codec) : false;
    return [
      {
        id: CHECK.audioCodecUnsupported,
        checkId: CHECK.audioCodecUnsupported,
        severity: 'error',
        category: 'compat',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: { audioCodec: a.codec, container, accepted: accepted.join(', ') },
        fixes: [
          // Copy the video when it's already fine; otherwise the full transcode covers both.
          videoOk
            ? { fixId: FIX.audioToAac, recommended: true }
            : { fixId: FIX.transcodeH264Aac, recommended: true },
        ],
        source: 'probe',
      },
    ];
  },
});

export const audioMissing = defineCheck({
  id: CHECK.audioMissing,
  kinds: ['video'],
  category: 'integrity',
  run(report, { profile }) {
    if (report.streamCounts.audio > 0) return [];
    const copy = en.audioMissing();
    return [
      {
        id: CHECK.audioMissing,
        checkId: CHECK.audioMissing,
        severity: profile.requiresAudio ? 'error' : 'info',
        category: 'integrity',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(),
        evidence: { audioStreams: 0 },
        fixes: [],
        source: 'probe',
      },
    ];
  },
});

export const VIDEO_CHECKS = [
  videoCodecUnsupported,
  pixfmtNotYuv420p,
  audioCodecUnsupported,
  containerNotMp4,
  mp4NotFaststart,
  oddDimensions,
  rotationMetadata,
  fpsVfr,
  audioMissing,
] as const;

export type VideoReport = MediaReport & { kind: 'video' };
