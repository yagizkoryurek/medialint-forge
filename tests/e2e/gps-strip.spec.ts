import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  applyFix,
  containsAscii,
  downloadOutput,
  dropFixture,
  finding,
  fixture,
  jpegSegments,
  trackPageErrors,
} from './helpers';

// Acceptance flow 2: a JPEG with GPS and device EXIF is diagnosed, stripped losslessly (no ffmpeg
// involved), verified, and downloaded with identical image data and no metadata segments.
test('GPS JPEG → Remove metadata (lossless) → Verify → Download', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');

  await dropFixture(page, 'gps.jpg');

  // Analyze: privacy findings only, image path does not load ffmpeg.
  await expect(finding(page, 'metadata-gps')).toBeVisible();
  await expect(finding(page, 'metadata-device')).toBeVisible();
  await expect(
    finding(page, 'metadata-gps').getByText('The file records GPS coordinates (37.7749'),
  ).toBeVisible();
  await expect(page.getByText('ffmpeg on demand', { exact: true })).toBeVisible();

  // Fix: lossless strip is the recommended action.
  await applyFix(page, 'metadata-gps', 'strip-metadata-lossless');

  // Verify.
  const { bytes } = await downloadOutput(page, 'gps.nometa.jpg');
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixed 2 of 2 findings' })).toBeVisible();
  await expect(page.getByText('Sanity checks (2/2 passed)')).toBeVisible();

  // Download: metadata segments gone, compressed image data byte-identical to the input.
  const source = new Uint8Array(readFileSync(fixture('gps.jpg')));
  const before = jpegSegments(source);
  const after = jpegSegments(bytes);
  expect(before.markers).toContain('APP1');
  expect(after.markers).not.toContain('APP1');
  expect(after.markers).not.toContain('COM');
  expect(containsAscii(bytes, 'Exif')).toBe(false);
  expect(containsAscii(bytes, 'MediaLint')).toBe(false);
  expect(after.sosAt).toBeGreaterThan(0);
  expect(Buffer.from(bytes.subarray(after.sosAt))).toEqual(
    Buffer.from(source.subarray(before.sosAt)),
  );
  expect(bytes.byteLength).toBeLessThan(source.byteLength);

  expect(errors).toEqual([]);
});
