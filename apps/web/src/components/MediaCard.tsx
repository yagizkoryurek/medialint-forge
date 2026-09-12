import { codecName, formatName, type MediaReport, type SniffResult } from '@medialint/core';
import { fmtDuration, fmtFps, humanBytes } from '../lib/fmt';
import ui from '../styles/ui.module.css';
import styles from './MediaCard.module.css';

interface Props {
  name: string;
  sizeBytes: number;
  previewUrl: string;
  kind: 'video' | 'image' | 'unknown' | undefined;
  sniff?: SniffResult | undefined;
  report?: MediaReport | undefined;
  /** Shown while probing. */
  pending?: string | undefined;
  title?: string;
}

function facts(report: MediaReport): string[] {
  const out: string[] = [];
  if (report.kind === 'video') {
    const v = report.video;
    if (v) {
      out.push(`${v.width}×${v.height}${v.rotation ? ` (rotated ${v.rotation}°)` : ''}`);
      out.push(`${codecName(v.codec)}${v.profile ? ` ${v.profile}` : ''}`);
      out.push(`${fmtFps(v.fpsAvg)} fps`);
      if (v.pixFmt) out.push(v.pixFmt);
    }
    const a = report.audio[0];
    out.push(
      a
        ? `${codecName(a.codec)}${a.channels ? ` ${a.channels === 1 ? 'mono' : a.channels === 2 ? 'stereo' : `${a.channels}ch`}` : ''}`
        : 'no audio',
    );
    out.push(fmtDuration(report.container?.durationSec));
  } else if (report.image) {
    const i = report.image;
    out.push(`${i.width}×${i.height}`);
    out.push(formatName(i.format));
    if (i.bitDepth && i.bitDepth !== 8) out.push(`${i.bitDepth}-bit`);
    if (i.hasAlpha) out.push('alpha');
    if (i.animated) out.push('animated');
    if (i.orientation && i.orientation !== 1) out.push(`orientation ${i.orientation}`);
  }
  out.push(humanBytes(report.sizeBytes));
  return out;
}

export function MediaCard({
  name,
  sizeBytes,
  previewUrl,
  kind,
  sniff,
  report,
  pending,
  title,
}: Props) {
  return (
    <section className={`${ui.card} ${styles.card}`} aria-label={title ?? 'File'}>
      <div className={styles.preview}>
        {kind === 'image' ? (
          <img src={previewUrl} alt="" className={styles.media} />
        ) : kind === 'video' ? (
          <video
            src={previewUrl}
            className={styles.media}
            controls
            muted
            playsInline
            preload="metadata"
          />
        ) : (
          <div className={styles.placeholder}>?</div>
        )}
      </div>
      <div className={styles.body}>
        {title && <div className={`${ui.small} ${ui.muted}`}>{title}</div>}
        <h2 className={styles.name} title={name}>
          {name}
        </h2>
        {report ? (
          <ul className={styles.facts}>
            {facts(report).map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        ) : (
          <ul className={styles.facts}>
            {sniff && sniff.format !== 'unknown' && <li>{formatName(sniff.format)}</li>}
            <li>{humanBytes(sizeBytes)}</li>
            {pending && (
              <li className={ui.muted}>
                <span className={ui.spinner} /> {pending}
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
