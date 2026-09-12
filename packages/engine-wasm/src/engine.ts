import {
  type EngineCaps,
  EngineError,
  type EngineInput,
  type FixPlan,
  formatCommand,
  INPUT_DIR,
  type MediaEngine,
  type RawProbe,
  type RunProgress,
  type RunResult,
  sniff,
} from '@medialint/core';
import { type CoreUrls, FfmpegSession } from './ffmpegSession';
import { detectImageEncoders, type ImageFormat, render, stripMetadata } from './image/ops';
import { probeImage } from './image/probe';

export interface WasmEngineOptions {
  /** Base URL where `core-mt/` and `core/` were copied (see scripts/copy-cores.mjs). */
  coreBaseUrl: string;
  /** Force the single-threaded core even when the page is cross-origin isolated. */
  forceSingleThread?: boolean;
}

const MB = 1024 * 1024;
const MAX_INPUT_MT = 1024 * MB;
const MAX_INPUT_ST = 500 * MB;
/** Above this we never fall back to copying the input into the wasm heap. */
const MAX_COPY_FALLBACK = 200 * MB;

const PROBE_ARGS = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];

function isBlob(h: unknown): h is Blob {
  return typeof Blob !== 'undefined' && h instanceof Blob;
}

function isProbeJson(j: unknown): j is Record<string, unknown> {
  return typeof j === 'object' && j !== null && ('format' in j || 'streams' in j);
}

export function canUseThreads(): boolean {
  return (
    typeof crossOriginIsolated !== 'undefined' &&
    crossOriginIsolated === true &&
    typeof SharedArrayBuffer !== 'undefined'
  );
}

/** Browser MediaEngine backed by self-hosted ffmpeg.wasm plus canvas/byte-level image ops. */
export class WasmEngine implements MediaEngine {
  private readonly urls: CoreUrls;
  private readonly multithreaded: boolean;
  private probeSession: FfmpegSession | null = null;
  private jobSession: FfmpegSession | null = null;
  private cancelled = false;
  private imageEncoders: ImageFormat[] = ['jpeg', 'png'];
  private loading: Promise<void> | null = null;

  constructor(opts: WasmEngineOptions) {
    this.multithreaded = canUseThreads() && !opts.forceSingleThread;
    const base = opts.coreBaseUrl.replace(/\/$/, '');
    const dir = this.multithreaded ? 'core-mt' : 'core';
    const abs = (p: string) =>
      new URL(`${base}/${dir}/${p}`, globalThis.location?.href ?? 'http://localhost/').href;
    this.urls = {
      coreURL: abs('ffmpeg-core.js'),
      wasmURL: abs('ffmpeg-core.wasm'),
      ...(this.multithreaded ? { workerURL: abs('ffmpeg-core.worker.js') } : {}),
    };
  }

  caps(): EngineCaps {
    return {
      multithreaded: this.multithreaded,
      coreVariant: this.multithreaded ? '@ffmpeg/core-mt' : '@ffmpeg/core',
      maxInputBytes: this.multithreaded ? MAX_INPUT_MT : MAX_INPUT_ST,
      imageEncoders: this.imageEncoders,
    };
  }

  async load(onProgress?: (msg: string) => void): Promise<void> {
    if (!this.loading) {
      this.loading = (async () => {
        onProgress?.(
          `Loading ffmpeg (${this.multithreaded ? 'multithreaded' : 'single-thread'} core)…`,
        );
        const s = new FfmpegSession(this.urls);
        await s.load();
        this.probeSession = s;
        this.imageEncoders = await detectImageEncoders();
        onProgress?.('ffmpeg ready');
      })().catch((err) => {
        this.loading = null;
        throw err;
      });
    }
    return this.loading;
  }

  private async ensureProbeSession(): Promise<FfmpegSession> {
    await this.load();
    if (!this.probeSession) throw new EngineError('ffmpeg failed to load');
    return this.probeSession;
  }

