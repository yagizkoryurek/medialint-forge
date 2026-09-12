#!/usr/bin/env node
// Developer sanity check (not part of `pnpm test`): runs every applicable video FixPlan through the
// NATIVE ffmpeg on the committed fixtures, re-probes the output, and verifies with core.
// Proves the argv builders + `expected` contracts are right independently of ffmpeg.wasm.
//
//   node scripts/native-roundtrip.test.mjs
//
// Uses Vite's node runner so the TypeScript core can be imported without a build step.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname;
// vite is a dependency of apps/web, not the workspace root — resolve it from there.
const { createServer } = await import(
  pathToFileURL(createRequire(join(root, 'apps/web/package.json')).resolve('vite')).href
);
const vite = await createServer({ root, server: { middlewareMode: true }, logLevel: 'error' });
const core = await vite.ssrLoadModule('/packages/core/src/index.ts');
await vite.close();

const MEDIA = join(root, 'fixtures/media');
const OUT = mkdtempSync(join(tmpdir(), 'medialint-'));

function probe(path) {
  return JSON.parse(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ]),
  );
}
function report(path, name) {
  const bytes = new Uint8Array(readFileSync(path));
  return core.fromFfprobe({
    fileName: name,
    sizeBytes: bytes.byteLength,
    sniff: core.sniff(name, bytes.subarray(0, 65536)),
    json: probe(path),
  });
}

const fixtures = [
  'h264.mkv',
  'not-faststart.mp4',
  'gps.mov',
  'hevc.mov',
  'prores.mov',
  'pcm-audio.mov',
  'rotated.mp4',
  'odd-dims.mp4',
  'vp9.webm',
];
let failures = 0;
for (const name of fixtures) {
  const before = report(join(MEDIA, name), name);
  const findings = core.runChecks(before, core.webBrowsers);
  for (const offer of core.fixOffers(before, findings)) {
    const plan = core.planFix(offer.fix.id, before, offer.params);
    const step = plan.steps[0];
    const argv = step.argv.map((a) =>
      a.replace(/^\/input\//, `${MEDIA}/`).replace(/^\/out\//, `${OUT}/`),
    );
    let ok = true;
    let detail = '';
    try {
      execFileSync('ffmpeg', argv, { stdio: ['ignore', 'ignore', 'pipe'] });
      const after = report(join(OUT, plan.outputName), plan.outputName);
      const v = core.verify(
        { report: before, findings },
        { report: after, findings: core.runChecks(after, core.webBrowsers) },
        plan,
      );
      ok = v.ok;
      detail = ok
        ? `resolved ${v.resolved.map((f) => f.id).join(',') || '-'}`
        : `remaining=${v.remaining.map((f) => f.id)} introduced=${v.introduced.map((f) => f.id)} sanity=${v.sanity.filter((s) => !s.ok).map((s) => `${s.id}:${s.detail}`)}`;
    } catch (e) {
      ok = false;
      detail = `ffmpeg failed: ${String(e.stderr ?? e.message)
        .split('\n')
        .filter(Boolean)
        .slice(-2)
        .join(' | ')}`;
    }
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} ${name.padEnd(18)} ${offer.fix.id.padEnd(24)} ${detail}`);
  }
}
writeFileSync(join(OUT, 'DONE'), '');
console.log(
  `\n${failures === 0 ? 'all plans verified' : `${failures} failure(s)`} (outputs in ${OUT})`,
);
process.exit(failures ? 1 : 0);
