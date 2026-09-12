import { useStore } from '../store';
import ui from '../styles/ui.module.css';

export function EngineStatus() {
  const engine = useStore((s) => s.engine);
  const slow = engine.caps ? !engine.caps.multithreaded : false;

  if (engine.status === 'loading') {
    return (
      <span className={ui.badgeNeutral} title={engine.message} aria-live="polite">
        <span className={ui.spinner} /> Loading ffmpeg…
      </span>
    );
  }
  if (engine.status === 'error') {
    return (
      <span className={ui.badgeError} title={engine.message}>
        ffmpeg failed to load
      </span>
    );
  }
  if (engine.status === 'ready') {
    return slow ? (
      <span
        className={ui.badgeWarn}
        title="This page is not cross-origin isolated, so ffmpeg runs on a single thread. Video fixes work but are several times slower. Hosting must send COOP/COEP headers to enable threads."
      >
        Slow mode
      </span>
    ) : (
      <span className={ui.badgeOk} title={engine.message}>
        ffmpeg ready
      </span>
    );
  }
  return (
    <span className={ui.badgeNeutral} title="ffmpeg is loaded on demand when a video is dropped">
      ffmpeg on demand
    </span>
  );
}
