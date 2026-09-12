# Contributing

Thanks for looking at MediaLint Forge. This page covers the local setup, the gates every change must pass, and where things live.

## Setup

- Node ≥ 22 and pnpm 11 (`corepack enable` picks up the pinned version from `package.json`).
- `pnpm install`
- `pnpm dev` — copies the ffmpeg cores into `apps/web/public/ffmpeg/` (git-ignored) and starts Vite at http://localhost:5173 with the COOP/COEP headers needed for the multithreaded core.
- A native `ffmpeg`/`ffprobe` is only needed for `pnpm fixtures` and `scripts/native-roundtrip.test.mjs`.

## Gates

Run all three before opening a pull request; they must be green:

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

`pnpm format` applies Biome formatting. The TypeScript config is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) — prefer fixing the type over casting.

If a change touches ffmpeg argv builders or fix plans, also run the native round-trip:

```bash
node scripts/native-roundtrip.test.mjs
```

Finally, smoke-test the affected flow in the browser with the fixtures under `fixtures/media/` (`hevc.mov` and `gps.jpg` cover the two main paths).

## Where things live

| Area                               | Path                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| Format sniffing                    | `packages/core/src/sniff/`                               |
| ffprobe / image probe → report     | `packages/core/src/normalize/`                           |
| Checks                             | `packages/core/src/checks/` (see `docs/adding-a-check.md`) |
| Fixes, argv builders, naming       | `packages/core/src/fixes/`                               |
| User-facing wording                | `packages/core/src/explain/en.ts`                        |
| Verification and estimates         | `packages/core/src/verify/`, `packages/core/src/estimate/` |
| Compatibility profile              | `packages/core/src/profiles/web-browsers.ts`             |
| ffmpeg.wasm session and engine     | `packages/engine-wasm/src/`                              |
| Image canvas ops and strippers     | `packages/engine-wasm/src/image/`, `packages/engine-wasm/src/strip/` |
| Web app stages, store, services    | `apps/web/src/`                                          |
| Test media and probes              | `fixtures/`                                              |

## Rules of thumb

- `packages/core` must stay free of DOM and Node APIs. It is the part that is easy to test and easy to reuse.
- Every check needs a positive and a negative fixture test; every argv builder change updates the snapshot in `packages/core/src/fixes/__snapshots__/` deliberately.
- All wording shown to users goes through `explain/en.ts`. Titles are plain language; jargon belongs in `evidence`.
- Keep fixtures tiny (< 200 KB) and deterministic. Regenerate with `pnpm fixtures` and commit both the media and the probe JSON.
- Do not add runtime network calls. The app's Content-Security-Policy (`apps/web/index.html`) is `connect-src 'self'`, and `docs/privacy.md` promises no uploads; a change that needs the network needs a discussion first.
- Do not bump `@ffmpeg/core*` without regenerating `manifest.json` (`pnpm cores`), updating the hashes in `docs/decisions.md` and re-running the browser smoke tests. The core's behaviour has quirks the engine relies on (see `docs/decisions.md`).

## Commits and pull requests

- Conventional-style subjects (`feat:`, `fix:`, `docs:`, `chore:`, `test:`).
- One logical change per PR; fill in the PR template.
- Bug reports: use the issue template and, when possible, attach a small file that reproduces the problem or describe how to generate one with ffmpeg.
