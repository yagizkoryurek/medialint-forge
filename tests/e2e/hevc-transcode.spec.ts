import { expect, test } from '@playwright/test';
import {
  containsAscii,
  downloadOutput,
  dropFixture,
  finding,
  mp4Boxes,
  trackPageErrors,
} from './helpers';

// Acceptance flow 1: an HEVC MOV is diagnosed, converted to H.264/AAC MP4 with the multithreaded
// core, verified against the same checks, and downloaded as a valid faststart MP4.
test('HEVC MOV → Convert to H.264 MP4 → Verify → Download', async ({ page }) => {
  const errors = trackPageErrors(page);
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

  await dropFixture(page, 'hevc.mov');

  // Analyze: codec is the blocker; container and faststart come along.
  await expect(finding(page, 'video-codec-unsupported')).toBeVisible();
  await expect(finding(page, 'container-not-mp4')).toBeVisible();
  await expect(finding(page, 'mp4-not-faststart')).toBeVisible();
  await expect(page.getByText('ffmpeg ready', { exact: true })).toBeVisible();

  // Fix: the recommended fix is the full transcode.
  await finding(page, 'video-codec-unsupported').locator('[data-fix="transcode-h264-aac"]').click();
  await expect(page.getByRole('heading', { name: 'Convert to H.264 MP4' })).toBeVisible();
  await expect(page.getByText('Re-encodes', { exact: true })).toBeVisible();
  await page.getByTestId('apply-fix').click();

  // Verify: every finding resolved, all sanity checks green.
  const { bytes } = await downloadOutput(page, 'hevc.fixed.mp4');
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixed 3 of 3 findings' })).toBeVisible();
  await expect(page.getByText('Sanity checks (4/4 passed)')).toBeVisible();

  // Download: a real MP4 with the index before the media data.
  expect(bytes.byteLength).toBeGreaterThan(0);
  const boxes = mp4Boxes(bytes);
  expect(boxes[0]).toBe('ftyp');
  expect(boxes.indexOf('moov')).toBeGreaterThan(-1);
  expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));
  expect(containsAscii(bytes, 'avc1')).toBe(true);
  expect(containsAscii(bytes, 'hvc1')).toBe(false);
  expect(containsAscii(bytes, 'hev1')).toBe(false);

  expect(errors).toEqual([]);
});
