import { FFFSType, FFmpeg } from '@ffmpeg/ffmpeg';
import { INPUT_DIR, OUTPUT_DIR } from '@medialint/core';

export interface CoreUrls {
  coreURL: string;
  wasmURL: string;
  /** Only for the multithreaded core. */
  workerURL?: string;
}

export interface ExecResult {
  code: number;
  /** Last ~200 stderr lines, for error messages. */
  stderrTail: string;
  stdout: string;
}

export interface ExecHooks {
  onLog?: (line: string) => void;
  onProgress?: (ratio: number, timeSec: number) => void;
}

const isFile = (h: unknown): h is File => typeof File !== 'undefined' && h instanceof File;

/**
 * One ffmpeg.wasm instance. The engine creates a fresh session per job (so a wasm trap or a
 * cancel can never poison the next job) and keeps one long-lived session for cheap probes.
 */
export class FfmpegSession {
  private readonly ff = new FFmpeg();
  private loaded = false;
  private mounted = false;
  private inputCopied: string | null = null;
  private logLines: string[] = [];
  private stdoutLines: string[] = [];
  private hooks: ExecHooks = {};

  constructor(private readonly urls: CoreUrls) {
    this.ff.on('log', ({ type, message }) => {
      if (type === 'stdout') {
        this.stdoutLines.push(message);
        return;
      }
      this.logLines.push(message);
      if (this.logLines.length > 400) this.logLines.splice(0, this.logLines.length - 200);
      this.hooks.onLog?.(message);
    });
    this.ff.on('progress', ({ progress, time }) => {
      // `time` is reported in microseconds by the 0.12 core.
      const ratio = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      this.hooks.onProgress?.(ratio, time > 0 ? time / 1_000_000 : 0);
    });
  }

  async load(): Promise<void> {
    if (this.loaded) return;
    await this.ff.load({
      coreURL: this.urls.coreURL,
      wasmURL: this.urls.wasmURL,
      ...(this.urls.workerURL ? { workerURL: this.urls.workerURL } : {}),
    });
    this.loaded = true;
    await this.ff.createDir(INPUT_DIR).catch(() => undefined);
    await this.ff.createDir(OUTPUT_DIR).catch(() => undefined);
  }

  /**
   * Makes `handle` visible at /input/<name>. Prefers a WORKERFS mount (no copy into the wasm
   * heap); falls back to a full copy for non-File blobs or when mounting is unavailable.
   * Returns the strategy used, for the command log.
   */
  async attachInput(name: string, handle: Blob, maxCopyBytes: number): Promise<'mount' | 'copy'> {
    await this.detachInput();
    const file =
      isFile(handle) && handle.name === name
        ? handle
        : new File([handle], name, { type: handle.type });
    try {
      await this.ff.mount(FFFSType.WORKERFS, { files: [file] }, INPUT_DIR);
      this.mounted = true;
      return 'mount';
    } catch (err) {
      if (file.size > maxCopyBytes) {
        throw new Error(
          `Could not mount the file (${String(err)}) and it is too large (${file.size} bytes) to copy into memory.`,
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await this.ff.writeFile(`${INPUT_DIR}/${name}`, bytes);
      this.inputCopied = name;
      return 'copy';
    }
  }

  async detachInput(): Promise<void> {
    if (this.mounted) {
      await this.ff.unmount(INPUT_DIR).catch(() => undefined);
      this.mounted = false;
    }
    if (this.inputCopied) {
      await this.ff.deleteFile(`${INPUT_DIR}/${this.inputCopied}`).catch(() => undefined);
      this.inputCopied = null;
    }
  }

  private beginCapture(hooks: ExecHooks) {
    this.hooks = hooks;
    this.logLines = [];
    this.stdoutLines = [];
  }

  private endCapture(code: number): ExecResult {
    const result = {
      code,
      stderrTail: this.logLines.slice(-200).join('\n'),
      stdout: this.stdoutLines.join('\n'),
    };
    this.hooks = {};
    return result;
  }

  async exec(argv: string[], hooks: ExecHooks = {}): Promise<ExecResult> {
    this.beginCapture(hooks);
    let code: number;
    try {
      code = await this.ff.exec(argv);
    } catch (err) {
      // A wasm trap ("memory access out of bounds") or a terminate() during exec lands here.
      const r = this.endCapture(-1);
      throw new Error(`${String(err)}${r.stderrTail ? `\n${r.stderrTail}` : ''}`);
    }
    return this.endCapture(code);
  }

  async ffprobe(argv: string[], hooks: ExecHooks = {}): Promise<ExecResult> {
    this.beginCapture(hooks);
    let code: number;
    try {
      code = await this.ff.ffprobe(argv);
    } catch (err) {
      const r = this.endCapture(-1);
      throw new Error(`${String(err)}${r.stderrTail ? `\n${r.stderrTail}` : ''}`);
    }
    return this.endCapture(code);
  }

  async readOutput(name: string): Promise<Uint8Array> {
    const data = await this.ff.readFile(`${OUTPUT_DIR}/${name}`);
    if (typeof data === 'string') throw new Error('unexpected string output');
    await this.ff.deleteFile(`${OUTPUT_DIR}/${name}`).catch(() => undefined);
    return data;
  }

  terminate(): void {
    this.hooks = {};
    this.mounted = false;
    this.inputCopied = null;
    this.loaded = false;
    try {
      this.ff.terminate();
    } catch {
      /* already gone */
    }
  }
}
