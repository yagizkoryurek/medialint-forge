import type { GpsInfo, MetadataInfo } from '../types/report';

/** Parses an ISO 6709 location string such as `+37.7749-122.4194/` or `+40.7128-074.0060+010.5/`. */
export function parseIso6709(value: string): GpsInfo | null {
  const m = /^\s*([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const GPS_KEYS = ['location', 'location-eng', 'com.apple.quicktime.location.ISO6709'];
const MAKE_KEYS = ['make', 'com.apple.quicktime.make', 'Make'];
const MODEL_KEYS = ['model', 'com.apple.quicktime.model', 'Model'];
const SOFTWARE_KEYS = ['com.apple.quicktime.software', 'software', 'Software', 'encoder'];
const CREATION_KEYS = [
  'creation_time',
  'com.apple.quicktime.creationdate',
  'date',
  'DateTimeOriginal',
];

function firstOf(tags: Record<string, string>, keys: ReadonlyArray<string>): string | null {
  for (const k of keys) {
    const v = tags[k];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  // Case-insensitive fallback (container tags vary in casing).
  const lower = new Map(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  for (const k of keys) {
    const v = lower.get(k.toLowerCase());
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/**
 * Builds MetadataInfo from container-level tags (ffprobe `format.tags`) plus any per-stream tags,
 * which are kept only as evidence in `tags`.
 */
export function extractMetadata(
  formatTags: Record<string, string>,
  streamTags: Record<string, string> = {},
): MetadataInfo {
  const gpsRaw = firstOf(formatTags, GPS_KEYS);
  const gps = gpsRaw ? parseIso6709(gpsRaw) : null;
  return {
    gps,
    make: firstOf(formatTags, MAKE_KEYS),
    model: firstOf(formatTags, MODEL_KEYS),
    software: firstOf(formatTags, SOFTWARE_KEYS),
    creationTime: firstOf(formatTags, CREATION_KEYS),
    tags: { ...formatTags, ...streamTags },
  };
}
