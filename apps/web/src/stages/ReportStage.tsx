import {
  type Finding,
  type FixOffer,
  fixOffers,
  type Severity,
  webBrowsers,
} from '@medialint/core';
import { useMemo } from 'react';
import { DropZone } from '../components/DropZone';
import { ErrorBanner } from '../components/ErrorBanner';
import { FindingCard } from '../components/FindingCard';
import { MediaCard } from '../components/MediaCard';
import { analyzeNewFile } from '../services/analyze';
import { selectFix, setCurrentFile, setStage, useStore } from '../store';
import ui from '../styles/ui.module.css';
import styles from './ReportStage.module.css';

const GROUPS: Array<{ severity: Severity; title: string }> = [
  { severity: 'error', title: 'Problems' },
  { severity: 'warn', title: 'Warnings' },
  { severity: 'info', title: 'Good to know' },
];

export function ReportStage() {
  const file = useStore((s) => s.file);
  const before = useStore((s) => s.before);
  const engineMessage = useStore((s) => s.engine.message);
  const caps = useStore((s) => s.engine.caps);

  const offers = useMemo<FixOffer[]>(() => {
    if (before.status !== 'ready' || !before.report || !before.findings) return [];
    const all = fixOffers(before.report, before.findings);
    // Hide image formats this browser cannot encode (e.g. WebP on Safari) from the format defaults.
    const encoders = caps?.imageEncoders ?? ['jpeg', 'png'];
    return all.map((o) =>
      typeof o.params.format === 'string' &&
      !encoders.includes(o.params.format as 'jpeg' | 'png' | 'webp')
        ? { ...o, params: { ...o.params, format: 'jpeg' } }
        : o,
    );
  }, [before, caps]);

  if (!file) return null;

  const choose = (fixId: string) => {
    selectFix(fixId);
    setStage('fix');
  };

  const offersFor = (finding: Finding) =>
    finding.fixes
      .map((ref) => offers.find((o) => o.fix.id === ref.fixId))
      .filter((o): o is FixOffer => !!o);
  const optional = offers.filter((o) => o.forFindings.length === 0);

  const pending =
    before.status === 'sniffing'
      ? 'Reading the file…'
      : before.status === 'probing'
        ? before.kind === 'video'
          ? engineMessage.startsWith('ffmpeg ready')
            ? 'Analyzing with ffprobe…'
            : engineMessage
          : 'Reading image metadata…'
        : undefined;

  return (
    <div className={ui.stack}>
      <MediaCard
        name={file.name}
        sizeBytes={file.sizeBytes}
        previewUrl={file.previewUrl}
        kind={before.kind ?? before.report?.kind}
        sniff={before.sniff}
        report={before.report}
        pending={pending}
      />

      {before.status === 'error' && (
        <ErrorBanner
          title="Couldn't analyze this file"
          actions={
            <button type="button" className={ui.btn} onClick={() => setCurrentFile(null)}>
              Start over
            </button>
          }
        >
          {before.error}
        </ErrorBanner>
      )}

      {before.status === 'ready' && before.findings && (
        <>
          {before.findings.length === 0 ? (
            <section className={`${ui.card} ${styles.clean}`}>
              <span className={ui.badgeOk}>Looks good</span>
              <p>
                No problems found for <strong>{webBrowsers.name.toLowerCase()}</strong>. You can
                still apply an optional action below.
              </p>
            </section>
          ) : (
            GROUPS.map(({ severity, title }) => {
              const items = (before.findings ?? []).filter((f) => f.severity === severity);
              if (items.length === 0) return null;
              return (
                <section key={severity} className={ui.stack} aria-label={title}>
                  <h2 className={ui.h2}>
                    {title} <span className={ui.muted}>({items.length})</span>
                  </h2>
                  {items.map((f) => (
                    <FindingCard
                      key={f.id}
                      finding={f}
                      offers={offersFor(f)}
                      onChooseFix={choose}
                    />
                  ))}
                </section>
              );
            })
          )}

          {optional.length > 0 && (
            <section className={ui.stack} aria-label="Optional actions">
              <h2 className={ui.h3}>Optional actions</h2>
              <div className={ui.row}>
                {optional.map((o) => (
                  <button
                    type="button"
                    key={o.fix.id}
                    className={ui.btn}
                    onClick={() => choose(o.fix.id)}
                    data-fix={o.fix.id}
                  >
                    {o.fix.title}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className={ui.row}>
        <button type="button" className={ui.btnGhost} onClick={() => setCurrentFile(null)}>
          ← Start over
        </button>
      </div>
      <DropZone compact onFile={(f) => void analyzeNewFile(f)} />
    </div>
  );
}
