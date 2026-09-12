## What

<!-- One paragraph: what changes and why. Link the issue if there is one. -->

## Type

- [ ] New check / fix
- [ ] Bug fix
- [ ] Engine / ffmpeg.wasm change
- [ ] Web UI
- [ ] Docs / tooling

## Checks

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] Snapshot changes in `packages/core/src/fixes/__snapshots__/` are intentional and explained below
- [ ] New/changed checks have positive and negative fixture tests
- [ ] No new runtime network access (CSP `connect-src 'self'`, see `docs/privacy.md`)
- [ ] User-facing wording goes through `packages/core/src/explain/en.ts`
- [ ] README / docs updated if checks, fixes, formats or limits changed

## Browser smoke test

<!-- Which fixture(s) you ran through Analyze → Fix → Verify → Download, in which browser, and whether the engine was multithreaded or in slow mode. -->

## Notes for the reviewer

<!-- Trade-offs, follow-ups, anything surprising. -->
