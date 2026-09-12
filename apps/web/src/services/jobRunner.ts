import { EngineError, planFix, verify } from '@medialint/core';
import {
  appendLog,
  patchJob,
  resetJob,
  setAnalysis,
  setCurrentFile,
  setStage,
  useStore,
} from '../store';
import { runAnalysis } from './analyze';
import { ensureEngineLoaded, getEngine, toEngineInput } from './engine';

let wakeLock: WakeLockSentinel | null = null;

async function holdWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    /* not granted; fine */
  }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

function guardUnload(e: BeforeUnloadEvent) {
  e.preventDefault();
}

/** Plain-language hint derived from the failure; the raw stderr stays in the details. */
export function hintFor(message: string, stderrTail: string): string {
  const text = `${message}\n${stderrTail}`.toLowerCase();
  if (text.includes('cancelled')) return 'The job was cancelled. Nothing was written.';
  if (
    text.includes('memory access out of bounds') ||
    text.includes('out of memory') ||
    text.includes('allocation failed')
  ) {
    return 'The in-browser encoder ran out of memory. Try a shorter or smaller file, choose "Smaller file" quality, or run the command below with a native ffmpeg.';
  }
  if (text.includes('could not write header') || text.includes('incorrect codec parameters')) {
    return 'The streams could not be placed in the target container without re-encoding. Try "Convert to H.264 MP4" instead.';
  }
  if (text.includes('cannot encode') && text.includes('webp'))
    return 'This browser cannot save WebP. Choose JPEG or PNG.';
  if (text.includes('this file is') && text.includes('mb')) return message;
  if (text.includes('invalid data found'))
    return 'ffmpeg could not read the file — it may be truncated or corrupt.';
  return 'The fix failed. The exact command and ffmpeg output are in the details; you can copy the command and run it with a native ffmpeg.';
}

export async function runFix(fixId: string, params: Record<string, unknown>): Promise<void> {
  const state = useStore.getState();
  const entry = state.file;
  const before = state.before;
  if (!entry || before.status !== 'ready' || !before.report || !before.findings) return;
  if (state.job.status === 'running' || state.job.status === 'verifying') return;

  const plan = planFix(fixId, before.report, params);
  resetJob();
  patchJob({
    status: 'running',
    fixId,
    params,
    plan,
    progress: 0,
    etaSec: null,
    startedAt: Date.now(),
  });
  setStage('fix');
  appendLog(`[job] ${fixId} → ${plan.outputName}`);
  window.addEventListener('beforeunload', guardUnload);
  await holdWakeLock();

  let lastLogAt = 0;
  try {
    const needsFfmpeg = plan.steps.some((s) => s.kind === 'ffmpeg');
    const engine = needsFfmpeg ? await ensureEngineLoaded() : getEngine();
    const result = await engine.run(plan, toEngineInput(entry.file), (p) => {
      if (p.logLine) appendLog(p.logLine);
      if (p.ratio !== null && p.ratio !== undefined) {
        const now = Date.now();
        const { startedAt } = useStore.getState().job;
        const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
        const eta =
          p.ratio > 0.03 && elapsed > 1 ? Math.max(0, (elapsed * (1 - p.ratio)) / p.ratio) : null;
        if (now - lastLogAt > 150 || p.ratio >= 1) {
          lastLogAt = now;
          patchJob({ progress: p.ratio, etaSec: eta });
        }
      }
    });
    if (useStore.getState().job.status === 'cancelled') return;

    const blob = result.handle as Blob;
    const outFile = new File([blob], result.outputName, { type: blob.type });
    patchJob({ status: 'verifying', progress: 1, etaSec: 0 });
    appendLog(`[job] output ${result.outputName} (${result.sizeBytes} bytes); re-analyzing…`);

    const after = await runAnalysis('after', outFile);
    if (useStore.getState().job.status === 'cancelled') return;
    if (!after) throw new EngineError('The output could not be analyzed', result.commands);

    const verification = verify({ report: before.report, findings: before.findings }, after, plan);
    appendLog(
      `[verify] ${verification.ok ? 'OK' : 'NOT OK'} — resolved ${verification.resolved.length}, remaining ${verification.remaining.length}, introduced ${verification.introduced.length}, sanity ${verification.sanity.filter((s) => s.ok).length}/${verification.sanity.length}`,
    );
    patchJob({
      status: 'done',
      output: {
        blob,
        name: result.outputName,
        url: URL.createObjectURL(blob),
        kind: plan.outputKind,
      },
      verification,
    });
    setStage('verify');
  } catch (err) {
    if (useStore.getState().job.status === 'cancelled') return;
    const e =
      err instanceof EngineError
        ? err
        : new EngineError(err instanceof Error ? err.message : String(err));
    appendLog(`[job] failed: ${e.message}`);
    patchJob({
      status: 'failed',
      error: {
        message: e.message,
        hint: hintFor(e.message, e.stderrTail),
        commands: e.commands,
        stderrTail: e.stderrTail,
      },
    });
  } finally {
    window.removeEventListener('beforeunload', guardUnload);
    releaseWakeLock();
  }
}

export function cancelJob(): void {
  const { job } = useStore.getState();
  if (job.status !== 'running' && job.status !== 'verifying') return;
  patchJob({ status: 'cancelled', etaSec: null });
  getEngine().cancel();
  appendLog('[job] cancelled');
}

/** "Use result as input": the verified output becomes the new file to analyze/fix. */
export async function adoptOutput(): Promise<void> {
  const { job, after } = useStore.getState();
  if (job.status !== 'done' || !job.output) return;
  const file = new File([job.output.blob], job.output.name, { type: job.output.blob.type });
  const analysis = after;
  setCurrentFile(file);
  const entry = useStore.getState().file;
  if (!entry) return;
  // We already analyzed this exact output — reuse it instead of probing again.
  if (analysis.status === 'ready') setAnalysis('before', analysis);
  else await runAnalysis('before', entry.file, entry.id);
}
