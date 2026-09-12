# MediaLint Forge

Local-first media diagnostics and repair in the browser. Drop a video or image, see what would stop it from playing on the web or what private metadata it carries, apply a fix, verify the result, and download it. Nothing is uploaded: analysis, ffmpeg and image processing all run inside the tab.

**Status:** v0.1 — working MVP. The two headline flows (HEVC MOV → H.264 MP4, and lossless GPS removal from a JPEG) are smoke-tested end to end; see [Known limitations](#known-limitations) for what is not yet covered.

## How it works

```
Drop  →  Analyze  →  Report  →  Fix  →  Verify  →  Download
```

1. **Analyze** — the first 64 KB are sniffed for the real format (magic bytes, MP4 box order), then the file is probed: `ffprobe` (ffmpeg.wasm) for video, EXIF parsing (`exifr`) plus header parsing for images.
2. **Report** — 16 checks run against the *Web browsers* profile and produce plain-language findings with a "why it matters" line and a technical evidence section.
3. **Fix** — each finding recommends a fix. The exact ffmpeg command (or image operation) is shown before you run it. Stream-copy fixes take seconds; re-encodes are labelled as slow.
4. **Verify** — the output is re-analyzed with the same checks and compared to the input: resolved / remaining / newly introduced findings, plus sanity checks (readable, duration, dimensions, track count).
5. **Download** — the result is offered as a normal file download. You can also feed the output back in as the next input.

## Quick start (users)

Open the deployed app (or run it locally, below), drop a file, and follow the steps. Accepted inputs:

| Kind  | Containers / formats              |
| ----- | --------------------------------- |
| Video | MP4, MOV, WebM, MKV               |
| Image | JPEG, PNG, WebP                   |

Size limits in the browser build: video up to 1 GB with the multithreaded core (500 MB in slow mode); files are mounted into ffmpeg without copying where possible, otherwise copied into memory up to 200 MB. Outputs are H.264/AAC MP4, MOV (for faststart/metadata fixes on MOV input), MKV/WebM (metadata strip keeps the wrapper), or JPEG/PNG/WebP for images.

### Browser support

- **Full speed (multithreaded ffmpeg):** any current Chrome, Edge, Firefox or Safari when the page is served with the cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). The dev server and `apps/web/public/_headers` (Cloudflare Pages format) set them.
- **Slow mode:** if `crossOriginIsolated` is false (headers missing, or a browser that does not expose `SharedArrayBuffer`), the app automatically loads the single-threaded core. Everything still works; re-encodes are several times slower and the size cap drops to 500 MB. The engine status in the header says which mode is active.
- **WebP output** depends on the browser's canvas encoder (Safari cannot encode WebP; the option is hidden there).
- The app uses `OffscreenCanvas`, module workers and WebAssembly; browsers older than roughly 2023 are not supported.

## Checks and fixes

Profile: **Web browsers** — accepts MP4/WebM containers, H.264/VP8/VP9/AV1 video, AAC/MP3 (MP4) or Opus/Vorbis (WebM) audio, 8-bit 4:2:0 pixels, JPEG/PNG/WebP images.

### Checks

| Id                        | Kind        | Severity     | What it flags                                              |
| ------------------------- | ----------- | ------------ | ---------------------------------------------------------- |
| `video-codec-unsupported` | video       | error        | Video codec outside the profile (HEVC, ProRes, MPEG-4 …)   |
| `pixfmt-not-yuv420p`      | video       | error        | Pixel format browsers cannot decode (4:2:2, 10-bit …)      |
| `audio-codec-unsupported` | video       | error        | Audio codec not accepted in this container (PCM, AC-3 …)   |
| `container-not-mp4`       | video       | warn         | MOV/MKV wrapper; recommends remux or transcode as needed   |
| `mp4-not-faststart`       | video       | warn         | `moov` after `mdat` — cannot start playing while loading   |
| `odd-dimensions`          | video       | warn         | Odd width/height (breaks 4:2:0 H.264 encoding)             |
| `rotation-metadata`       | video       | warn         | Rotation stored as a tag instead of in the pixels          |
| `fps-vfr`                 | video       | info         | Variable frame rate (no fix offered)                       |
| `audio-missing`           | video       | info         | No audio track (no fix offered)                            |
| `image-orientation-tag`   | image       | warn         | EXIF orientation ≠ 1                                       |
| `image-huge-dimensions`   | image       | warn         | Longest side > 8192 px or > 25 MP                          |
| `png-16bit`               | image       | info         | 16-bit PNG                                                 |
| `ext-mismatch`            | both        | warn         | Extension disagrees with the sniffed format                |
| `metadata-gps`            | both        | warn         | Embedded location (EXIF GPS, ISO 6709 tags)                |
| `metadata-device`         | both        | info         | Camera/device make or model                                |
| `file-size-large`         | both        | info         | > 100 MB video or > 10 MB image                            |

### Fixes

