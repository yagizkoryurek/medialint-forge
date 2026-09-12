import { extOf } from '../sniff/magic';
import type {
  AudioStreamInfo,
  ContainerInfo,
  MediaReport,
  MetadataInfo,
  SniffResult,
  StreamCounts,
  VideoStreamInfo,
} from '../types/report';
import { extractMetadata } from './metadata';

/** Loose view of ffprobe's `-print_format json` output. Everything is optional on purpose. */
export interface FfprobeJson {
  format?: {
    format_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, string>;
  };
  streams?: FfprobeStream[];
}

export interface FfprobeStream {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  bits_per_raw_sample?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  color_transfer?: string;
  bit_rate?: string;
  channels?: number;
  sample_rate?: string;
  tags?: Record<string, string>;
  side_data_list?: Array<{ side_data_type?: string; rotation?: number }>;
}

export function parseRate(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(\d+)\/(\d+)$/.exec(s);
  if (m) {
    const num = Number(m[1]);
    const den = Number(m[2]);
    if (!den || !num) return null;
    return num / den;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function num(s: string | number | undefined): number | null {
  if (s === undefined || s === null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bitDepthOf(stream: FfprobeStream): number | null {
  const raw = num(stream.bits_per_raw_sample);
  if (raw) return raw;
  const pf = stream.pix_fmt ?? '';
  const m = /(?:p|gray|rgb|bgr|gbrp?)(\d{2})(?:le|be)?$/.exec(pf) ?? /(\d{2})(?:le|be)$/.exec(pf);
  if (m) {
    const d = Number(m[1]);
    if (d === 10 || d === 12 || d === 14 || d === 16) return d;
  }
  return pf ? 8 : null;
}

/**
 * Display rotation in clockwise degrees needed for correct playback.
 * ffprobe's Display Matrix `rotation` is counter-clockwise; the legacy `rotate` tag is clockwise.
 */
export function rotationOf(stream: FfprobeStream): number {
  const side = stream.side_data_list?.find((s) => typeof s.rotation === 'number');
  if (side && typeof side.rotation === 'number') {
    const cw = ((-side.rotation % 360) + 360) % 360;
    return Math.round(cw);
  }
  const tag = num(stream.tags?.rotate);
  if (tag !== null) return ((Math.round(tag) % 360) + 360) % 360;
  return 0;
}

function videoInfo(stream: FfprobeStream): VideoStreamInfo {
  const fpsAvg = parseRate(stream.avg_frame_rate);
  const fpsR = parseRate(stream.r_frame_rate);
  const isVFR = fpsAvg !== null && fpsR !== null && Math.abs(fpsAvg - fpsR) / fpsR > 0.01;
  return {
    codec: stream.codec_name ?? 'unknown',
    profile: stream.profile ?? null,
    pixFmt: stream.pix_fmt ?? null,
    bitDepth: bitDepthOf(stream),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fpsAvg,
    fpsR,
    isVFR,
    rotation: rotationOf(stream),
    colorTransfer: stream.color_transfer ?? null,
    bitrate: num(stream.bit_rate),
  };
}

function audioInfo(stream: FfprobeStream): AudioStreamInfo {
  return {
    codec: stream.codec_name ?? 'unknown',
    channels: stream.channels ?? null,
    sampleRate: num(stream.sample_rate),
    bitrate: num(stream.bit_rate),
  };
}

export interface FromFfprobeInput {
  fileName: string;
  sizeBytes: number;
  sniff: SniffResult;
  json: unknown;
}

export function fromFfprobe(input: FromFfprobeInput): MediaReport {
  const json = (input.json ?? {}) as FfprobeJson;
  const streams = json.streams ?? [];

  const counts: StreamCounts = { video: 0, audio: 0, subtitle: 0, other: 0 };
  let video: VideoStreamInfo | null = null;
  const audio: AudioStreamInfo[] = [];
  const streamTags: Record<string, string> = {};

  for (const s of streams) {
    switch (s.codec_type) {
      case 'video':
        counts.video++;
        // ffprobe reports attached cover art as a video stream; ignore anything without dimensions.
        if (!video && s.width && s.height) video = videoInfo(s);
        break;
      case 'audio':
        counts.audio++;
        audio.push(audioInfo(s));
        break;
      case 'subtitle':
        counts.subtitle++;
        break;
      default:
        counts.other++;
    }
    for (const [k, v] of Object.entries(s.tags ?? {}))
      streamTags[`stream${s.index ?? '?'}.${k}`] = String(v);
  }

  const container: ContainerInfo = {
    formatName: json.format?.format_name ?? 'unknown',
    durationSec: num(json.format?.duration),
    bitrate: num(json.format?.bit_rate),
  };

  const metadata: MetadataInfo = extractMetadata({ ...(json.format?.tags ?? {}) }, streamTags);

  return {
    kind: 'video',
    fileName: input.fileName,
    ext: extOf(input.fileName),
    sizeBytes: input.sizeBytes,
    sniff: input.sniff,
    container,
    video,
    audio,
    streamCounts: counts,
    image: null,
    metadata,
    raw: input.json,
  };
}
