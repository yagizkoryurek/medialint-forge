#!/usr/bin/env node
// Copies the pinned ffmpeg.wasm cores from node_modules into apps/web/public/ffmpeg so the
// app never loads code from a CDN at runtime. Run via `pnpm cores` (also wired to predev/prebuild).
//
// Layout produced:
//   apps/web/public/ffmpeg/core-mt/{ffmpeg-core.js,ffmpeg-core.wasm,ffmpeg-core.worker.js}
//   apps/web/public/ffmpeg/core/{ffmpeg-core.js,ffmpeg-core.wasm}
//   apps/web/public/ffmpeg/manifest.json   (versions + sha256 of every file, for docs/decisions.md)

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, '../apps/web');
const outRoot = join(webDir, 'public', 'ffmpeg');
const require = createRequire(join(webDir, 'package.json'));

const CORES = [
  {
    pkg: '@ffmpeg/core-mt',
    dir: 'core-mt',
    files: ['ffmpeg-core.js', 'ffmpeg-core.wasm', 'ffmpeg-core.worker.js'],
  },
  { pkg: '@ffmpeg/core', dir: 'core', files: ['ffmpeg-core.js', 'ffmpeg-core.wasm'] },
];

const manifest = { generatedAt: new Date().toISOString(), cores: {} };

for (const core of CORES) {
  // CommonJS `require.resolve` follows the "require" export condition → dist/umd/ffmpeg-core.js.
  // @ffmpeg/ffmpeg loads the core with a dynamic `import()` from a module worker, which needs
  // the ESM build (`export default createFFmpegCore`), so step over to the sibling dist/esm/.
  // package.json is hidden behind "exports", so walk up to the package root for the version.
  const entry = require.resolve(core.pkg);
  const srcDir = join(dirname(entry), '..', 'esm');
  const pkgDir = resolve(srcDir, '..', '..');
  const version = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  const dstDir = join(outRoot, core.dir);
  mkdirSync(dstDir, { recursive: true });

  const files = {};
  for (const file of core.files) {
    const src = join(srcDir, file);
    if (!existsSync(src)) {
      console.error(`[cores] missing ${src}`);
      process.exit(1);
    }
    copyFileSync(src, join(dstDir, file));
    files[file] = createHash('sha256').update(readFileSync(src)).digest('hex');
  }
  manifest.cores[core.pkg] = { version, dir: core.dir, files };
  console.log(`[cores] ${core.pkg}@${version} → public/ffmpeg/${core.dir}`);
}

writeFileSync(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('[cores] wrote public/ffmpeg/manifest.json');
