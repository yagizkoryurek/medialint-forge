# MediaLint Forge

**Find out why a video won't play on the web, fix it, and prove the fix — without uploading the file anywhere.**

MediaLint Forge is a browser app for people who get handed media that "doesn't work": a phone recording that plays sideways or not at all, a MOV that a website rejects, a photo that still carries the GPS position of your living room. Drop the file in, read a plain-language report of what is wrong, apply a recommended fix, and see a before/after verification before you download the result. There is no application backend and no server-side media processing — ffmpeg (compiled to WebAssembly) and the browser's own image pipeline do the work inside your tab.

**Live demo:** coming soon.

**Status:** v0.1 — a working MVP. The video flow, the image flow and the slow-mode fallback are covered by Playwright end-to-end tests in Chromium and pass locally; see [Known limitations](#known-limitations).

## Why use it

- **Media compatibility diagnosis.** 16 checks explain, in plain language, why a file will not play in current browsers — HEVC or ProRes video, 10-bit or 4:2:2 pixels, PCM audio, an MP4 index at the end of the file, rotation stored only as a tag, odd frame sizes — each with a "why it matters" line and the technical evidence one click away.
- **Local, private metadata removal.** Location and camera/device tags are detected in videos (QuickTime/ISO 6709) and images (EXIF). Images are cleaned losslessly at the byte level: pixels and colour profile are untouched. Videos are stream-copied with all tags removed. The file never leaves your machine.
- **Before/after verification.** Every fix is followed by a second analysis of the output. You see which findings were resolved, which remain, whether anything new appeared, and sanity checks on duration, dimensions and track count — so "fixed" means checked, not assumed.

## How it works

```
Drop  →  Analyze  →  Report  →  Fix  →  Verify  →  Download
```

1. **Analyze** — the first 64 KB are sniffed for the real format (magic bytes, MP4 box order), then the file is probed: `ffprobe` from ffmpeg.wasm for video, EXIF parsing (`exifr`) plus header parsing for images.
2. **Report** — checks run against the *Web browsers* profile and produce findings grouped by severity.
3. **Fix** — each finding recommends a fix. The exact ffmpeg command or image operation is shown before you run it; stream-copy fixes take seconds, re-encodes are labelled slow with a rough size estimate.
4. **Verify** — the output is re-analyzed with the same checks and diffed against the input.
5. **Download** — the result is a normal browser download. You can also feed the output back in as the next input.

## Quick start

Run it locally (a hosted version is not published yet):

```bash
pnpm install && pnpm dev
```

Then open http://localhost:5173 and drop a file — for example `fixtures/media/hevc.mov` (unplayable HEVC in a MOV) or `fixtures/media/gps.jpg` (a JPEG with GPS and camera tags). Requires Node ≥ 22 and pnpm 11.

## Supported formats

| Kind  | Input                | Output                                                        |
| ----- | -------------------- | ------------------------------------------------------------- |
| Video | MP4, MOV, WebM, MKV  | H.264/AAC MP4; MOV/MKV/WebM kept for faststart and metadata fixes |
| Image | JPEG, PNG, WebP      | JPEG, PNG, WebP (WebP output only where the browser can encode it) |

Size limits: video up to 1 GB with the multithreaded core, 500 MB in slow mode. Inputs are mounted into ffmpeg without copying where the browser allows it; otherwise they are copied into memory, up to 200 MB.

### Browser behaviour

- **Designed for** current Chrome, Edge, Firefox and Safari on desktop and mobile. The app needs WebAssembly, module workers and `OffscreenCanvas`.
- **Tested in** Chromium: the Playwright end-to-end suite and manual smoke tests run there. Firefox and Safari have not been exercised yet.
- **Full speed** needs cross-origin isolation (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`), which unlocks `SharedArrayBuffer` and the multithreaded ffmpeg core. The dev server and `apps/web/public/_headers` set these headers.
- **Slow mode** kicks in automatically when the page is not isolated: the single-threaded core loads, the header badge says "Slow mode", every fix still works, and re-encodes are several times slower.
- **WebP output** depends on the canvas encoder; Safari cannot encode WebP, so the option is hidden there.

## Engineering highlights

- **Pure analysis core.** `packages/core` is plain TypeScript with no DOM or Node APIs: format sniffing, ffprobe/EXIF normalization, 16 declarative checks, 10 fixes as `FixPlan`s (steps + expected outcome), verification and size estimates. 93 unit tests run against committed fixtures and ffprobe JSON; ffmpeg command lines are snapshot-tested.
- **Verification is mechanical.** A fix declares which check ids it resolves and what the output's duration, dimensions and stream counts should be; `verify()` re-runs the checks and compares. A native ffmpeg round-trip script proves the plans independently of WebAssembly.
- **ffmpeg.wasm done carefully.** Self-hosted, hash-pinned cores (no CDN); multithreaded core when cross-origin isolated with automatic single-thread fallback; one ffmpeg session per job so a wasm trap or a cancel can never poison the next run; WORKERFS mounts instead of heap copies; progress, ETA, cancel, Wake Lock and a leave-page guard while encoding.
- **Lossless image strippers.** Hand-written JPEG/PNG/WebP segment walkers drop EXIF, XMP, IPTC, comments and embedded previews while keeping ICC profiles and every rendering-relevant chunk; compressed image data is copied byte for byte.
- **Two upstream quirks handled, not hidden.** The 0.12 cores must be loaded from their ESM build (the UMD build has no default export), and their `ffprobe` always exits −1, so probe success is judged from the JSON it prints. Both are documented in [docs/decisions.md](docs/decisions.md).
- **Strict by default.** TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, Biome lint/format, a meta Content-Security-Policy with `connect-src 'self'`, CI running typecheck → lint → test → build.

## Privacy

No backend, no uploads, no analytics, no third-party scripts. Analysis, ffmpeg and image processing all run in the browser tab; the only network requests are the app's own static files and the self-hosted ffmpeg core, which the browser then caches. The Content-Security-Policy in `apps/web/index.html` restricts every connection to the app's own origin, so this is enforced by the browser rather than promised by the app. You can confirm it in the Network tab: after the page loads, dropping a file and running a fix produces no further requests. Full model and metadata-removal details: [docs/privacy.md](docs/privacy.md).

## Checks and fixes

Profile **Web browsers**: MP4/WebM containers; H.264, VP8, VP9, AV1 video; AAC/MP3 in MP4, Opus/Vorbis in WebM; 8-bit 4:2:0; JPEG/PNG/WebP images.

| Check                     | Kind  | Severity | Recommended fix                                        |
| ------------------------- | ----- | -------- | ------------------------------------------------------ |
| `video-codec-unsupported` | video | error    | `transcode-h264-aac` — libx264 + AAC in MP4            |
| `pixfmt-not-yuv420p`      | video | error    | `transcode-h264-aac`                                   |
| `audio-codec-unsupported` | video | error    | `audio-to-aac` (video copied) or `transcode-h264-aac`  |
| `container-not-mp4`       | video | warn     | `remux-mp4` (stream copy) or `transcode-h264-aac`      |
| `mp4-not-faststart`       | video | warn     | `faststart` — move the index up front, no re-encode    |
| `odd-dimensions`          | video | warn     | `transcode-h264-aac` (even dimensions)                 |
| `rotation-metadata`       | video | warn     | `apply-rotation` — bake the rotation into the pixels   |
| `fps-vfr`, `audio-missing`| video | info     | advisory, no fix                                       |
| `image-orientation-tag`   | image | warn     | `apply-orientation` — rotate pixels via canvas         |
| `image-huge-dimensions`   | image | warn     | `resize` — longest side 4096/2048/1920 px              |
| `png-16bit`               | image | info     | `convert` — re-save as 8-bit                           |
| `ext-mismatch`            | both  | warn     | `remux-mp4` / `convert` — make the extension truthful  |
| `metadata-gps`, `metadata-device` | both | warn / info | `strip-metadata-lossless` (image) / `strip-metadata` (video) |
| `file-size-large`         | both  | info     | `transcode-h264-aac` at lower quality / `resize`       |

Every ffmpeg command keeps one video and at most one audio stream (`-map 0:v:0 -map 0:a:0?`), adds `-movflags +faststart` to MP4/MOV output and `-max_muxing_queue_size 1024`. Canvas-based image fixes produce metadata-free output; the lossless strip is the path that keeps everything else intact.

## Development

```bash
pnpm install
```

| Command           | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`        | Copies the pinned ffmpeg cores into `apps/web/public/ffmpeg`, starts Vite on :5173 with COOP/COEP |
| `pnpm build`      | Type-checks and builds `apps/web` into `apps/web/dist`                        |
| `pnpm preview`    | Serves the production build locally with the same headers                     |
| `pnpm typecheck`  | `tsc` for every workspace package                                             |
| `pnpm lint`       | Biome lint + format check (`pnpm format` writes)                              |
| `pnpm test`       | Vitest unit tests for `core` and `engine-wasm`                                |
| `pnpm e2e`        | Playwright end-to-end tests in Chromium (`pnpm exec playwright install chromium` once) |
| `pnpm cores`      | Re-copies the ffmpeg cores and regenerates `manifest.json` with SHA-256 hashes |
| `pnpm fixtures`   | Regenerates `fixtures/media` + `fixtures/probes` (needs a native ffmpeg)      |
| `node scripts/native-roundtrip.test.mjs` | Runs every video fix plan through native ffmpeg and verifies it |

### Architecture

```
packages/core         Pure TypeScript. sniff → normalize → checks → fixes (argv builders, plans,
                      expectations) → verify → estimate → explain (all user-facing copy).
packages/engine-wasm  Browser MediaEngine: FfmpegSession (ffmpeg.wasm 0.12), canvas image ops,
                      lossless JPEG/PNG/WebP strippers.
apps/web              React 19 + Vite + Zustand. Drop / Report / Fix / Verify stages, engine
                      status, command log.
fixtures/             Tiny deterministic media (< 160 KB each) and ffprobe JSON used by the tests.
tests/e2e/            Playwright specs for the three acceptance flows.
.github/workflows/    ci.yml (typecheck, lint, test, build) and deploy.yml (Cloudflare Pages).
```

`core` never calls the engine: checks and fixes are declarative, the engine executes a `FixPlan`, and `verify()` compares the before/after reports. Rationale lives in [docs/decisions.md](docs/decisions.md); adding a check is walked through in [docs/adding-a-check.md](docs/adding-a-check.md); contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Known limitations

- **Testing depth.** End-to-end coverage is the three acceptance flows (HEVC → H.264 MP4, lossless GPS strip, slow-mode faststart) in Chromium. The other fixes are unit-, snapshot- and native-round-trip-tested but not all exercised through the UI; Firefox and Safari are untested.
- **Deployment.** No hosted instance yet. The Cloudflare Pages workflow exists but stays skipped until the project secrets and variable are configured, and CI does not run the e2e suite.
- **Speed and memory.** Re-encoding in WebAssembly is roughly real-time or slower for 1080p with threads, several times slower in slow mode. Long clips can exhaust wasm memory; the error banner then offers the exact command to run with a native ffmpeg.
- **Stream handling.** Every video fix keeps one video and at most one audio stream; subtitles, chapters, extra audio tracks and data streams are dropped.
- **Metadata scope.** Video metadata removal strips container and stream tags but does not scrub in-stream SEI/user data. Canvas-based image fixes (orientation, resize, convert) output 8-bit images with no metadata and browser-default colour management.
- **Upstream quirks.** The 0.12 ffmpeg.wasm cores report exit code −1 for every `ffprobe` run; success is judged from the JSON output instead.

## Licensing

The code in this repository is MIT-licensed ([LICENSE](LICENSE)). The ffmpeg.wasm cores the web app loads at runtime — `@ffmpeg/core` and `@ffmpeg/core-mt` 0.12.10 — are published by their authors under GPL-2.0-or-later and include libx264. They are not committed here; the build copies them from `node_modules`. Running the app imposes nothing on users, but anyone redistributing or hosting a built copy should read [LICENSE-NOTES.md](LICENSE-NOTES.md) first, which lays out the facts without drawing a legal conclusion.
