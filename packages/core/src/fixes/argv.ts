/**
 * ffmpeg argv builders. Pure functions, snapshot-tested. Every builder returns the full argv
 * (without the leading `ffmpeg`) using the virtual `/input` and `/out` paths.
 *
 * Guardrails baked in for the wasm build and for web playback:
 *  - `-nostdin -y -hide_banner` so ffmpeg never waits or spams.
 *  - `-map 0:v:0 -map 0:a:0?` — one video and (optionally) one audio stream; data/timecode/
 *    subtitle streams are dropped because they routinely break stream-copy into MP4.
 *  - `-movflags +faststart` on every MP4/MOV output.
 *  - `-pix_fmt yuv420p` + even dimensions for H.264.
 *  - `-max_muxing_queue_size 1024` to avoid the classic "Too many packets buffered" failure.
 */
import { INPUT_DIR, OUTPUT_DIR } from '../types/fix';

export const inputPath = (name: string) => `${INPUT_DIR}/${name}`;
export const outputPath = (name: string) => `${OUTPUT_DIR}/${name}`;

const COMMON = ['-nostdin', '-y', '-hide_banner'] as const;
const ONE_V_ONE_A = ['-map', '0:v:0', '-map', '0:a:0?'] as const;
const NO_EXTRA_STREAMS = ['-dn', '-sn'] as const;
const FASTSTART = ['-movflags', '+faststart'] as const;
const MUX_QUEUE = ['-max_muxing_queue_size', '1024'] as const;
const STRIP_ENCODER_TAG = ['-fflags', '+bitexact'] as const;

export const CRF_BY_QUALITY = { low: '28', medium: '23', high: '20' } as const;
export type Quality = keyof typeof CRF_BY_QUALITY;

function isMp4Like(ext: string): boolean {
  return ext === 'mp4' || ext === 'mov' || ext === 'm4v';
}

/** Stream-copy remux into MP4 (also used for faststart-only). */
export function remuxToMp4Argv(inName: string, outName: string): string[] {
  return [
    ...COMMON,
    '-i',
    inputPath(inName),
    ...ONE_V_ONE_A,
    ...NO_EXTRA_STREAMS,
    '-c',
    'copy',
    ...FASTSTART,
    ...MUX_QUEUE,
    outputPath(outName),
  ];
}

/** Stream-copy with all global, chapter and per-stream metadata removed. */
export function stripMetadataArgv(inName: string, outName: string, outExt: string): string[] {
  return [
    ...COMMON,
    '-i',
    inputPath(inName),
    ...ONE_V_ONE_A,
    ...NO_EXTRA_STREAMS,
    '-map_metadata',
    '-1',
    '-map_metadata:s:v',
    '-1',
    '-map_metadata:s:a',
    '-1',
    '-map_chapters',
    '-1',
    ...STRIP_ENCODER_TAG,
    '-c',
    'copy',
    ...(isMp4Like(outExt) ? FASTSTART : []),
    ...MUX_QUEUE,
    outputPath(outName),
  ];
}

export interface TranscodeOptions {
  quality: Quality;
  /** Copy the audio stream instead of encoding to AAC (only when it is already MP4/web safe). */
  copyAudio: boolean;
  /** Include the even-dimension scale filter (harmless when dimensions are already even). */
  evenDims: boolean;
}

/** Full re-encode to H.264 (yuv420p, even dims) + AAC in MP4. ffmpeg's autorotate bakes in any rotation tag. */
export function transcodeH264AacArgv(
  inName: string,
  outName: string,
  opts: TranscodeOptions,
): string[] {
  return [
    ...COMMON,
    '-i',
    inputPath(inName),
    ...ONE_V_ONE_A,
    ...NO_EXTRA_STREAMS,
    ...(opts.evenDims ? ['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2'] : []),
    '-pix_fmt',
    'yuv420p',
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    CRF_BY_QUALITY[opts.quality],
    ...(opts.copyAudio ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']),
    ...FASTSTART,
    ...MUX_QUEUE,
    outputPath(outName),
  ];
}

/** Keep the video, re-encode only the audio to AAC, in MP4. */
export function audioToAacArgv(inName: string, outName: string): string[] {
  return [
    ...COMMON,
    '-i',
    inputPath(inName),
    ...ONE_V_ONE_A,
    ...NO_EXTRA_STREAMS,
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    ...FASTSTART,
    ...MUX_QUEUE,
    outputPath(outName),
  ];
}

/** Renders argv for display: quotes arguments containing spaces or shell-special characters. */
export function formatCommand(argv: ReadonlyArray<string>, bin = 'ffmpeg'): string {
  const q = (s: string) => (/[\s"'$`\\()]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s);
  return [bin, ...argv.map(q)].join(' ');
}
