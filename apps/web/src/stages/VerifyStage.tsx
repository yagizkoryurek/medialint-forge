import type { Finding } from '@medialint/core';
import { MediaCard } from '../components/MediaCard';
import { humanBytes } from '../lib/fmt';
import { adoptOutput } from '../services/jobRunner';
import { setCurrentFile, setStage, useStore } from '../store';
import ui from '../styles/ui.module.css';
import styles from './VerifyStage.module.css';

function List({
  items,
  mark,
  className,
}: {
  items: Finding[];
  mark: string;
  className: string | undefined;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.list}>
      {items.map((f) => (
        <li key={f.id} className={className}>
          <span aria-hidden="true">{mark}</span> {f.title}
        </li>
      ))}
    </ul>
  );
}

export function VerifyStage() {
  const file = useStore((s) => s.file);
  const before = useStore((s) => s.before);
  const after = useStore((s) => s.after);
  const job = useStore((s) => s.job);

  if (!file || job.status !== 'done' || !job.output || !job.verification) {
    return (
      <div className={ui.stack}>
        <p>No verified result yet.</p>
        <button type="button" className={ui.btn} onClick={() => setStage('report')}>
          Back to report
        </button>
      </div>
    );
  }
  const v = job.verification;
  const nothingToResolve = (before.findings?.length ?? 0) === 0;

  return (
    <div className={ui.stack}>
      <section className={`${ui.card} ${ui.stack}`}>
        <div className={ui.row}>
          <span className={v.ok ? ui.badgeOk : ui.badgeWarn}>
            {v.ok ? 'Verified' : 'Check the result'}
          </span>
          <h2 className={ui.h2}>
            {v.ok
              ? nothingToResolve
                ? 'Done — the file was processed and checks out'
                : `Fixed ${v.resolved.length} of ${v.resolved.length + v.remaining.length} finding${v.resolved.length + v.remaining.length === 1 ? '' : 's'}`
              : 'The fix ran, but not everything is as expected'}
          </h2>
        </div>

        <div className={styles.columns}>
          <div>
            <h3 className={ui.h3}>Resolved</h3>
            {v.resolved.length ? (
              <List items={v.resolved} mark="✓" className={styles.ok} />
            ) : (
              <p className={ui.muted}>—</p>
            )}
          </div>
          <div>
            <h3 className={ui.h3}>Still present</h3>
            {v.remaining.length ? (
              <List items={v.remaining} mark="•" className={styles.warn} />
            ) : (
              <p className={ui.muted}>none</p>
            )}
            {v.introduced.length > 0 && (
              <>
                <h3 className={ui.h3}>New</h3>
                <List items={v.introduced} mark="!" className={styles.bad} />
              </>
            )}
          </div>
        </div>

        <details className="details" open={!v.ok}>
          <summary>
            Sanity checks ({v.sanity.filter((s) => s.ok).length}/{v.sanity.length} passed)
          </summary>
          <ul className={styles.list}>
            {v.sanity.map((s) => (
              <li key={s.id} className={s.ok ? styles.ok : styles.bad}>
                <span aria-hidden="true">{s.ok ? '✓' : '✗'}</span> {s.label}{' '}
                <span className={ui.muted}>— {s.detail}</span>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <div className={styles.compare}>
        <MediaCard
          title="Before"
          name={file.name}
          sizeBytes={file.sizeBytes}
          previewUrl={file.previewUrl}
          kind={before.report?.kind}
          report={before.report}
        />
        <MediaCard
          title="After"
          name={job.output.name}
          sizeBytes={job.output.blob.size}
          previewUrl={job.output.url}
          kind={job.output.kind}
          report={after.report}
        />
      </div>

      <section className={`${ui.card} ${ui.row}`}>
        <a
          className={ui.btnPrimary}
          href={job.output.url}
          download={job.output.name}
          data-testid="download"
        >
          Download {job.output.name}
        </a>
        <span className={ui.muted}>
          {humanBytes(job.output.blob.size)}
          {file.sizeBytes > 0 && (
            <>
              {' '}
              (
              {job.output.blob.size < file.sizeBytes
                ? `${Math.round((1 - job.output.blob.size / file.sizeBytes) * 100)}% smaller`
                : `${Math.round((job.output.blob.size / file.sizeBytes - 1) * 100)}% larger`}
              )
            </>
          )}
        </span>
        <span className={ui.spacer} />
        <button
          type="button"
          className={ui.btn}
          onClick={() => void adoptOutput()}
          data-testid="use-as-input"
        >
          Use result as input
        </button>
        <button type="button" className={ui.btnGhost} onClick={() => setStage('report')}>
          Back to report
        </button>
        <button type="button" className={ui.btnGhost} onClick={() => setCurrentFile(null)}>
          Start over
        </button>
      </section>
    </div>
  );
}
