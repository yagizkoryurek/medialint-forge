/**
 * MediaReport — the canonical, engine-independent description of one media file.
 * Everything downstream (checks, fixes, verify, UI) reads this shape and nothing else.
 * It must stay plain JSON so a future CLI / GitHub Action can emit and consume it verbatim.
 */

export type MediaKind = 'video' | 'image';

/** Containers/formats detected by the byte-level sniffer (not by extension). */
export type SniffedFormat = 'mp4' | 'mov' | 'mkv' | 'webm' | 'jpeg' | 'png' | 'webp' | 'unknown';

export interface SniffResult {
  format: SniffedFormat;
  /** Whether the file extension agrees with the sniffed format (e.g. `.mp4` containing MOV brands is still `true`). */
  extMatches: boolean;
  /** MP4/MOV only: `true` when the `moov` box precedes `mdat` (streamable / "faststart"). */
  fastStart?: boolean;
  /** MP4/MOV only: major brand from `ftyp`, e.g. `isom`, `qt  `, `mp42`. */
  brand?: string;
}

export interface ContainerInfo {
  /** ffprobe `format_name`, e.g. `mov,mp4,m4a,3gp,3g2,mj2` or `matroska,webm`. */
  formatName: string;
  durationSec: number | null;
  /** Overall bitrate in bits per second, if known. */
  bitrate: number | null;
}

export interface VideoStreamInfo {
  codec: string; // ffprobe codec_name: h264, hevc, prores, vp9, av1, ...
  profile: string | null;
  pixFmt: string | null;
  bitDepth: number | null;
  width: number;
  height: number;
  /** Average frame rate (frames per second) from `avg_frame_rate`. */
  fpsAvg: number | null;
  /** Nominal/"real base" frame rate from `r_frame_rate`. */
  fpsR: number | null;
  /** Heuristic: avg and nominal rates differ by more than 1 %. */
  isVFR: boolean;
  /** Display rotation in degrees (0, 90, 180, 270) derived from side data or `rotate` tag. */
  rotation: number;
  colorTransfer: string | null;
  bitrate: number | null;
}

export interface AudioStreamInfo {
  codec: string; // aac, mp3, opus, vorbis, pcm_s16le, ac3, alac, ...
  channels: number | null;
  sampleRate: number | null;
  bitrate: number | null;
}

export interface StreamCounts {
  video: number;
  audio: number;
  subtitle: number;
  other: number;
}

export interface ImageInfo {
  format: 'jpeg' | 'png' | 'webp';
  width: number;
  height: number;
  /** PNG: IHDR bit depth. Other formats: null. */
  bitDepth: number | null;
  /** EXIF Orientation (1–8); null when absent. */
  orientation: number | null;
  hasAlpha: boolean | null;
  animated: boolean | null;
}

export interface GpsInfo {
  lat: number;
  lon: number;
}

export interface MetadataInfo {
  gps: GpsInfo | null;
  make: string | null;
  model: string | null;
  software: string | null;
  creationTime: string | null;
  /** Every other container/EXIF tag we saw, stringified. Used for the technical-details expander. */
  tags: Record<string, string>;
}

export interface MediaReport {
  kind: MediaKind;
  fileName: string;
  /** Lower-case extension without the dot, or `''`. */
  ext: string;
  sizeBytes: number;
  sniff: SniffResult;
  container: ContainerInfo | null;
  video: VideoStreamInfo | null;
  /** All audio streams; MVP checks look at `audio[0]`. */
  audio: AudioStreamInfo[];
  streamCounts: StreamCounts;
  image: ImageInfo | null;
  metadata: MetadataInfo;
  /** The raw probe payload (ffprobe JSON or image probe object), kept for diagnostics only. */
  raw: unknown;
}
