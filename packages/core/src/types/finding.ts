import type { Profile } from './profile';
import type { MediaKind, MediaReport } from './report';

export type Severity = 'error' | 'warn' | 'info';

export type FindingCategory = 'compat' | 'privacy' | 'integrity' | 'size' | 'metadata';

export type FindingSource = 'sniff' | 'probe';

/** A concrete fix suggestion attached to a finding. */
export interface FixRef {
  fixId: string;
  /** Preset params for that fix (must satisfy the fix's params type). */
  params?: Record<string, unknown>;
  /** The one the UI should highlight first. At most one per finding. */
  recommended?: boolean;
}

export interface Finding {
  /** Unique within a report. Usually equals `checkId`; checks that emit several findings add a suffix. */
  id: string;
  checkId: string;
  severity: Severity;
  category: FindingCategory;
  /** Plain-language, one line, no jargon. e.g. "Video uses HEVC, which most browsers can't play". */
  title: string;
  /** One to three plain sentences: what this means for the user. */
  explanation: string;
  /** Why it matters for the active profile (may be empty for profile-independent findings). */
  whyItMatters: string;
  /** Technical evidence shown in the "details" expander. Jargon lives here, not in `title`. */
  evidence: Record<string, string | number | boolean>;
  fixes: FixRef[];
  source: FindingSource;
}

export interface CheckContext {
  profile: Profile;
}

export interface Check {
  id: string;
  kinds: ReadonlyArray<MediaKind>;
  category: FindingCategory;
  /** Pure and synchronous. Return `[]` when nothing is wrong. */
  run(report: MediaReport, ctx: CheckContext): Finding[];
}

/** Helper so check files stay declarative and typed. */
export function defineCheck(check: Check): Check {
  return check;
}
