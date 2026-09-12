import { useEffect } from 'react';
import styles from './App.module.css';
import { CommandLog } from './components/CommandLog';
import { EngineStatus } from './components/EngineStatus';
import { DropStage } from './stages/DropStage';
import { FixStage } from './stages/FixStage';
import { ReportStage } from './stages/ReportStage';
import { VerifyStage } from './stages/VerifyStage';
import {
  type Stage,
  setCurrentFile,
  setTheme,
  toggleCommandLog,
  type UiState,
  useStore,
} from './store';
import ui from './styles/ui.module.css';

const STEPS: ReadonlyArray<{ stage: Stage; label: string }> = [
  { stage: 'drop', label: 'Drop' },
  { stage: 'report', label: 'Report' },
  { stage: 'fix', label: 'Fix' },
  { stage: 'verify', label: 'Verify' },
];

const THEMES: ReadonlyArray<{ value: UiState['theme']; label: string }> = [
  { value: 'system', label: 'System theme' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function StageView({ stage }: { stage: Stage }) {
  switch (stage) {
    case 'report':
      return <ReportStage />;
    case 'fix':
      return <FixStage />;
    case 'verify':
      return <VerifyStage />;
    default:
      return <DropStage />;
  }
}

export function App() {
  const stage = useStore((s) => s.ui.stage);
  const theme = useStore((s) => s.ui.theme);
  const showLog = useStore((s) => s.ui.showCommandLog);
  const hasFile = useStore((s) => s.file !== null);

  // tokens.css switches palettes on <html data-theme>; "system" removes the attribute so
  // prefers-color-scheme decides.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => setCurrentFile(null)}
            title="Start over"
          >
            <span className={styles.logo} aria-hidden="true">
              M
            </span>
            MediaLint Forge
          </button>
          <nav className={styles.steps} aria-label="Progress">
            {STEPS.map((s) => (
              <span
                key={s.stage}
                className={s.stage === stage ? styles.stepActive : styles.step}
                aria-current={s.stage === stage ? 'step' : undefined}
              >
                {s.label}
              </span>
            ))}
          </nav>
          <span className={styles.spacer} />
          <EngineStatus />
          <button
            type="button"
            className={`${ui.btnGhost} ${ui.btnSmall}`}
            onClick={() => toggleCommandLog()}
            aria-pressed={showLog}
          >
            Command log
          </button>
          <label className="visually-hidden" htmlFor="theme-select">
            Theme
          </label>
          <select
            id="theme-select"
            className={ui.select}
            value={theme}
            onChange={(e) => setTheme(e.target.value as UiState['theme'])}
          >
            {THEMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className={styles.main}>
        <StageView stage={hasFile ? stage : 'drop'} />
      </main>

      <CommandLog />

      <footer className={styles.footer}>
        <span>Everything runs in this tab — no uploads, no server, no analytics.</span>
        <span>ffmpeg.wasm and canvas do the work; the exact commands are in the command log.</span>
      </footer>
    </div>
  );
}