  async probe(input: EngineInput, onLog?: (line: string) => void): Promise<RawProbe> {
    if (!isBlob(input.handle)) throw new EngineError('WasmEngine expects a Blob/File input');
    const head = new Uint8Array(await input.handle.slice(0, 64 * 1024).arrayBuffer());
    const s = sniff(input.name, head);
    if (s.format === 'jpeg' || s.format === 'png' || s.format === 'webp') {
      onLog?.(`probe(image): ${input.name}`);
      return probeImage(input.handle);
    }

    const session = await this.ensureProbeSession();
    const argv = [...PROBE_ARGS, `${INPUT_DIR}/${input.name}`];
    const cmd = formatCommand(argv, 'ffprobe');
    onLog?.(cmd);
    const strategy = await session.attachInput(input.name, input.handle, MAX_COPY_FALLBACK);
    if (strategy === 'copy') onLog?.('(input copied into memory — WORKERFS mount unavailable)');
    try {
      // The 0.12 cores never set the exit code for ffprobe (it is always -1), so judge the run
      // by its output: a readable file yields "format"/"streams"; a failure yields `{ }`.
      const r = await session.ffprobe(argv, onLog ? { onLog } : {});
      let json: unknown;
      try {
        json = JSON.parse(r.stdout);
      } catch {
        json = undefined;
      }
      if (!isProbeJson(json)) {
        throw new EngineError(
          'ffprobe produced no JSON (unsupported or corrupt file?)',
          [cmd],
          r.stderrTail,
        );
      }
      return { kind: 'ffprobe', json };
    } catch (err) {
      if (err instanceof EngineError) throw err;
      // The probe instance is dead after a wasm trap; drop it so the next probe reloads.
      session.terminate();
      this.probeSession = null;
      this.loading = null;
      throw new EngineError(`ffprobe failed: ${String(err)}`, [cmd]);
    } finally {
      await session.detachInput().catch(() => undefined);
    }
  }

  async run(
    plan: FixPlan,
    input: EngineInput,
    onProgress?: (p: RunProgress) => void,
  ): Promise<RunResult> {
    if (!isBlob(input.handle)) throw new EngineError('WasmEngine expects a Blob/File input');
    if (input.sizeBytes > this.caps().maxInputBytes) {
      throw new EngineError(
        `This file is ${Math.round(input.sizeBytes / MB)} MB; this browser build can handle up to ${Math.round(this.caps().maxInputBytes / MB)} MB.`,
      );
    }
    this.cancelled = false;
    const commands: string[] = [];
    let current: Blob = input.handle;
    let currentName = input.name;

    for (const step of plan.steps) {
      if (this.cancelled) throw new EngineError('Cancelled');
      if (step.kind === 'image') {
        const params = step.params as {
          format?: ImageFormat;
          orientation?: number;
          maxSide?: number;
        };
        const format = params.format ?? 'jpeg';
        const label = `image:${step.op}(${JSON.stringify(step.params)})`;
        commands.push(label);
        onProgress?.({ ratio: null, logLine: label });
        const r =
          step.op === 'stripMeta'
            ? await stripMetadata(current)
            : await render(current, {
                orientation: params.orientation ?? 1,
                format,
                ...(step.op === 'resize' && params.maxSide ? { maxSide: params.maxSide } : {}),
              });
        for (const line of r.log) onProgress?.({ ratio: null, logLine: line });
        current = r.blob;
        currentName = plan.outputName;
        continue;
      }

      // ffmpeg step: fresh session per job.
      const cmd = formatCommand(step.argv);
      commands.push(cmd);
      onProgress?.({ ratio: 0, logLine: cmd });
      const session = new FfmpegSession(this.urls);
      this.jobSession = session;
      try {
        await session.load();
        if (this.cancelled) throw new EngineError('Cancelled');
        const strategy = await session.attachInput(currentName, current, MAX_COPY_FALLBACK);
        if (strategy === 'copy')
          onProgress?.({
            ratio: 0,
            logLine: '(input copied into memory — WORKERFS mount unavailable)',
          });
        const r = await session.exec(step.argv, {
          onLog: (line) => onProgress?.({ ratio: null, logLine: line }),
          onProgress: (ratio, sec) => onProgress?.({ ratio, processedSec: sec }),
        });
        if (r.code !== 0)
          throw new EngineError(`ffmpeg exited with code ${r.code}`, commands, r.stderrTail);
        const outName = step.argv[step.argv.length - 1]?.replace(/^\/out\//, '') ?? plan.outputName;
        const bytes = await session.readOutput(outName);
        if (bytes.byteLength === 0)
          throw new EngineError('ffmpeg produced an empty file', commands, r.stderrTail);
        current = new Blob([bytes as BlobPart], { type: mimeFor(outName) });
        currentName = outName;
      } catch (err) {
        if (this.cancelled) throw new EngineError('Cancelled', commands);
        if (err instanceof EngineError) throw err;
        throw new EngineError(String(err), commands);
      } finally {
        session.terminate();
        if (this.jobSession === session) this.jobSession = null;
      }
    }

    onProgress?.({ ratio: 1 });
    return { outputName: plan.outputName, handle: current, sizeBytes: current.size, commands };
  }

  cancel(): void {
    this.cancelled = true;
    this.jobSession?.terminate();
    this.jobSession = null;
  }
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      mov: 'video/quicktime',
      mkv: 'video/x-matroska',
      webm: 'video/webm',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    }[ext] ?? 'application/octet-stream'
  );
}

export function createWasmEngine(opts: WasmEngineOptions): MediaEngine {
  return new WasmEngine(opts);
}
