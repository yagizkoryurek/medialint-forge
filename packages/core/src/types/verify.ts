import type { Finding } from './finding';

export interface SanityResult {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface Verification {
  /** Findings from the before-report that no longer appear after the fix. */
  resolved: Finding[];
  /** Findings present both before and after. */
  remaining: Finding[];
  /** Findings that only exist after the fix (should be rare — a regression signal). */
  introduced: Finding[];
  /** Structural sanity checks derived from the FixPlan's expectations. */
  sanity: SanityResult[];
  /** True when every `expected.resolves` id is resolved and every sanity check passed. */
  ok: boolean;
}
