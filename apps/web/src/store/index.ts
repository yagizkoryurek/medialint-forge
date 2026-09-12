import type {
  EngineCaps,
  Finding,
  FixPlan,
  MediaKind,
  MediaReport,
  SniffResult,
  Verification,
} from '@medialint/core';
import { create } from 'zustand';

export type Stage = 'drop' | 'report' | 'fix' | 'verify';

export interface FileEntry {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  /** blob: URL for the preview element; revoked when replaced. */
  previewUrl: string;
}

export type AnalysisStatus = 'idle' | 'sniffing' | 'probing' | 'ready' | 'error';

export interface AnalysisState {
  status: AnalysisStatus;
  sniff?: SniffResult;
  kind?: MediaKind | 'unknown';
  report?: MediaReport;
  findings?: Finding[];
  error?: string;
}

export type JobStatus = 'idle' | 'running' | 'verifying' | 'done' | 'failed' | 'cancelled';

export interface JobOutput {
  blob: Blob;
  name: string;
  url: string;
  kind: MediaKind;
}

export interface JobError {
  message: string;
  hint: string;
  commands: string[];
  stderrTail: string;
}

export interface JobState {
  status: JobStatus;
  fixId?: string;
  params?: Record<string, unknown>;
  plan?: FixPlan;
  /** 0..1 or null when unknown (image ops, stream copy without duration). */
  progress: number | null;
  startedAt?: number;
  etaSec: number | null;
  output?: JobOutput;
  verification?: Verification;
  error?: JobError;
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface EngineState {
  status: EngineStatus;
  message: string;
  caps?: EngineCaps;
}

export interface UiState {
  stage: Stage;
  selectedFixId?: string;
  showCommandLog: boolean;
  /** Persisted in localStorage. */
  theme: 'system' | 'light' | 'dark';
}

export interface AppState {
  file: FileEntry | null;
  /** Analysis of the current input (before) and of the last job's output (after). */
  before: AnalysisState;
  after: AnalysisState;
  job: JobState;
  engine: EngineState;
  ui: UiState;
  commandLog: string[];
}

const THEME_KEY = 'medialint.theme';
const LOG_CAP = 500;

function readTheme(): UiState['theme'] {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export const idleAnalysis: AnalysisState = { status: 'idle' };
export const idleJob: JobState = { status: 'idle', progress: null, etaSec: null };

export const useStore = create<AppState>(() => ({
  file: null,
  before: idleAnalysis,
  after: idleAnalysis,
  job: idleJob,
  engine: { status: 'idle', message: 'ffmpeg not loaded' },
  ui: { stage: 'drop', showCommandLog: false, theme: readTheme() },
  commandLog: [],
}));

// ── Small, focused mutators used by services and components ────────────────────────────────

export function setStage(stage: Stage) {
  useStore.setState((s) => ({ ui: { ...s.ui, stage } }));
}

export function selectFix(fixId: string | undefined) {
  useStore.setState((s) => {
    const ui = { ...s.ui };
    if (fixId === undefined) delete ui.selectedFixId;
    else ui.selectedFixId = fixId;
    return { ui };
  });
}

export function toggleCommandLog(show?: boolean) {
  useStore.setState((s) => ({ ui: { ...s.ui, showCommandLog: show ?? !s.ui.showCommandLog } }));
}

export function setTheme(theme: UiState['theme']) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
  useStore.setState((s) => ({ ui: { ...s.ui, theme } }));
}

export function appendLog(line: string) {
  if (!line) return;
  useStore.setState((s) => {
    const next =
      s.commandLog.length >= LOG_CAP ? s.commandLog.slice(-(LOG_CAP - 1)) : s.commandLog.slice();
    next.push(line);
    return { commandLog: next };
  });
}

export function clearLog() {
  useStore.setState({ commandLog: [] });
}

export function patchJob(patch: Partial<JobState>) {
  useStore.setState((s) => ({ job: { ...s.job, ...patch } }));
}

export function patchEngine(patch: Partial<EngineState>) {
  useStore.setState((s) => ({ engine: { ...s.engine, ...patch } }));
}

export function setAnalysis(which: 'before' | 'after', state: AnalysisState) {
  useStore.setState({ [which]: state } as Pick<AppState, 'before' | 'after'>);
}

function revoke(url: string | undefined) {
  if (url) URL.revokeObjectURL(url);
}

/** Replaces the current input file and resets everything that depended on the old one. */
export function setCurrentFile(file: File | null) {
  useStore.setState((s) => {
    revoke(s.file?.previewUrl);
    revoke(s.job.output?.url);
    const ui: UiState = { ...s.ui, stage: file ? 'report' : 'drop' };
    delete ui.selectedFixId;
    return {
      file: file
        ? {
            id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            file,
            name: file.name,
            sizeBytes: file.size,
            previewUrl: URL.createObjectURL(file),
          }
        : null,
      before: idleAnalysis,
      after: idleAnalysis,
      job: idleJob,
      ui,
    };
  });
}

export function resetJob() {
  useStore.setState((s) => {
    revoke(s.job.output?.url);
    return { job: idleJob, after: idleAnalysis };
  });
}

// ── Selectors ────────────────────────────────────────────────────────────────────────────────

export const selectSeverityCounts = (s: AppState) => {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of s.before.findings ?? []) counts[f.severity]++;
  return counts;
};
