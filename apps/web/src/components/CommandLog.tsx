import { useEffect, useRef } from 'react';
import { clearLog, toggleCommandLog, useStore } from '../store';
import ui from '../styles/ui.module.css';
import styles from './CommandLog.module.css';

export function CommandLog() {
  const open = useStore((s) => s.ui.showCommandLog);
  const lines = useStore((s) => s.commandLog);
  const preRef = useRef<HTMLPreElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-scroll to the bottom whenever new lines arrive
  useEffect(() => {
    if (open && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
  }, [open, lines]);

  if (!open) return null;
  return (
    <aside className={styles.drawer} aria-label="Command log">
      <div className={styles.head}>
        <strong>Command log</strong>
        <span className={`${ui.small} ${ui.muted}`}>
          every ffprobe/ffmpeg command and its output — nothing leaves this tab
        </span>
        <span className={ui.row} style={{ marginLeft: 'auto' }}>
          <button
            type="button"
            className={`${ui.btnGhost} ${ui.btnSmall}`}
            onClick={() => navigator.clipboard?.writeText(lines.join('\n'))}
          >
            Copy
          </button>
          <button type="button" className={`${ui.btnGhost} ${ui.btnSmall}`} onClick={clearLog}>
            Clear
          </button>
          <button
            type="button"
            className={`${ui.btnGhost} ${ui.btnSmall}`}
            onClick={() => toggleCommandLog(false)}
            aria-label="Close command log"
          >
            ✕
          </button>
        </span>
      </div>
      <pre ref={preRef} className={styles.pre}>
        {lines.length ? lines.join('\n') : 'No commands yet.'}
      </pre>
    </aside>
  );
}
