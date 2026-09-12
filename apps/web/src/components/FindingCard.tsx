import type { Finding, FixOffer, Severity } from '@medialint/core';
import ui from '../styles/ui.module.css';
import styles from './FindingCard.module.css';

const LABEL: Record<Severity, string> = { error: 'Problem', warn: 'Warning', info: 'Note' };
const BADGE: Record<Severity, string> = {
  error: ui.badgeError ?? '',
  warn: ui.badgeWarn ?? '',
  info: ui.badgeInfo ?? '',
};

interface Props {
  finding: Finding;
  /** Offers relevant to this finding, in ranked order. */
  offers: FixOffer[];
  onChooseFix: (fixId: string) => void;
  disabled?: boolean;
}

export function FindingCard({ finding, offers, onChooseFix, disabled }: Props) {
  const recommended = finding.fixes.find((f) => f.recommended)?.fixId;
  return (
    <article
      className={`${ui.card} ${styles.card} ${styles[finding.severity]}`}
      data-finding={finding.id}
    >
      <div className={styles.head}>
        <span className={BADGE[finding.severity]}>{LABEL[finding.severity]}</span>
        <h3 className={styles.title}>{finding.title}</h3>
      </div>
      <p className={styles.explanation}>{finding.explanation}</p>
      {finding.whyItMatters && <p className={`${ui.small} ${ui.muted}`}>{finding.whyItMatters}</p>}

      {offers.length > 0 && (
        <div className={styles.actions}>
          {offers.map((o) => {
            const isRecommended = o.fix.id === recommended;
            return (
              <button
                type="button"
                key={o.fix.id}
                className={isRecommended ? ui.btnPrimary : ui.btn}
                onClick={() => onChooseFix(o.fix.id)}
                disabled={disabled}
                data-fix={o.fix.id}
              >
                {o.fix.title}
                {!o.fix.reencodes && <span className={styles.fast}>fast</span>}
              </button>
            );
          })}
        </div>
      )}

      <details className="details">
        <summary>Technical details</summary>
        <dl className={ui.kv}>
          {Object.entries(finding.evidence).map(([k, v]) => (
            <div key={k} className={styles.kvRow}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
          <div className={styles.kvRow}>
            <dt>check</dt>
            <dd>{finding.checkId}</dd>
          </div>
        </dl>
      </details>
    </article>
  );
}
