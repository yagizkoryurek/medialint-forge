/**
 * All user-facing wording for findings lives here, keyed by check id. Rules:
 *  - `title`: one line, plain language, no codec jargon unless it's the thing being named.
 *  - `explanation`: 1–3 sentences on what it means for the user.
 *  - `why`: why it matters for the active profile (profile name is interpolated).
 * Technical detail belongs in `evidence`, which the UI shows in a collapsible section.
 */

const CODEC_NAMES: Record<string, string> = {
  hevc: 'HEVC (H.265)',
  h265: 'HEVC (H.265)',
  prores: 'Apple ProRes',
  mpeg4: 'MPEG-4 Part 2 (DivX/Xvid)',
  mpeg2video: 'MPEG-2',
  mpeg1video: 'MPEG-1',
  mjpeg: 'Motion JPEG',
  dnxhd: 'DNxHD',
  vc1: 'VC-1',
  wmv3: 'Windows Media Video',
  h264: 'H.264',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  aac: 'AAC',
  mp3: 'MP3',
  opus: 'Opus',
  vorbis: 'Vorbis',
  ac3: 'Dolby Digital (AC-3)',
  eac3: 'Dolby Digital Plus (E-AC-3)',
  alac: 'Apple Lossless (ALAC)',
  flac: 'FLAC',
  dts: 'DTS',
  truehd: 'Dolby TrueHD',
  wmav2: 'Windows Media Audio',
};

export function codecName(codec: string): string {
  if (CODEC_NAMES[codec]) return CODEC_NAMES[codec];
  if (codec.startsWith('pcm_')) return 'uncompressed PCM';
  return codec.toUpperCase();
}

export function formatName(fmt: string): string {
  const map: Record<string, string> = {
    mp4: 'MP4',
    mov: 'QuickTime (.mov)',
    mkv: 'Matroska (.mkv)',
    webm: 'WebM',
    jpeg: 'JPEG',
    png: 'PNG',
    webp: 'WebP',
    unknown: 'an unrecognized format',
  };
  return map[fmt] ?? fmt.toUpperCase();
}

