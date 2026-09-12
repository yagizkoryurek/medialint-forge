import type { EngineInput, MediaEngine } from '@medialint/core';
import { canUseThreads, createWasmEngine } from '@medialint/engine-wasm';
import { appendLog, patchEngine, useStore } from '../store';

let engine: MediaEngine | null = null;

export function getEngine(): MediaEngine {
  if (!engine) {
    engine = createWasmEngine({ coreBaseUrl: `${import.meta.env.BASE_URL}ffmpeg` });
    patchEngine({
      caps: engine.caps(),
      message: canUseThreads()
        ? 'ffmpeg not loaded yet'
        : 'ffmpeg not loaded yet — this host cannot enable multithreading (slow mode)',
    });
  }
  return engine;
}

/** Loads the wasm core once; safe to call repeatedly and concurrently. */
export async function ensureEngineLoaded(): Promise<MediaEngine> {
  const e = getEngine();
  const { status } = useStore.getState().engine;
  if (status === 'ready') return e;
  patchEngine({
    status: 'loading',
    message: 'Loading ffmpeg (about 32 MB, cached by the browser)…',
  });
  try {
    await e.load((msg) => {
      patchEngine({ message: msg });
      appendLog(`[engine] ${msg}`);
    });
    const caps = e.caps();
    patchEngine({
      status: 'ready',
      caps,
      message: caps.multithreaded
        ? 'ffmpeg ready (multithreaded)'
        : 'ffmpeg ready — slow mode (single thread)',
    });
    appendLog(
      `[engine] core=${caps.coreVariant} threads=${caps.multithreaded} imageEncoders=${caps.imageEncoders.join(',')}`,
    );
    return e;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    patchEngine({ status: 'error', message: `ffmpeg failed to load: ${message}` });
    appendLog(`[engine] load failed: ${message}`);
    throw err;
  }
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters must not reach ffmpeg's virtual FS paths
const UNSAFE_NAME_CHARS = /[/\\:*?"<>|\x00-\x1f]/g;

/** File names become paths inside ffmpeg's virtual FS; keep them boring. */
export function safeName(name: string): string {
  const cleaned = name.replace(UNSAFE_NAME_CHARS, '_').replace(/\s+/g, ' ').trim();
  return cleaned || 'file';
}

export function toEngineInput(file: File): EngineInput {
  const name = safeName(file.name);
  const handle = name === file.name ? file : new File([file], name, { type: file.type });
  return { name, sizeBytes: file.size, handle };
}
