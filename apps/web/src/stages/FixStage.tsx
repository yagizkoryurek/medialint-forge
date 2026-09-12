import { type AnyFix, estimate, formatCommand, getFix, planFix } from '@medialint/core';
import { useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from '../components/ErrorBanner';
import { fmtEta, humanBytes } from '../lib/fmt';
import { cancelJob, runFix } from '../services/jobRunner';
import { setStage, useStore } from '../store';
import ui from '../styles/ui.module.css';
import styles from './FixStage.module.css';

export function FixStage() {
  const before = useStore((s) => s.before);
  const job = useStore((s) => s.job);
  const selectedFixId = useStore((s) => s.ui.selectedFixId);
  const caps = useStore((s) => s.engine.caps);

  const fixId = job.status === 'idle' ? selectedFixId : (job.fixId ?? selectedFixId);
  const fix: AnyFix | undefined = fixId ? getFix(fixId) : undefined;
  const report = before.report;

  const [params, setParams] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (!fix || !report) return;
    const defaults = fix.defaults(report) as Record<string, unknown>;
    const encoders = caps?.imageEncoders ?? ['jpeg', 'png'];
    if (
      typeof defaults.format === 'string' &&
      !encoders.includes(defaults.format as 'jpeg' | 'png' | 'webp')
    ) {
      defaults.format = 'jpeg';
    }
    setParams(job.params ?? defaults);
  }, [fix, report, caps, job.params]);

  const plan = useMemo(() => {
    if (!fix || !report) return null;
    try {
      return planFix(fix.id, report, params);
    } catch {
      return null;
    }
  }, [fix, report, params]);
  const est = plan && report ? estimate(plan, report) : null;

  if (!report || !fix) {
    return (
      <div className={ui.stack}>
        <ErrorBanner title="No fix selected">
          <button type="button" className={ui.btn} onClick={() => setStage('report')}>
            Back to report
          </button>
        </ErrorBanner>
      </div>
    );
  }

  const busy = job.status === 'running' || job.status === 'verifying';
  const encoders = caps?.imageEncoders ?? ['jpeg', 'png'];

  return (
    <div className={ui.stack}>
      <section className={`${ui.card} ${ui.stack}`}>
        <div className={ui.row}>
          <h2 className={ui.h2}>{fix.title}</h2>
          <span className={fix.reencodes ? ui.badgeWarn : ui.badgeOk}>
            {fix.reencodes ? 'Re-encodes' : 'No re-encode'}
          </span>
        </div>
        <p className={styles.describe}>{fix.describe(report, params as never)}</p>

        {fix.params && fix.params.length > 0 && (
          <div className={ui.row}>
            {fix.params.map((p) => (
              <label key={p.key} className={styles.param}>
                <span className={`${ui.small} ${ui.muted}`}>{p.label}</span>
                <select
                  className={ui.select}
                  value={String(params[p.key] ?? '')}
                  disabled={busy}
                  onChange={(e) => setParams((prev) => ({ ...prev, [p.key]: e.target.value }))}
                >
                  {p.options
                    .filter(
                      (o) =>
                        p.key !== 'format' || encoders.includes(o.value as 'jpeg' | 'png' | 'webp'),
                    )
                    .map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {est && (
          <dl className={ui.kv}>
            <dt>Speed</dt>
            <dd>
              {est.speed === 'fast'
                ? 'fast (seconds)'
                : caps?.multithreaded
                  ? 'slow — re-encoding in the browser'
                  : 'slow — re-encoding on a single thread'}
            </dd>
            {est.sizeBytes && (
              <>
                <dt>Output size</dt>
                <dd>
                  roughly {humanBytes(est.sizeBytes[0])} – {humanBytes(est.sizeBytes[1])}
                </dd>
              </>
            )}
            {plan && (
              <>
                <dt>Output</dt>
                <dd>{plan.outputName}</dd>
              </>
            )}
          </dl>
        )}

        {plan && (
          <details className="details">
            <summary>Exact command</summary>
            {plan.steps
              .map((s) =>
                s.kind === 'ffmpeg'
                  ? formatCommand(s.argv)
                  : `image:${s.op} ${JSON.stringify(s.params)}`,
              )
              .map((text) => (
                <code key={text} className={ui.code}>
                  {text}
                </code>
              ))}
          </details>
        )}

        <div className={ui.row}>
          {!busy && (
            <>
              <button
                type="button"
                className={ui.btnPrimary}
                onClick={() => void runFix(fix.id, params)}
                disabled={!plan}
                data-testid="apply-fix"
              >
                Apply fix
              </button>
              <button type="button" className={ui.btnGhost} onClick={() => setStage('report')}>
                ← Back
              </button>
            </>
          )}
          {busy && (
            <button type="button" className={ui.btn} onClick={cancelJob}>
              Cancel
            </button>
          )}
        </div>
      </section>

      {(busy || job.status === 'cancelled') && (
        <section className={`${ui.card} ${ui.stack}`} aria-live="polite">
          <div className={ui.row}>
            {busy && <span className={ui.spinner} />}
            <strong>
              {job.status === 'running'
                ? 'Applying fix…'
                : job.status === 'verifying'
                  ? 'Verifying the result…'
                  : 'Cancelled'}
            </strong>
            {job.status === 'running' && job.etaSec !== null && (
              <span className={ui.muted}>{fmtEta(job.etaSec)}</span>
            )}
          </div>
          <div
            className={styles.bar}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={job.progress === null ? undefined : Math.round(job.progress * 100)}
          >
            <div
              className={`${styles.fill} ${job.progress === null && busy ? styles.indeterminate : ''}`}
              style={{
                width:
                  job.progress === null && busy
                    ? undefined
                    : `${Math.round((job.progress ?? 0) * 100)}%`,
              }}
            />
          </div>
          {job.status === 'cancelled' && (
            <button type="button" className={ui.btn} onClick={() => setStage('report')}>
              ← Back to report
            </button>
          )}
        </section>
      )}

      {job.status === 'failed' && job.error && (
        <ErrorBanner
          title="The fix failed"
          details={
            <div className={ui.stack}>
              {job.error.commands.map((c) => (
                <code key={c} className={ui.code}>
                  {c}
                </code>
              ))}
              {job.error.stderrTail && <code className={ui.code}>{job.error.stderrTail}</code>}
              <div className={ui.small}>{job.error.message}</div>
            </div>
          }
          actions={
            <>
              <button type="button" className={ui.btn} onClick={() => void runFix(fix.id, params)}>
                Try again
              </button>
              {job.error.commands.length > 0 && (
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() =>
                    navigator.clipboard?.writeText(job.error?.commands.join('\n') ?? '')
                  }
                >
                  Copy command for native ffmpeg
                </button>
              )}
              <button type="button" className={ui.btnGhost} onClick={() => setStage('report')}>
                Back to report
              </button>
            </>
          }
        >
          {job.error.hint}
        </ErrorBanner>
      )}
    </div>
  );
}
