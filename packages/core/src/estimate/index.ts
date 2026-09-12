import { CRF_BY_QUALITY, type Quality } from '../fixes/argv';
import type { FixPlan } from '../types/fix';
import type { MediaReport } from '../types/report';

export interface Estimate {
  reencodes: boolean;
  /** Rough output size band in bytes, or null when we can't say anything useful (images). */
  sizeBytes: [number, number] | null;
  /** 'fast' = stream copy / byte manipulation (seconds); 'slow' = re-encode (can be minutes). */
  speed: 'fast' | 'slow';
}

/**
 * Bits per pixel per frame that x264 `veryfast` lands at for typical content. Heuristic only;
 * the UI shows this as a band, never as a number to trust.
 */
const BPP_BY_CRF: Record<string, number> = { '28': 0.05, '23': 0.09, '20': 0.14 };
const AUDIO_BPS = 128_000;

function crfOf(plan: FixPlan): string | null {
  for (const step of plan.steps) {
    if (step.kind !== 'ffmpeg') continue;
    const i = step.argv.indexOf('-crf');
    if (i >= 0) return step.argv[i + 1] ?? null;
  }
  return null;
}

export function estimate(plan: FixPlan, report: MediaReport): Estimate {
  if (!plan.reencodes) {
    // Stream copy: same bytes ± container overhead. Metadata strip can only shrink.
    const lo = Math.round(report.sizeBytes * 0.97);
    const hi = Math.round(report.sizeBytes * 1.02);
    return {
      reencodes: false,
      sizeBytes: report.kind === 'video' ? [lo, hi] : null,
      speed: 'fast',
    };
  }

  if (report.kind === 'video' && report.video && report.container?.durationSec) {
    const crf = crfOf(plan) ?? CRF_BY_QUALITY.medium;
    const bpp = BPP_BY_CRF[crf] ?? BPP_BY_CRF[CRF_BY_QUALITY.medium as Quality] ?? 0.09;
    const dims = plan.expected.dims ?? { width: report.video.width, height: report.video.height };
    const fps = report.video.fpsAvg ?? 30;
    const dur = report.container.durationSec;
    const videoBytes = (bpp * dims.width * dims.height * fps * dur) / 8;
    const audioBytes = report.streamCounts.audio > 0 ? (AUDIO_BPS * dur) / 8 : 0;
    const mid = videoBytes + audioBytes;
    return {
      reencodes: true,
      sizeBytes: [Math.round(mid * 0.6), Math.round(mid * 1.6)],
      speed: 'slow',
    };
  }

  return { reencodes: true, sizeBytes: null, speed: report.kind === 'image' ? 'fast' : 'slow' };
}
