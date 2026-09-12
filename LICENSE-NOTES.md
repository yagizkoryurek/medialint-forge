# License notes

This file explains how the MIT license in [LICENSE](LICENSE) relates to the third-party components the web app ships. It describes the facts as they stand in the repository; it is not legal advice. If you plan to redistribute a built copy of the app, review the upstream licenses yourself.

## What is MIT

All code written for this repository: `packages/core`, `packages/engine-wasm`, `apps/web`, `scripts/`, `fixtures/` (generated synthetic media) and the documentation.

`packages/core` has no runtime dependencies. `packages/engine-wasm` depends on `@ffmpeg/ffmpeg` (MIT) and `exifr` (MIT).

## What is not MIT: the ffmpeg.wasm cores

The web app loads pre-built FFmpeg WebAssembly cores at runtime:

| Package            | Version | Declared license (`package.json`) | Copied to                          |
| ------------------ | ------- | --------------------------------- | ---------------------------------- |
| `@ffmpeg/core-mt`  | 0.12.10 | GPL-2.0-or-later                  | `apps/web/public/ffmpeg/core-mt/`  |
| `@ffmpeg/core`     | 0.12.10 | GPL-2.0-or-later                  | `apps/web/public/ffmpeg/core/`     |

These builds include **libx264**, which is GPL-licensed, and FFmpeg itself compiled with `--enable-gpl`. That is why the packages are published under the GPL rather than FFmpeg's default LGPL. The `transcode-h264-aac`, `apply-rotation` and `audio-to-aac` fixes rely on encoders from these cores; the stream-copy fixes and all image fixes do not need libx264, but the same core binary is loaded either way.

The cores are not committed to this repository. `scripts/copy-cores.mjs` copies them from `node_modules` into `apps/web/public/ffmpeg/` (git-ignored) at `predev`/`prebuild` time and writes `manifest.json` with the version and SHA-256 of every file, so a build can be traced to exact upstream artifacts. The hashes for the current pin are recorded in [docs/decisions.md](docs/decisions.md).

## Practical consequences

- Using the app, locally or hosted, imposes no obligations on the user.
- **Distributing a built `apps/web/dist` (or hosting it) means distributing the GPL cores alongside MIT code.** The GPL's terms apply to the cores and, depending on how the combination is viewed, may apply to the distributed bundle as a whole. This project does not make a claim either way; it documents the situation so that anyone deploying it can decide with the facts in front of them.
- The repository source itself (without the cores) is plain MIT and can be reused as such.
- If a GPL-free build is required, the intended route (see `docs/decisions.md`, "post-MVP") is a custom LGPL FFmpeg core without libx264, or a WebCodecs-based encoder. Neither exists in v0.1.

## Attribution

- FFmpeg — https://ffmpeg.org — LGPL-2.1-or-later / GPL-2.0-or-later depending on configuration.
- ffmpeg.wasm (`@ffmpeg/ffmpeg`, `@ffmpeg/core`, `@ffmpeg/core-mt`) — https://github.com/ffmpegwasm/ffmpeg.wasm
- x264 — https://www.videolan.org/developers/x264.html — GPL-2.0-or-later.
- exifr — https://github.com/MikeKovarik/exifr — MIT.
