/**
 * Fix identifiers, shared by checks (which reference fixes) and fix implementations, so the two
 * never import each other. Adding a fix = add an id here + a file under fixes/.
 */
export const FIX = {
  remuxMp4: 'remux-mp4',
  faststart: 'faststart',
  stripMetadata: 'strip-metadata',
  transcodeH264Aac: 'transcode-h264-aac',
  applyRotation: 'apply-rotation',
  audioToAac: 'audio-to-aac',
  stripMetadataLossless: 'strip-metadata-lossless',
  applyOrientation: 'apply-orientation',
  resize: 'resize',
  convert: 'convert',
} as const;

export type FixId = (typeof FIX)[keyof typeof FIX];

export const CHECK = {
  extMismatch: 'ext-mismatch',
  metadataGps: 'metadata-gps',
  metadataDevice: 'metadata-device',
  fileSizeLarge: 'file-size-large',
  videoCodecUnsupported: 'video-codec-unsupported',
  containerNotMp4: 'container-not-mp4',
  mp4NotFaststart: 'mp4-not-faststart',
  pixfmtNotYuv420p: 'pixfmt-not-yuv420p',
  oddDimensions: 'odd-dimensions',
  rotationMetadata: 'rotation-metadata',
  fpsVfr: 'fps-vfr',
  audioCodecUnsupported: 'audio-codec-unsupported',
  audioMissing: 'audio-missing',
  imageOrientationTag: 'image-orientation-tag',
  imageHugeDimensions: 'image-huge-dimensions',
  png16bit: 'png-16bit',
} as const;

export type CheckId = (typeof CHECK)[keyof typeof CHECK];
