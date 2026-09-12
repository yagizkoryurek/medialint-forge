import { expect, test } from '@playwright/test';
import {
  applyFix,
  downloadOutput,
  dropFixture,
  finding,
  mp4Boxes,
  trackPageErrors,
} from './helpers';

// Acceptance flow 3: without cross-origin isolation the app must fall back to the single-threaded
// core, say so, and still complete a stream-copy fix. Isolation is removed by stripping the
// COOP/COEP headers from the document response only; the app code is untouched.
test('slow mode: no COOP/COEP → single-thread core → faststart fix still works', async ({
  page,
}) => {
  await page.route(
    (url) => url.origin === 'http://localhost:5173',
    async (route) => {
      if (route.request().resourceType() !== 'document') return route.continue();
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers['cross-origin-opener-policy'];
      delete headers['cross-origin-embedder-policy'];
      await route.fulfill({ response, headers });
    },
  );

  const errors = trackPageErrors(page);
  await page.goto('/');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);

  await dropFixture(page, 'not-faststart.mp4');

  // Analyze with the single-thread core; the header badge must announce slow mode.
  await expect(finding(page, 'mp4-not-faststart')).toBeVisible();
  await expect(page.getByText('Slow mode', { exact: true })).toBeVisible();
  await expect(finding(page, 'video-codec-unsupported')).toHaveCount(0);

  // Fix: stream copy, so it stays quick even on one thread.
  await applyFix(page, 'mp4-not-faststart', 'faststart');

  // Verify + download.
  const { bytes } = await downloadOutput(page, 'not-faststart.faststart.mp4');
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fixed 1 of 1 finding' })).toBeVisible();

  const boxes = mp4Boxes(bytes);
  expect(boxes[0]).toBe('ftyp');
  expect(boxes.indexOf('moov')).toBeLessThan(boxes.indexOf('mdat'));

  expect(errors).toEqual([]);
});
