import type { ReactNode } from 'react';
import ui from '../styles/ui.module.css';
import styles from './ErrorBanner.module.css';

interface Props {
  title: string;
  children?: ReactNode;
  /** Rendered inside a collapsible "Details" section. */
  details?: ReactNode;
  actions?: ReactNode;
}

export function ErrorBanner({ title, children, details, actions }: Props) {
  return (
    <div className={styles.banner} role="alert">
      <div className={styles.title}>{title}</div>
      {children && <div className={styles.body}>{children}</div>}
      {actions && <div className={ui.row}>{actions}</div>}
      {details && (
        <details className="details">
          <summary>Details</summary>
          {details}
        </details>
      )}
    </div>
  );
}