| Id                        | Kind  | Re-encodes | What it does                                                               |
| ------------------------- | ----- | ---------- | -------------------------------------------------------------------------- |
| `remux-mp4`               | video | no         | Stream-copy into MP4 with faststart                                        |
| `faststart`               | video | no         | Rewrite MP4/MOV with the index up front (keeps the wrapper)                |
| `strip-metadata`          | video | no         | Stream-copy, drops all global/stream/chapter metadata (keeps the wrapper)  |
| `transcode-h264-aac`      | video | yes        | libx264 `veryfast`, CRF 20/23/28, yuv420p, even dims, AAC 128k (or copy)   |
| `apply-rotation`          | video | yes        | Same as transcode; ffmpeg autorotate bakes the rotation in                 |
| `audio-to-aac`            | video | audio only | Copy video, encode audio to AAC, MP4 output                                |
| `strip-metadata-lossless` | image | no         | Byte-level removal of EXIF/XMP/COM etc.; pixels and ICC profile untouched  |
| `apply-orientation`       | image | yes        | Rotate pixels per EXIF orientation via canvas, save as JPEG/PNG/WebP       |
| `resize`                  | image | yes        | Scale longest side to 4096/2048/1920 px via canvas                         |
| `convert`                 | image | yes        | Re-save as JPEG/PNG/WebP (8-bit)                                           |

Every ffmpeg command uses `-map 0:v:0 -map 0:a:0?` (one video, at most one audio stream; data/subtitle streams dropped), `-movflags +faststart` for MP4/MOV, and `-max_muxing_queue_size 1024`. Canvas fixes do not carry metadata over (the "Remove metadata" fix is the lossless path).

## Privacy

Files never leave the browser. There is no server component, no analytics, and the Content-Security-Policy in `apps/web/index.html` restricts network access to the app's own origin. The ffmpeg cores are self-hosted, not loaded from a CDN. See [docs/privacy.md](docs/privacy.md) for the full model and how to verify it yourself.

## Licensing

The repository code is MIT. The ffmpeg.wasm cores the web app ships (`@ffmpeg/core`, `@ffmpeg/core-mt` 0.12.10) are published under GPL-2.0-or-later and include libx264. See [LICENSE-NOTES.md](LICENSE-NOTES.md) before redistributing a built copy of the web app.

## Development

Requirements: Node ≥ 22, pnpm 11 (`packageManager` is pinned in `package.json`). A native `ffmpeg`/`ffprobe` is only needed to regenerate fixtures or run the native round-trip script.

```bash
pnpm install
pnpm dev          # copies the ffmpeg cores into apps/web/public/ffmpeg, then starts Vite on :5173
```

| Command           | What it does                                                                  |
| ----------------- | ----------------------------------------------------------------------------- |
| `pnpm dev`        | Dev server with COOP/COEP headers (multithreaded core)                        |
| `pnpm build`      | Type-check and build `apps/web` into `apps/web/dist`                          |
| `pnpm preview`    | Serve the production build locally (same headers)                             |
| `pnpm typecheck`  | `tsc` for every workspace package                                             |
| `pnpm lint`       | Biome (lint + format check)                                                   |
| `pnpm format`     | Biome format, writes changes                                                  |
| `pnpm test`       | Vitest unit tests for `core` and `engine-wasm`                                |
| `pnpm cores`      | Re-copy the pinned ffmpeg cores and regenerate `manifest.json` (sha256)       |
| `pnpm fixtures`   | Regenerate `fixtures/media` + `fixtures/probes` (needs native ffmpeg)         |
| `node scripts/native-roundtrip.test.mjs` | Run every video fix plan through native ffmpeg and verify   |

`pnpm e2e` is wired to Playwright but no `playwright.config.ts` or `tests/e2e/` exist yet (planned).

### Architecture

```
packages/core         Pure TypeScript, no DOM/Node APIs. sniff → normalize → checks → fixes (argv builders,
                      plans, expectations) → verify → estimate → explain (all user-facing copy).
packages/engine-wasm  Browser MediaEngine: FfmpegSession (ffmpeg.wasm 0.12, one session per job,
                      WORKERFS mount with copy fallback), canvas image ops, lossless JPEG/PNG/WebP strippers.
apps/web              React 19 + Vite + Zustand. Stages Drop/Report/Fix/Verify, engine status, command log,
                      Wake Lock + beforeunload guard while a job runs.
fixtures/             Tiny deterministic media files (< 160 KB each) and their ffprobe JSON, used by tests.
scripts/              copy-cores.mjs (self-hosting + manifest), native-roundtrip.test.mjs.
```

`core` never touches the engine directly: checks and fixes are declarative, fixes produce a `FixPlan` (steps + expected outcome), the engine executes it, and `verify()` compares before/after reports. Design rationale is in [docs/decisions.md](docs/decisions.md); adding a check is described in [docs/adding-a-check.md](docs/adding-a-check.md).

## Known limitations

- Only the two headline flows have been smoke-tested in a browser (`fixtures/media/hevc.mov` → H.264 MP4, `fixtures/media/gps.jpg` → lossless strip). Other fixes are unit- and snapshot-tested, and the video ones pass the native ffmpeg round-trip, but have not all been exercised through the UI.
- Re-encoding in WebAssembly is slow: expect roughly real-time or slower for 1080p with the multithreaded core, several times slower in slow mode. Long clips may exhaust wasm memory; the error banner then offers the exact command to run with a native ffmpeg.
- One video and at most one audio stream are kept; subtitles, chapters, extra audio tracks and data streams are dropped by every video fix.
- Video metadata removal is stream-copy based; it removes tags but does not scrub in-stream SEI/user data.
- Image resize/convert/orientation go through the browser canvas: 8-bit output, no metadata carried over, colour management is whatever the browser does.
- The ffprobe exit code from the 0.12 cores is always −1, so probe success is judged from its JSON output.
- The Playwright suite (`pnpm e2e`, Chromium only) covers the three acceptance flows: HEVC transcode, lossless GPS strip, and slow-mode fallback. CI runs typecheck/lint/test/build but not the e2e suite yet; the Cloudflare Pages deploy workflow is skipped until the project secrets and variable are configured.
