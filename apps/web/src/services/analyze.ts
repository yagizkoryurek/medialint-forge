import {
  type Finding,
  fromFfprobe,
  fromImageProbe,
  type MediaReport,
  runChecks,
  sniff,
  webBrowsers,
} from '@medialint/core';
import { type AnalysisState, appendLog, setAnalysis, setCurrentFile, useStore } from '../store';
import { ensureEngineLoaded, getEngine, toEngineInput } from './engine';

const IMAGE_FORMATS = new Set(['jpeg', 'png', 'webp']);
const VIDEO_FORMATS = new Set(['mp4', 'mov', 'mkv', 'webm']);

export interface AnalysisResult {
  report: MediaReport;
  findings: Finding[];
}

/**
 * Sniff → probe → normalize → checks. `onState` receives intermediate states so the UI can show
 * the sniff result while the 32 MB core is still loading.
 */
export async function analyze(
  file: File,
  onState: (s: AnalysisState) => void,
): Promise<AnalysisResult> {
  const input = toEngineInput(file);
  const head = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
  const sniffed = sniff(input.name, head);
  const kind = IMAGE_FORMATS.has(sniffed.format)
    ? 'image'
    : VIDEO_FORMATS.has(sniffed.format)
      ? 'video'
      : 'unknown';
  appendLog(
    `[sniff] ${input.name}: ${sniffed.format}${sniffed.brand ? ` (brand ${sniffed.brand})` : ''}${sniffed.fastStart !== undefined ? ` faststart=${sniffed.fastStart}` : ''}`,
  );
  onState({ status: 'sniffing', sniff: sniffed, kind });

  if (kind === 'unknown') {
    throw new Error(
      `This doesn't look like a supported file. MediaLint Forge handles MP4, MOV, WebM, MKV video and JPEG, PNG, WebP images.`,
    );
  }

  onState({ status: 'probing', sniff: sniffed, kind });
  const engine = kind === 'video' ? await ensureEngineLoaded() : getEngine();
  const raw = await engine.probe(input, (line) => appendLog(line));

  const report =
    raw.kind === 'ffprobe'
      ? fromFfprobe({
          fileName: input.name,
          sizeBytes: input.sizeBytes,
          sniff: sniffed,
          json: raw.json,
        })
      : fromImageProbe({
          fileName: input.name,
          sizeBytes: input.sizeBytes,
          sniff: sniffed,
          probe: raw,
        });
  const findings = runChecks(report, webBrowsers);
  appendLog(
    `[checks] ${findings.length} finding(s): ${findings.map((f) => f.id).join(', ') || 'none'}`,
  );
  return { report, findings };
}

/** Entry point from the drop zone: sets the file and runs the "before" analysis. */
export async function analyzeNewFile(file: File): Promise<void> {
  setCurrentFile(file);
  const { file: entry } = useStore.getState();
  if (!entry) return;
  await runAnalysis('before', entry.file, entry.id);
}

export async function runAnalysis(
  which: 'before' | 'after',
  file: File,
  fileId?: string,
): Promise<AnalysisResult | null> {
  const stillCurrent = () => !fileId || useStore.getState().file?.id === fileId;
  try {
    const result = await analyze(file, (s) => {
      if (stillCurrent()) setAnalysis(which, s);
    });
    if (!stillCurrent()) return null;
    setAnalysis(which, {
      status: 'ready',
      sniff: result.report.sniff,
      kind: result.report.kind,
      ...result,
    });
    return result;
  } catch (err) {
    if (!stillCurrent()) return null;
    const message = err instanceof Error ? err.message : String(err);
    appendLog(`[analyze] failed: ${message}`);
    setAnalysis(which, { status: 'error', error: message });
    return null;
  }
}
