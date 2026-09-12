# Privacy model

## The promise

Files you drop into MediaLint Forge are processed inside your browser tab. They are not uploaded, not sent to any server, and not stored anywhere by the app.

## What happens to a file

1. **Reading.** The browser hands the app a `File` object. The first 64 KB are read to sniff the format. For images the whole file is read into memory for EXIF parsing and, if you apply a fix, for pixel or byte-level processing. For video the file is mounted into ffmpeg.wasm's virtual filesystem (WORKERFS), which reads from the `File` on demand without copying it; if mounting is unavailable, files up to 200 MB are copied into the WebAssembly heap.
2. **Processing.** ffmpeg runs in a Web Worker on the same page. Image operations run on the main thread with `OffscreenCanvas`. Both are in-process; there is no network transfer.
3. **Output.** The result is a `Blob` in memory, exposed through an object URL for preview and for the download link. Object URLs are revoked when you start over or pick another file.
4. **Persistence.** The app does not store your files or anything derived from them. The only thing it writes to `localStorage` is your light/dark theme choice. No IndexedDB, cookies or Cache API use. Beyond that, the only persistent data is what your browser caches on its own: the app's static assets and the ~32 MB ffmpeg core, exactly like any other website's JavaScript.

## What the app never does

- No uploads, no server-side component, no API calls with file contents.
- No analytics, telemetry, error reporting or third-party scripts.
- No fonts, scripts or media loaded from a CDN. The ffmpeg cores are served from the app's own origin.
- No request is made that contains your file, its name, or its metadata.

## How it is enforced, not just promised

- **Content-Security-Policy** (`apps/web/index.html`): `default-src 'self'; connect-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; form-action 'none'`. The browser blocks any attempt, including by a bug, to send data to another origin.
- **No network code paths.** `packages/core` has no I/O at all. `packages/engine-wasm` only fetches the ffmpeg core files from the app's origin. Search the source for `fetch(`, `XMLHttpRequest`, `WebSocket` or `sendBeacon` to confirm.
- **Self-hosted cores.** `scripts/copy-cores.mjs` copies pinned `@ffmpeg/core*` files into `apps/web/public/ffmpeg/` at build time and records their SHA-256 in `manifest.json`.
- **Static hosting.** The production build is static files. `apps/web/public/_headers` adds `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` next to the isolation headers.

## Verify it yourself

1. Open the app, then open your browser's developer tools → Network tab.
2. Drop a file and run a fix. After the initial page and `ffmpeg/…` core requests, there should be no further requests. The core is requested once and then served from the browser cache.
3. Optionally disconnect from the network after the page has loaded: the app keeps working.

## What the app *does* reveal about your file, to you

The report shows technical evidence extracted from the file, including any embedded GPS coordinates and camera make/model, so you can decide whether to remove them. That information stays on screen in your tab and in the command log; nothing is transmitted.

## Metadata removal: what is and is not covered

- **Images (`strip-metadata-lossless`).** Removes EXIF (including GPS and device tags), XMP, IPTC/Photoshop, comment and multi-picture (embedded preview) segments from JPEG; all non-rendering ancillary chunks (`tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME` …) from PNG; `EXIF` and `XMP` chunks from WebP. Colour profiles are kept on purpose. Pixel data is byte-identical.
- **Video (`strip-metadata`).** Stream-copies with all global, per-stream and chapter metadata removed (`-map_metadata -1`, `-map_chapters -1`) and the encoder tag suppressed. Data in the compressed streams themselves (for example SEI user data written by some encoders) is not scrubbed.
- **Canvas-based image fixes** (orientation, resize, convert) produce a fresh file with no metadata at all.
- The Verify stage re-runs the metadata checks on the output so you can see that the GPS/device findings are gone before downloading.

## Local development

`pnpm dev` runs Vite on `localhost` with the same CSP and isolation headers. The dev server itself does not send any data anywhere.
