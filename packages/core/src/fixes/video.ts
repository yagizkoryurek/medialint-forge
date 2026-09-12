import { mp4CanCarry } from '../media/codecs';
import { webBrowsers } from '../profiles/web-browsers';
import { defineFix } from '../types/fix';
import type { MediaReport } from '../types/report';
import {
  audioToAacArgv,
  type Quality,
  remuxToMp4Argv,
  stripMetadataArgv,
  transcodeH264AacArgv,
} from './argv';
import { CHECK, FIX } from './ids';
import { outputName } from './naming';

/** Dimensions after ffmpeg's autorotate bakes a 90°/270° tag into the pixels. */
function displayDims(report: MediaReport): { width: number; height: number } | undefined {
  const v = report.video;
  if (!v) return undefined;
  const swap = v.rotation === 90 || v.rotation === 270;
  return swap ? { width: v.height, height: v.width } : { width: v.width, height: v.height };
}

function evenDims(d: { width: number; height: number } | undefined) {
  if (!d) return undefined;
  return { width: d.width - (d.width % 2), height: d.height - (d.height % 2) };
}

function streams(report: MediaReport) {
  return { video: 1, audio: Math.min(1, report.streamCounts.audio) };
}

/** Audio the MP4 muxer *and* browsers accept without re-encoding. */
function audioIsWebMp4Safe(report: MediaReport): boolean {
  const a = report.audio[0];
  if (!a) return true;
  return (webBrowsers.audioCodecs.mp4 ?? []).includes(a.codec);
}

/** Audio browsers accept in the file's *current* wrapper (Opus in WebM is fine, PCM in MOV is not). */
function audioIsWebSafeInPlace(report: MediaReport): boolean {
  const a = report.audio[0];
  if (!a) return true;
  const list = webBrowsers.audioCodecs[report.sniff.format] ?? webBrowsers.audioCodecs['*'] ?? [];
  return list.includes(a.codec);
}

export const remuxMp4 = defineFix<Record<string, never>>({
  id: FIX.remuxMp4,
  kinds: ['video'],
  title: 'Re-wrap as MP4 (no re-encode)',
  reencodes: false,
  describe: () =>
    'Copies the existing video and audio into a fresh MP4 with the index up front. Seconds, no quality loss.',
  defaults: () => ({}),
  applicable: (report) =>
    report.kind === 'video' &&
    !!report.video &&
    mp4CanCarry(report.video.codec, report.audio[0]?.codec ?? null),
  plan(report) {
    const out = outputName(report.fileName, 'fixed', 'mp4');
    return {
      fixId: FIX.remuxMp4,
      outputName: out,
      outputKind: 'video',
      reencodes: false,
      steps: [{ kind: 'ffmpeg', argv: remuxToMp4Argv(report.fileName, out) }],
      expected: {
        resolves: [CHECK.containerNotMp4, CHECK.mp4NotFaststart, CHECK.extMismatch],
        durationDeltaSec: 0,
        ...(report.video
          ? { dims: { width: report.video.width, height: report.video.height } }
          : {}),
        streams: streams(report),
      },
    };
  },
});

export const faststart = defineFix<Record<string, never>>({
  id: FIX.faststart,
  kinds: ['video'],
  title: 'Move the index to the front (no re-encode)',
  reencodes: false,
  describe: () =>
    'Rewrites the file so it can start playing while it downloads. Instant and lossless.',
  defaults: () => ({}),
  applicable: (report) =>
    report.kind === 'video' && (report.sniff.format === 'mp4' || report.sniff.format === 'mov'),
  plan(report) {
    // Keep the source wrapper: ProRes/PCM/etc. are legal in MOV but not in MP4.
    const ext = report.sniff.format === 'mov' ? 'mov' : 'mp4';
    const out = outputName(report.fileName, 'faststart', ext);
    return {
      fixId: FIX.faststart,
      outputName: out,
      outputKind: 'video',
      reencodes: false,
      steps: [{ kind: 'ffmpeg', argv: remuxToMp4Argv(report.fileName, out) }],
      expected: {
        resolves: [CHECK.mp4NotFaststart],
        durationDeltaSec: 0,
        ...(report.video
          ? { dims: { width: report.video.width, height: report.video.height } }
          : {}),
        streams: streams(report),
      },
    };
  },
});

export const stripMetadata = defineFix<Record<string, never>>({
  id: FIX.stripMetadata,
  kinds: ['video'],
  title: 'Remove location and device metadata (no re-encode)',
  reencodes: false,
  describe: () =>
    'Copies the video and audio untouched and drops every metadata tag, chapter and embedded location.',
  defaults: () => ({}),
  applicable: (report) => report.kind === 'video' && report.sniff.format !== 'unknown',
  plan(report) {
    // Keep the wrapper the user has (MP4/MOV/MKV/WebM) — this fix is about metadata only.
    const ext =
      report.sniff.format === 'unknown'
        ? 'mp4'
        : report.sniff.format === 'mov'
          ? 'mov'
          : report.sniff.format;
    const out = outputName(report.fileName, 'nometa', ext);
    return {
      fixId: FIX.stripMetadata,
      outputName: out,
      outputKind: 'video',
      reencodes: false,
      steps: [{ kind: 'ffmpeg', argv: stripMetadataArgv(report.fileName, out, ext) }],
      expected: {
        resolves: [CHECK.metadataGps, CHECK.metadataDevice],
        durationDeltaSec: 0,
        ...(report.video
          ? { dims: { width: report.video.width, height: report.video.height } }
          : {}),
        streams: streams(report),
      },
    };
  },
});

