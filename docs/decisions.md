# Design decisions

Short records of the choices that shape v0.1 and why. Each entry states the decision, the reason, and what would make us revisit it.

## D1 — Everything runs in the browser; there is no server

**Decision.** Analysis, ffmpeg, image processing and verification run inside the tab. The deployable artifact is static files.

**Why.** Media files are often private (personal video, photos with location). A server would need to receive them. Local processing also removes upload time, cost and abuse handling.

**Revisit if.** Never for the core promise. A "run this natively" export exists instead (the error banner offers the exact ffmpeg command).

## D2 — Three packages: `core` (pure), `engine-wasm` (browser), `web` (UI)

**Decision.** `packages/core` contains sniffing, normalization, checks, fixes, verification and all user-facing copy; it has no DOM or Node dependencies (`lib: ["ES2022"]`, `types: []`). `packages/engine-wasm` implements the `MediaEngine` interface (`probe`, `run`, `cancel`, `caps`) on ffmpeg.wasm and canvas. `apps/web` only orchestrates.

**Why.** Checks and fix plans are the part worth testing exhaustively and they should not need a browser to test. The engine interface also leaves room for a native or WebCodecs engine later.

## D3 — Fixes are declarative plans with an expected outcome

**Decision.** A fix produces a `FixPlan`: ordered steps (ffmpeg argv or an image op), an output name, and `expected` (which check ids it should resolve, duration delta, dimensions, stream counts). `verify()` re-runs the checks on the output and compares against the plan.

**Why.** It makes "did the fix work?" a mechanical question and it makes every ffmpeg invocation snapshot-testable. The `scripts/native-roundtrip.test.mjs` script proves the plans against a native ffmpeg without ffmpeg.wasm.

## D4 — One profile in v0.1: *Web browsers*

**Decision.** `profiles/web-browsers.ts` is the only profile: MP4/WebM, H.264/VP8/VP9/AV1, AAC/MP3 in MP4, Opus/Vorbis in WebM, 8-bit 4:2:0. The profile type supports more, but nothing selects between them yet.

**Why.** "Will this play in a browser?" is the question the MVP answers. Deliberately conservative; AV1 is accepted because current browsers decode it in software.

## D5 — ffmpeg.wasm 0.12 cores, self-hosted, pinned with hashes

**Decision.** `@ffmpeg/ffmpeg` 0.12.15 with `@ffmpeg/core-mt` and `@ffmpeg/core` 0.12.10. `scripts/copy-cores.mjs` copies them from `node_modules` to `apps/web/public/ffmpeg/` on `predev`/`prebuild` and writes `manifest.json` with SHA-256 per file. The cores are git-ignored; the manifest is regenerated on every copy.

Hashes for the current pin (0.12.10, ESM builds):

| File                             | SHA-256                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `core-mt/ffmpeg-core.js`         | `270a2e6ff945e173238610669a3f7132df5f9c52698a9bf708cf5c2ab6bda0de` |
| `core-mt/ffmpeg-core.wasm`       | `be2c97605366b78f3f13e21b52e81a55a79e1f29c133b03a68ec187b1a2ec41a` |
| `core-mt/ffmpeg-core.worker.js`  | `f77898d631dc010b45c29c23cb4379c611a7d7b131bf591d08a656bb729a4ca3` |
| `core/ffmpeg-core.js`            | `67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3` |
| `core/ffmpeg-core.wasm`          | `9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7` |

**Why.** No CDN at runtime (privacy, CSP `'self'`), reproducible builds, and a way to audit exactly which binary users run.

**Licensing.** Both cores are published as GPL-2.0-or-later and include libx264. The repository code is MIT. This is documented in `LICENSE-NOTES.md`; the `core` package stays GPL-free. Post-MVP options: a custom LGPL core without libx264, or WebCodecs for encoding.

## D6 — Copy the ESM core build, not the UMD one

**Decision.** `copy-cores.mjs` resolves the package with CommonJS `require.resolve` (which follows the `"require"` export condition to `dist/umd/`) and then steps over to the sibling `dist/esm/`.

**Why.** `@ffmpeg/ffmpeg` 0.12 loads the core inside a module worker with a dynamic `import(coreURL)` and reads `.default`. The UMD build has no default export, which surfaces as `ERROR_IMPORT_FAILURE` / "failed to import ffmpeg-core.js". Found during the first browser smoke test.

## D7 — ffprobe success is judged by its JSON, not its exit code

**Decision.** `WasmEngine.probe()` parses ffprobe's stdout and treats the run as successful when the JSON has a `format` or `streams` key. The exit code is ignored.

**Why.** In the 0.12.10 cores `ffprobe()` always returns −1: the wrapper resets the code to −1 and the real return path is swallowed by an `Aborted()` exit. `ffmpeg exec()` codes are correct and are still checked. Found during the first browser smoke test; without this every probe failed.

