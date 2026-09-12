import type { Finding } from '../types/finding';
import type { FixPlan } from '../types/fix';
import type { MediaReport } from '../types/report';
import type { SanityResult, Verification } from '../types/verify';

const DURATION_TOLERANCE_SEC = 0.5;

/**
 * Compares findings before and after a fix and runs the structural sanity checks the plan
 * promised. Pure: the caller re-analyzes the output and passes both reports in.
 */
export function verify(
  before: { report: MediaReport; findings: ReadonlyArray<Finding> },
  after: { report: MediaReport; findings: ReadonlyArray<Finding> },
  plan: FixPlan,
): Verification {
  const beforeIds = new Set(before.findings.map((f) => f.id));
  const afterIds = new Set(after.findings.map((f) => f.id));

  const resolved = before.findings.filter((f) => !afterIds.has(f.id));
  const remaining = before.findings.filter((f) => afterIds.has(f.id));
  const introduced = after.findings.filter((f) => !beforeIds.has(f.id));

  const sanity = sanityChecks(before.report, after.report, plan);

  // Only the expected resolutions that actually applied to this file count.
  const expectedApplicable = plan.expected.resolves.filter((id) => beforeIds.has(id));
  const allResolved = expectedApplicable.every((id) => !afterIds.has(id));
  const ok = allResolved && sanity.every((s) => s.ok);

  return { resolved, remaining, introduced, sanity, ok };
}

export function sanityChecks(
  before: MediaReport,
  after: MediaReport,
  plan: FixPlan,
): SanityResult[] {
  const out: SanityResult[] = [];
  const { expected } = plan;

  out.push({
    id: 'output-readable',
    label: 'Output opens and was analyzed',
    ok: after.sizeBytes > 0 && (after.kind === 'image' ? !!after.image : !!after.video),
    detail: after.sizeBytes > 0 ? `${after.sizeBytes} bytes` : 'output is empty',
  });

  if (expected.durationDeltaSec !== undefined && before.container?.durationSec && after.container) {
    const want = before.container.durationSec + expected.durationDeltaSec;
    const got = after.container.durationSec;
    const ok = got !== null && Math.abs(got - want) <= DURATION_TOLERANCE_SEC;
    out.push({
      id: 'duration',
      label: 'Duration preserved',
      ok,
      detail: got === null ? 'unknown after' : `${want.toFixed(2)}s → ${got.toFixed(2)}s`,
    });
  }

  if (expected.dims) {
    const got = after.kind === 'image' ? after.image : after.video;
    const ok = !!got && got.width === expected.dims.width && got.height === expected.dims.height;
    out.push({
      id: 'dimensions',
      label: 'Dimensions as expected',
      ok,
      detail: got
        ? `${expected.dims.width}×${expected.dims.height} expected, got ${got.width}×${got.height}`
        : 'no dimensions after',
    });
  }

  if (expected.streams && after.kind === 'video') {
    const ok =
      after.streamCounts.video === expected.streams.video &&
      after.streamCounts.audio === expected.streams.audio;
    out.push({
      id: 'streams',
      label: 'Video/audio tracks as expected',
      ok,
      detail: `${after.streamCounts.video} video, ${after.streamCounts.audio} audio (expected ${expected.streams.video}/${expected.streams.audio})`,
    });
  }

  return out;
}