export function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export const en = {
  extMismatch: (ext: string, actual: string) => ({
    title: `This file is actually ${formatName(actual)}, not .${ext}`,
    explanation: `The name ends in .${ext} but the contents are ${formatName(actual)}. Some apps trust the extension and will refuse to open it or open it with the wrong decoder.`,
    why: (profile: string) =>
      `${profile} pick a decoder from the file's contents, but upload forms and file managers often go by the extension.`,
  }),

  metadataGps: (lat: number, lon: number) => ({
    title: 'Contains your location',
    explanation: `The file records GPS coordinates (${lat.toFixed(4)}, ${lon.toFixed(4)}). Anyone you share it with can see where it was taken.`,
    why: () =>
      'Location is embedded metadata and survives uploads unless the receiving site strips it.',
  }),

  metadataDevice: (make: string | null, model: string | null) => ({
    title: 'Contains camera or device details',
    explanation: `The file names the device that made it (${[make, model].filter(Boolean).join(' ')}). This is usually harmless but is personal information.`,
    why: () => 'Device tags can fingerprint you across files you share.',
  }),

  fileSizeLarge: (size: number, limit: number, kind: 'video' | 'image') => ({
    title: `Large ${kind} (${humanBytes(size)})`,
    explanation: `At ${humanBytes(size)} this ${kind} is bigger than the ${humanBytes(limit)} most sites and messengers are comfortable with. It will be slow to upload and may be rejected.`,
    why: (profile: string) =>
      `${profile} will play it, but hosting sites and chat apps usually enforce size limits.`,
  }),

  videoCodecUnsupported: (codec: string) => ({
    title: `Video uses ${codecName(codec)}, which most browsers can't play`,
    explanation: `The picture is compressed with ${codecName(codec)}. Browsers and many apps only ship decoders for H.264, VP8, VP9 and AV1, so this file will show a black screen or fail to open.`,
    why: (profile: string) =>
      `${profile} do not include a ${codecName(codec)} decoder, or only on some devices.`,
  }),

  containerNotMp4: (fmt: string, streamsOk: boolean) => ({
    title: `Wrapped as ${formatName(fmt)} instead of MP4`,
    explanation: streamsOk
      ? `The video and audio inside are web-compatible, but the ${formatName(fmt)} wrapper is not accepted everywhere. Re-wrapping as MP4 takes seconds and loses no quality.`
      : `The ${formatName(fmt)} wrapper is not accepted everywhere. Converting to MP4 will fix this together with the codec problems above.`,
    why: (profile: string) =>
      `${profile} support MP4 and WebM; other wrappers depend on the browser and OS.`,
  }),

  mp4NotFaststart: () => ({
    title: 'Will buffer before it starts playing online',
    explanation:
      'The index that players need is stored at the very end of the file, so a browser has to download the whole thing before it can start. Moving the index to the front is instant and lossless.',
    why: () => 'Streaming playback needs the "moov" index up front.',
  }),

  pixfmtNotYuv420p: (pixFmt: string, bitDepth: number | null) => ({
    title:
      bitDepth && bitDepth > 8
        ? `Video is ${bitDepth}-bit, which browsers can't play`
        : "Video uses a color format browsers can't play",
    explanation: `The pixels are stored as ${pixFmt}. Web players expect 8-bit 4:2:0 (yuv420p). This is common for camera and editing exports and needs a re-encode.`,
    why: (profile: string) => `${profile} hardware decoders only handle 8-bit 4:2:0.`,
  }),

  oddDimensions: (w: number, h: number) => ({
    title: `Unusual frame size (${w}×${h})`,
    explanation:
      'Width and height should both be even numbers. Odd sizes make some players and encoders fail or show a green line at the edge.',
    why: () => 'H.264 and most hardware decoders require even dimensions.',
  }),

  rotationMetadata: (deg: number) => ({
    title: 'Plays sideways in some apps',
    explanation: `The video is stored unrotated with a ${deg}° "please rotate" tag. Phones and modern players honor it; many desktop apps, older players and some websites ignore it and show the picture sideways or upside-down.`,
    why: () =>
      'Rotation tags are honored inconsistently. Baking the rotation into the pixels works everywhere.',
  }),

  fpsVfr: (avg: number, nominal: number) => ({
    title: 'Frame rate varies through the video',
    explanation: `Frames arrive at ${avg.toFixed(2)} fps on average but the video is declared as ${nominal.toFixed(2)} fps. Screen recordings and phone videos often look like this. Editors may drift audio out of sync.`,
    why: () => 'Playback is fine; editing tools and some converters assume a constant frame rate.',
  }),

  audioCodecUnsupported: (codec: string, container: string) => ({
    title: `Audio uses ${codecName(codec)}, which browsers can't play in ${formatName(container)}`,
    explanation: `The sound is stored as ${codecName(codec)}. Browsers expect AAC or MP3 in MP4, and Opus or Vorbis in WebM. The video may play silently.`,
    why: (profile: string) => `${profile} ship a fixed set of audio decoders per container.`,
  }),

  audioMissing: () => ({
    title: 'No audio track',
    explanation:
      'This video has no sound at all. That may be intended, but some platforms require an audio track and will reject or mis-handle silent videos.',
    why: () => 'Harmless in browsers; worth knowing before you upload.',
  }),

  imageOrientationTag: (orientation: number) => ({
    title: 'Displays rotated in some apps',
    explanation: `The pixels are stored one way and an EXIF tag (orientation ${orientation}) asks viewers to rotate them. Browsers and phones obey it; many older apps and some websites don't, so the photo appears sideways.`,
    why: () => 'Applying the rotation to the pixels removes the ambiguity.',
  }),

  imageHugeDimensions: (w: number, h: number, maxSide: number) => ({
    title: `Very large image (${w}×${h})`,
    explanation: `At ${((w * h) / 1e6).toFixed(1)} megapixels this is bigger than most screens and some sites need (they typically cap a side at ${maxSide}px). It will be slow to load and may be rejected or silently downscaled.`,
    why: () => 'Browsers decode it, but memory use and load time grow with every pixel.',
  }),

  png16bit: () => ({
    title: '16-bit PNG',
    explanation:
      'This PNG stores 16 bits per channel. Browsers display it fine but reduce it to 8 bits anyway, so the file is roughly twice as large as it needs to be.',
    why: () => 'No visible benefit on the web; larger download.',
  }),
} as const;

export type ExplainKey = keyof typeof en;