**Revisit if.** A core release fixes the exit code — the JSON check can stay as a belt-and-braces guard.

## D8 — Multithreaded core when cross-origin isolated, single-threaded fallback otherwise

**Decision.** `canUseThreads()` checks `crossOriginIsolated && SharedArrayBuffer`. `vite.config.ts` and `public/_headers` set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Without isolation the app loads `@ffmpeg/core` and reports "slow mode"; the input cap drops from 1 GB to 500 MB.

**Why.** libx264 in wasm is only usable with threads. The fallback keeps the app functional on hosts that cannot send the headers rather than failing outright.

## D9 — One ffmpeg session per job; one long-lived session for probes

**Decision.** `FfmpegSession` wraps a single `FFmpeg` instance. Each fix job gets a fresh session that is terminated afterwards; probing reuses one session, which is dropped and reloaded after a wasm trap.

**Why.** A wasm trap or a cancel leaves the instance in an unknown state; a fresh session per job means a failure can never poison the next one. Cancel is implemented as `terminate()`.

## D10 — WORKERFS mount first, heap copy only below 200 MB

**Decision.** `attachInput()` mounts the `File` into ffmpeg's virtual FS (no copy). If mounting fails it copies the bytes into the wasm heap, but only for inputs ≤ 200 MB; larger files error out with a clear message.

**Why.** Copying a large file into the heap doubles memory and is the usual cause of "memory access out of bounds". The mount path avoids it entirely.

## D11 — Every video fix keeps exactly one video and at most one audio stream

**Decision.** All argv builders use `-map 0:v:0 -map 0:a:0? -dn -sn`, `-movflags +faststart` for MP4/MOV, and `-max_muxing_queue_size 1024`.

**Why.** Extra streams (timecode, data, subtitles, second audio) routinely break stream-copy into MP4 and are irrelevant to web playback. The fixed mapping makes the `expected.streams` check in `verify()` deterministic. The trade-off (dropping extra tracks) is stated in the README.

## D12 — Faststart and metadata strip keep the source wrapper

**Decision.** `faststart` outputs MOV for MOV input (MP4 otherwise); `strip-metadata` keeps MP4/MOV/MKV/WebM as-is. Only `remux-mp4` and the transcodes change the container.

**Why.** ProRes and PCM are legal in MOV but not in MP4; a metadata fix must not turn into a failed remux. Container changes are a separate, explicit fix.

## D13 — `apply-rotation` re-encodes and relies on ffmpeg autorotate

**Decision.** Rather than a `transpose` filter, the rotation fix uses the same H.264 transcode as `transcode-h264-aac` (quality `high`); ffmpeg's default autorotate bakes the display-matrix rotation into the pixels and clears the tag. Expected dimensions are swapped for 90°/270°.

**Why.** One well-tested argv path instead of two; autorotate handles all four rotations and the matrix edge cases.

## D14 — Image fixes: lossless byte-level strippers, canvas for everything else

**Decision.** `strip-metadata-lossless` rewrites JPEG/PNG/WebP at the segment/chunk level: EXIF/XMP/IPTC/COM/MPF are dropped, ICC profiles (`APP2 ICC_PROFILE`, `iCCP`, `ICCP`), JFIF/Adobe markers and rendering-relevant PNG chunks are kept, and compressed image data is copied byte-for-byte. Orientation, resize and convert decode with `createImageBitmap(…, { imageOrientation: 'none' })`, apply the EXIF orientation themselves, and encode via `OffscreenCanvas` on the main thread.

**Why.** Metadata removal should never touch pixels or shift colours; going through ffmpeg would re-encode JPEGs. Canvas is the only encoder available without shipping more wasm; it does not carry metadata, which for these fixes is acceptable and is stated in the fix description. WebP encoding is feature-detected (Safari lacks it) and hidden when unavailable.

**Revisit if.** Large images make the main thread janky — the ops are self-contained and could move to a worker.

## D15 — Strict CSP with `connect-src 'self'`

**Decision.** `index.html` carries a meta CSP: scripts only from self (plus `'wasm-unsafe-eval'`), workers from self/blob, media and images from self/blob/data, `connect-src 'self'`, no objects, no form actions.

**Why.** It turns the "no uploads" promise into something the browser enforces. Consequence worth knowing: `fetch()` of a `blob:` URL is blocked, so downloads go through `<a download>` and test harnesses must read Blobs from the store rather than fetching them.

## D16 — Findings are sorted by severity, then registry order

**Decision.** `runChecks()` orders results error → warn → info and, within a severity, by the order in `ALL_CHECKS` (compatibility blockers, then structure, then privacy/size). Fix offers are aggregated per fix id across findings (`fixOffers`), with the worst severity and any `recommended` flag winning.

**Why.** The first thing on screen should be the thing that stops playback, and one fix that resolves three findings should appear once.
