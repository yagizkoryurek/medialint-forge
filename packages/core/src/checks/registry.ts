import type { Check, Finding, Severity } from '../types/finding';
import type { Profile } from '../types/profile';
import type { MediaReport } from '../types/report';
import { extMismatch, fileSizeLarge, metadataDevice, metadataGps } from './common';
import { IMAGE_CHECKS } from './image';
import { VIDEO_CHECKS } from './video';

/**
 * Order matters for display: compatibility blockers first, then structure, then privacy/size.
 * Within the UI findings are additionally grouped by severity.
 */
export const ALL_CHECKS: ReadonlyArray<Check> = [
  ...VIDEO_CHECKS,
  ...IMAGE_CHECKS,
  extMismatch,
  metadataGps,
  metadataDevice,
  fileSizeLarge,
];

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function runChecks(
  report: MediaReport,
  profile: Profile,
  checks: ReadonlyArray<Check> = ALL_CHECKS,
): Finding[] {
  const findings: Finding[] = [];
  for (const check of checks) {
    if (!check.kinds.includes(report.kind)) continue;
    findings.push(...check.run(report, { profile }));
  }
  // Stable sort by severity, preserving registry order within a severity.
  return findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);
}

export function getCheck(id: string): Check | undefined {
  return ALL_CHECKS.find((c) => c.id === id);
}
