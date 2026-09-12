import type { FixPlan } from './fix';

/**
 * MediaEngine is the single seam between pure analysis logic and anything that actually touches
 * bytes: ffmpeg.wasm + canvas in the browser today, system ffmpeg in a future CLI.
 *
 * The engine is deliberately dumb: it does not know what a check or a fix is. It probes files
 * and executes plans.
 */

/** Minimal description of an input the engine can read. Browser passes a File; Node would pass a path. */
export interface EngineInput {
  name: string;
  sizeBytes: number;
  /** Opaque handle understood by the concrete engine (File | Blob in browsers, string path in Node). */
  handle: unknown;
}

/** Raw result of probing a video container with ffprobe (`-print_format json`). */
export interface FfprobeRaw {
  kind: 'ffprobe';
  json: unknown;
}

/** Raw result of probing an image in JS (exifr + bitmap). */
export interface ImageProbeRaw {
  kind: 'image';
  format: 'jpeg' | 'png' | 'webp';
  width: number;
  height: number;
  bitDepth: number | null;
  hasAlpha: boolean | null;
  animated: boolean | null;
  orientation: number | null;
  gps: { lat: number; lon: number } | null;
  make: string | null;
  model: string | null;
  software: string | null;
  creationTime: string | null;
  tags: Record<string, string>;
}

export type RawProbe = FfprobeRaw | ImageProbeRaw;

export interface EngineCaps {
  /** True when the multithreaded core is active (cross-origin isolated). */
  multithreaded: boolean;
  /** Human-readable core identifier, e.g. `@ffmpeg/core-mt@0.12.10`. */
  coreVariant: string;
  /** Inputs above this are refused up-front with an explanation. */
  maxInputBytes: number;
  /** Image encoders the environment can produce (canvas support varies by browser). */
  imageEncoders: ReadonlyArray<'jpeg' | 'png' | 'webp'>;
}

export interface RunProgress {
  /** 0..1 when known, otherwise null (e.g. image ops or stream-copy with unknown duration). */
  ratio: number | null;
  /** Seconds of media processed so far, when ffmpeg reports it. */
  processedSec?: number;
  /** Log line (ffmpeg stderr) for the command log. */
  logLine?: string;
}

export interface RunResult {
  outputName: string;
  /** Output bytes as an opaque handle (Blob in browsers, path in Node). */
  handle: unknown;
  sizeBytes: number;
  /** Every command executed, for the command log and bug reports. */
  commands: string[];
}

export class EngineError extends Error {
  readonly commands: string[];
  readonly stderrTail: string;
  constructor(message: string, commands: string[] = [], stderrTail = '') {
    super(message);
    this.name = 'EngineError';
    this.commands = commands;
    this.stderrTail = stderrTail;
  }
}

export interface MediaEngine {
  caps(): EngineCaps;
  /** Load heavy resources (wasm cores). Idempotent. */
  load(onProgress?: (msg: string) => void): Promise<void>;
  probe(input: EngineInput, onLog?: (line: string) => void): Promise<RawProbe>;
  run(plan: FixPlan, input: EngineInput, onProgress?: (p: RunProgress) => void): Promise<RunResult>;
  /** Abort the running job, if any. Safe to call when idle. */
  cancel(): void;
}