export interface TranscodeParams extends Record<string, unknown> {
  quality: Quality;
}

export const transcodeH264Aac = defineFix<TranscodeParams>({
  id: FIX.transcodeH264Aac,
  kinds: ['video'],
  title: 'Convert to H.264 MP4',
  reencodes: true,
  params: [
    {
      key: 'quality',
      label: 'Quality',
      type: 'select',
      options: [
        { value: 'high', label: 'High (larger file)' },
        { value: 'medium', label: 'Balanced' },
        { value: 'low', label: 'Smaller file' },
      ],
    },
  ],
  describe: (report, { quality }) =>
    `Re-encodes the picture to H.264 (${quality} quality, 8-bit, even dimensions) and the sound to AAC, in an MP4 that plays everywhere. This takes a while${report.container?.durationSec ? ` for a ${Math.round(report.container.durationSec)}-second clip` : ''}.`,
  defaults: () => ({ quality: 'medium' }),
  applicable: (report) => report.kind === 'video' && !!report.video,
  plan(report, params) {
    const out = outputName(report.fileName, 'fixed', 'mp4');
    const copyAudio = audioIsWebMp4Safe(report);
    const dims = evenDims(displayDims(report));
    return {
      fixId: FIX.transcodeH264Aac,
      outputName: out,
      outputKind: 'video',
      reencodes: true,
      steps: [
        {
          kind: 'ffmpeg',
          argv: transcodeH264AacArgv(report.fileName, out, {
            quality: params.quality,
            copyAudio,
            evenDims: true,
          }),
        },
      ],
      expected: {
        resolves: [
          CHECK.videoCodecUnsupported,
          CHECK.pixfmtNotYuv420p,
          CHECK.oddDimensions,
          CHECK.containerNotMp4,
          CHECK.mp4NotFaststart,
          CHECK.rotationMetadata,
          CHECK.extMismatch,
          ...(copyAudio ? [] : [CHECK.audioCodecUnsupported]),
          CHECK.fileSizeLarge,
        ],
        durationDeltaSec: 0,
        ...(dims ? { dims } : {}),
        streams: streams(report),
      },
    };
  },
});

export const applyRotation = defineFix<Record<string, never>>({
  id: FIX.applyRotation,
  kinds: ['video'],
  title: 'Bake the rotation into the video',
  reencodes: true,
  describe: (report) =>
    `Re-encodes the picture rotated by ${report.video?.rotation ?? 0}° so every player shows it the right way up, and removes the rotation tag. Sound is ${audioIsWebMp4Safe(report) ? 'copied untouched' : 'converted to AAC'}.`,
  defaults: () => ({}),
  applicable: (report) => report.kind === 'video' && !!report.video && report.video.rotation !== 0,
  plan(report) {
    const out = outputName(report.fileName, 'rotated', 'mp4');
    const copyAudio = audioIsWebMp4Safe(report);
    const dims = evenDims(displayDims(report));
    return {
      fixId: FIX.applyRotation,
      outputName: out,
      outputKind: 'video',
      reencodes: true,
      steps: [
        {
          kind: 'ffmpeg',
          argv: transcodeH264AacArgv(report.fileName, out, {
            quality: 'high',
            copyAudio,
            evenDims: true,
          }),
        },
      ],
      expected: {
        resolves: [CHECK.rotationMetadata, CHECK.containerNotMp4, CHECK.mp4NotFaststart],
        durationDeltaSec: 0,
        ...(dims ? { dims } : {}),
        streams: streams(report),
      },
    };
  },
});

export const audioToAac = defineFix<Record<string, never>>({
  id: FIX.audioToAac,
  kinds: ['video'],
  title: 'Convert the sound to AAC (video untouched)',
  reencodes: false,
  describe: () =>
    'Keeps the video exactly as it is and re-encodes only the audio track to AAC in an MP4. Fast.',
  defaults: () => ({}),
  applicable: (report) =>
    report.kind === 'video' &&
    !!report.video &&
    report.audio.length > 0 &&
    mp4CanCarry(report.video.codec, null) &&
    !audioIsWebSafeInPlace(report),
  plan(report) {
    const out = outputName(report.fileName, 'fixed', 'mp4');
    return {
      fixId: FIX.audioToAac,
      outputName: out,
      outputKind: 'video',
      reencodes: false,
      steps: [{ kind: 'ffmpeg', argv: audioToAacArgv(report.fileName, out) }],
      expected: {
        resolves: [CHECK.audioCodecUnsupported, CHECK.containerNotMp4, CHECK.mp4NotFaststart],
        durationDeltaSec: 0,
        ...(report.video
          ? { dims: { width: report.video.width, height: report.video.height } }
          : {}),
        streams: { video: 1, audio: 1 },
      },
    };
  },
});

export const VIDEO_FIXES = [
  remuxMp4,
  faststart,
  stripMetadata,
  transcodeH264Aac,
  applyRotation,
  audioToAac,
] as const;
