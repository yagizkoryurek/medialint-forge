import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Download, expect, type Page } from '@playwright/test';

export const FIXTURES = join(import.meta.dirname, '../../fixtures/media');

export function fixture(name: string): string {
  return join(FIXTURES, name);
}

/** Collects uncaught page errors so a flow can assert the app stayed clean. */
export function trackPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (err) => errors.push(err));
  return errors;
}

/** Drops a fixture into the app through the hidden file input of the first drop zone. */
export async function dropFixture(page: Page, name: string): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(fixture(name));
}

export function finding(page: Page, id: string) {
  return page.locator(`[data-finding="${id}"]`);
}

/** Chooses a fix from a finding card, lands on the Fix stage and applies it. */
export async function applyFix(page: Page, findingId: string, fixId: string): Promise<void> {
  await finding(page, findingId).locator(`[data-fix="${fixId}"]`).click();
  await expect(page.getByTestId('apply-fix')).toBeVisible();
  await page.getByTestId('apply-fix').click();
}

/** Waits for the Verify stage and returns the bytes of the downloaded output. */
export async function downloadOutput(
  page: Page,
  expectedName: string,
): Promise<{ download: Download; bytes: Uint8Array }> {
  const link = page.getByTestId('download');
  await expect(link).toBeVisible({ timeout: 150_000 });
  await expect(link).toHaveAttribute('download', expectedName);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  expect(download.suggestedFilename()).toBe(expectedName);
  const path = await download.path();
  if (!path) throw new Error('download produced no file');
  return { download, bytes: new Uint8Array(readFileSync(path)) };
}

function ascii(b: Uint8Array, at: number, len: number): string {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i++) s += String.fromCharCode(b[at + i] ?? 0);
  return s;
}

function u32be(b: Uint8Array, i: number): number {
  return (
    (((b[i] ?? 0) << 24) | ((b[i + 1] ?? 0) << 16) | ((b[i + 2] ?? 0) << 8) | (b[i + 3] ?? 0)) >>> 0
  );
}

/** Top-level ISO BMFF box types in file order. */
export function mp4Boxes(bytes: Uint8Array): string[] {
  const out: string[] = [];
  let i = 0;
  while (i + 8 <= bytes.length) {
    let size = u32be(bytes, i);
    const type = ascii(bytes, i + 4, 4);
    if (size === 1) {
      // 64-bit largesize; fixtures are tiny so the high word is zero.
      size = u32be(bytes, i + 12);
    } else if (size === 0) {
      size = bytes.length - i;
    }
    if (size < 8) break;
    out.push(type);
    i += size;
  }
  return out;
}

/** JPEG marker segments before the first scan, plus the byte offset of SOS. */
export function jpegSegments(bytes: Uint8Array): { markers: string[]; sosAt: number } {
  const markers: string[] = [];
  let i = 2; // after SOI
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xda) return { markers, sosAt: i };
    const len = ((bytes[i + 2] ?? 0) << 8) | (bytes[i + 3] ?? 0);
    markers.push(
      marker >= 0xe0 && marker <= 0xef
        ? `APP${marker - 0xe0}`
        : marker === 0xfe
          ? 'COM'
          : `0x${marker.toString(16)}`,
    );
    i += 2 + len;
  }
  return { markers, sosAt: -1 };
}

export function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= bytes.length; i++) {
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}
