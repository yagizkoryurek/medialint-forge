import { DropZone } from '../components/DropZone';
import { analyzeNewFile } from '../services/analyze';
import ui from '../styles/ui.module.css';
import styles from './DropStage.module.css';

export function DropStage() {
  return (
    <div className={ui.stack}>
      <div className={styles.hero}>
        <h1 className={styles.h1}>Find out why a video or image misbehaves — and fix it here.</h1>
        <p className={styles.lead}>
          Drop a file. It is analyzed in this tab, problems are explained in plain language, and
          every fix is applied locally and re-checked before you download it.
        </p>
      </div>
      <DropZone onFile={(f) => void analyzeNewFile(f)} />
      <ol className={styles.steps}>
        <li>
          <strong>Analyze</strong>
          <span>codec, wrapper, size, frame rate, audio, rotation, metadata</span>
        </li>
        <li>
          <strong>Explain</strong>
          <span>what each problem means and why it matters in browsers</span>
        </li>
        <li>
          <strong>Fix</strong>
          <span>lossless re-wraps first; re-encodes only when needed</span>
        </li>
        <li>
          <strong>Verify</strong>
          <span>the result is analyzed again before you download it</span>
        </li>
      </ol>
      <p className={`${ui.small} ${ui.muted}`}>
        Nothing is uploaded. There is no server. You can confirm this in your browser's developer
        tools: the Network tab shows only this page's own files.
      </p>
    </div>
  );
}
