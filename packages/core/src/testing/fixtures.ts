// Test-only helpers for loading the committed fixtures. Not part of the package's runtime surface
// (excluded from the production tsconfig; only tests import this).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromFfprobe } from '../normalize/fromFfprobe';
import { sniff } from '../sniff/magic';
import type { MediaReport } from '../types/report';

export const FIXTURES_DIR = join(import.meta.dirname, '../../../../fixtures');
export const MEDIA_DIR = join(FIXTURES_DIR, 'media');
export const PROBES_DIR = join(FIXTURES_DIR, 'probes');

export function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(MEDIA_DIR, name)));
}

export function fixtureHead(name: string, bytes = 64 * 1024): Uint8Array {
  return fixtureBytes(name).subarray(0, bytes);
}

export function probeJson(name: string): unknown {
  return JSON.parse(readFileSync(join(PROBES_DIR, `${name}.json`), 'utf8'));
}

export function listProbes(): string[] {
  return readdirSync(PROBES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

/** Builds the report exactly as the app would for a committed video fixture. */
export function videoReport(name: string): MediaReport {
  const bytes = fixtureBytes(name);
  return fromFfprobe({
    fileName: name,
    sizeBytes: bytes.byteLength,
    sniff: sniff(name, bytes.subarray(0, 64 * 1024)),
    json: probeJson(name),
  });
}
