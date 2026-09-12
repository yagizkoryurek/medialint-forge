/**
 * A Profile is a declarative compatibility target. Checks consult the active profile to decide
 * whether something is a problem and how severe it is. Profiles are data, so adding a new target
 * (a chat app, a CMS, a device) should never require touching check logic.
 */
export interface Profile {
  id: string;
  name: string;
  /** Short human description used in "why it matters for <name>". */
  description: string;
  /** Sniffed container formats the target plays natively. */
  containers: ReadonlyArray<string>;
  /** ffprobe codec_name values accepted for video. */
  videoCodecs: ReadonlyArray<string>;
  /** Accepted audio codecs, keyed by container (`'*'` = any container). */
  audioCodecs: Readonly<Record<string, ReadonlyArray<string>>>;
  /** Accepted pixel formats. */
  pixFmts: ReadonlyArray<string>;
  /** Image formats accepted. */
  imageFormats: ReadonlyArray<string>;
  /** Informational size thresholds (bytes). */
  maxVideoBytes: number;
  maxImageBytes: number;
  /** Image dimension limits. */
  maxImageSide: number;
  maxImagePixels: number;
  /** Whether the target requires an audio track (some social platforms do). */
  requiresAudio: boolean;
}
