import type { Finding, Severity } from '../types/finding';
import type { Fix, FixPlan } from '../types/fix';
import type { MediaReport } from '../types/report';
import { IMAGE_FIXES } from './image';
import { VIDEO_FIXES } from './video';

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous param types live behind a common runtime shape
export type AnyFix = Fix<any>;

export const ALL_FIXES: ReadonlyArray<AnyFix> = [...VIDEO_FIXES, ...IMAGE_FIXES];

export function getFix(id: string): AnyFix | undefined {
  return ALL_FIXES.find((f) => f.id === id);
}

/** A fix the UI can offer, with the findings it addresses and a ranking hint. */
export interface FixOffer {
  fix: AnyFix;
  params: Record<string, unknown>;
  /** Findings (ids) that reference this fix. Empty for "optional actions" (e.g. strip metadata on a clean file). */
  forFindings: string[];
  /** True when at least one finding marks this fix as its recommended fix. */
  recommended: boolean;
  /** Most severe finding this fix addresses; null for optional actions. */
  severity: Severity | null;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
const rank = (s: Severity | null) => (s === null ? 3 : SEVERITY_RANK[s]);
const worse = (a: Severity | null, b: Severity) => (rank(a) <= rank(b) ? a : b);

/**
 * Collects the fixes worth offering for a report: every fix referenced by a finding (deduplicated,
 * params merged from the first reference) plus any other applicable fix as an optional action.
 * Ranking: the fix addressing the most severe finding first, then recommended-by-a-finding, then
 * no-re-encode before re-encode, then registry order.
 */
export function fixOffers(report: MediaReport, findings: ReadonlyArray<Finding>): FixOffer[] {
  const byId = new Map<string, FixOffer>();

  for (const finding of findings) {
    for (const ref of finding.fixes) {
      const fix = getFix(ref.fixId);
      if (!fix || !fix.kinds.includes(report.kind) || !fix.applicable(report, finding)) continue;
      const existing = byId.get(fix.id);
      if (existing) {
        existing.forFindings.push(finding.id);
        existing.recommended = existing.recommended || !!ref.recommended;
        existing.severity = worse(existing.severity, finding.severity);
      } else {
        byId.set(fix.id, {
          fix,
          params: { ...fix.defaults(report), ...(ref.params ?? {}) },
          forFindings: [finding.id],
          recommended: !!ref.recommended,
          severity: finding.severity,
        });
      }
    }
  }

  for (const fix of ALL_FIXES) {
    if (byId.has(fix.id) || !fix.kinds.includes(report.kind) || !fix.applicable(report)) continue;
    byId.set(fix.id, {
      fix,
      params: fix.defaults(report),
      forFindings: [],
      recommended: false,
      severity: null,
    });
  }

  const order = new Map(ALL_FIXES.map((f, i) => [f.id, i]));
  return [...byId.values()].sort(
    (a, b) =>
      rank(a.severity) - rank(b.severity) ||
      Number(b.recommended) - Number(a.recommended) ||
      Number(a.fix.reencodes) - Number(b.fix.reencodes) ||
      (order.get(a.fix.id) ?? 0) - (order.get(b.fix.id) ?? 0),
  );
}

export function planFix(
  fixId: string,
  report: MediaReport,
  params?: Record<string, unknown>,
): FixPlan {
  const fix = getFix(fixId);
  if (!fix) throw new Error(`Unknown fix: ${fixId}`);
  if (!fix.applicable(report))
    throw new Error(`Fix ${fixId} is not applicable to ${report.fileName}`);
  return fix.plan(report, { ...fix.defaults(report), ...(params ?? {}) });
}
