import type { Finding } from './finding';
import type { MediaKind, MediaReport } from './report';

/**
 * Virtual paths used inside FixPlans. Engines map them to real locations
 * (ffmpeg.wasm virtual FS in the browser, temp dirs for a native engine).
 */
export const INPUT_DIR = '/input';
export const OUTPUT_DIR = '/out';

export type ImageOpName = 'stripMeta' | 'orient' | 'resize' | 'convert';

export type EngineOp =
  | {
      kind: 'ffmpeg';
      /** Full argv *without* the leading `ffmpeg`. Paths are `/input/<name>` and `/out/<name>`. */
      argv: string[];
    }
  | {
      kind: 'image';
      op: ImageOpName;
      params: Record<string, unknown>;
    };

export interface Expectation {
  /** Check ids this fix is expected to resolve; verification reports them as resolved/remaining. */
  resolves: string[];
  /** Expected output duration relative to input (seconds). `0` = unchanged. Omit when not applicable. */
  durationDeltaSec?: number;
  /** Expected output dimensions, when the fix changes or intentionally preserves them. */
  dims?: { width: number; height: number };
  /** Expected stream counts (video only). */
  streams?: { video: number; audio: number };
}

export interface FixPlan {
  fixId: string;
  /** Output file name (no directory). */
  outputName: string;
  outputKind: MediaKind;
  steps: EngineOp[];
  expected: Expectation;
  /** Whether the visual/audio data is re-encoded (quality loss, slow) or copied (lossless, fast). */
  reencodes: boolean;
}

export interface Fix<P extends Record<string, unknown> = Record<string, never>> {
  id: string;
  kinds: ReadonlyArray<MediaKind>;
  title: string;
  /** One sentence describing what will happen for this report and these params. */
  describe(report: MediaReport, params: P): string;
  defaults(report: MediaReport): P;
  /** Can this fix be offered for this file (independent of any particular finding)? */
  applicable(report: MediaReport, finding?: Finding): boolean;
  /** Pure: build the plan. Must not touch the DOM, timers, or any engine. */
  plan(report: MediaReport, params: P): FixPlan;
  /** Static hint used for ranking and the "re-encodes" badge before a plan exists. */
  reencodes: boolean;
  /** Optional UI param schema (kept deliberately tiny for v0.1). */
  params?: ReadonlyArray<FixParamSpec>;
}

export interface FixParamSpec {
  key: string;
  label: string;
  type: 'select';
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** Helper so fix files stay declarative and typed without an abstract class. */
export function defineFix<P extends Record<string, unknown>>(fix: Fix<P>): Fix<P> {
  return fix;
}
