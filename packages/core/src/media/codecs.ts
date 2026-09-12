/** Shared codec/container facts used by both checks and fixes. */

/** Video codecs the MP4 muxer can carry with stream copy. */
export const MP4_VIDEO_CODECS: ReadonlyArray<string> = [
  'h264',
  'hevc',
  'vp9',
  'av1',
  'mpeg4',
  'mjpeg',
];

/** Audio codecs the MP4 muxer can carry with stream copy. */
export const MP4_AUDIO_CODECS: ReadonlyArray<string> = [
  'aac',
  'mp3',
  'ac3',
  'eac3',
  'alac',
  'opus',
  'flac',
];

export function mp4CanCarry(videoCodec: string | null, audioCodec: string | null): boolean {
  if (videoCodec && !MP4_VIDEO_CODECS.includes(videoCodec)) return false;
  if (audioCodec && !MP4_AUDIO_CODECS.includes(audioCodec)) return false;
  return true;
}
