export { humanBytes } from '@medialint/core';

export function fmtDuration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
    : `${m}:${String(r).padStart(2, '0')}`;
}

export function fmtEta(sec: number | null): string {
  if (sec === null) return '';
  if (sec < 5) return 'almost done';
  if (sec < 90) return `about ${Math.round(sec / 5) * 5} s left`;
  const m = Math.round(sec / 60);
  return `about ${m} min left`;
}

export function fmtFps(fps: number | null): string {
  if (fps === null) return '—';
  return Number.isInteger(fps) ? `${fps}` : fps.toFixed(2);
}
