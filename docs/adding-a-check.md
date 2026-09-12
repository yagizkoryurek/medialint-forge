# Adding a check

A check is a pure, synchronous function that looks at a normalized `MediaReport` and returns zero or more `Finding`s. Everything lives in `packages/core`; no browser or ffmpeg code is involved. This walkthrough adds a hypothetical `audio-too-loud` check as the running example.

## 1. Register the id

`packages/core/src/fixes/ids.ts` holds every check and fix id so checks and fixes can reference each other without importing each other.

```ts
export const CHECK = {
  // …
  audioTooLoud: 'audio-too-loud',
} as const;
```

Ids are kebab-case and stable: they appear in the command log, in tests and in `FixPlan.expected.resolves`.

## 2. Write the wording

All user-facing text lives in `packages/core/src/explain/en.ts`, keyed by the camelCase check name. Each entry returns `title`, `explanation` and `why`:

```ts
audioTooLoud: (peakDb: number) => ({
  title: 'Sound may clip or distort',
  explanation: `The loudest part of the audio reaches ${peakDb.toFixed(1)} dB, above the safe level.`,
  why: (profileName: string) => `Browsers in the "${profileName}" profile do not limit playback volume.`,
}),
```

Rules: the title is one plain-language line; codec names go through `CODEC_NAMES`; anything technical belongs in `evidence`, not in the title.

## 3. Implement the check

Pick the file by media kind: `checks/video.ts`, `checks/image.ts`, or `checks/common.ts` for checks that apply to both. Use `defineCheck`:

```ts
export const audioTooLoud = defineCheck({
  id: CHECK.audioTooLoud,
  kinds: ['video'],
  category: 'integrity', // 'compat' | 'privacy' | 'integrity' | 'size' | 'metadata'
  run(report, { profile }) {
    const a = report.audio[0];
    if (!a || a.peakDb === null || a.peakDb <= -1) return [];
    const copy = en.audioTooLoud(a.peakDb);
    return [
      {
        id: CHECK.audioTooLoud,
        checkId: CHECK.audioTooLoud,
        severity: 'warn', // 'error' blocks playback, 'warn' degrades it, 'info' is advisory
        category: 'integrity',
        title: copy.title,
        explanation: copy.explanation,
        whyItMatters: copy.why(profile.name),
        evidence: { peakDb: a.peakDb },
        fixes: [], // or [{ fixId: FIX.someFix, recommended: true }]
        source: 'probe', // 'sniff' if it only needs the first 64 KB, 'probe' otherwise
      },
    ];
  },
});
```

Guidelines:

- Return `[]` early; never throw. Missing data (`null` fields on the report) means "cannot tell", not "problem".
- `id` normally equals `checkId`. A check that can emit several findings for one file appends a suffix to `id` so `verify()` can match them individually.
- Read thresholds from the `profile` when they are a policy (`profile.maxImageSide`), hard-code them when they are a format fact (even dimensions).
- If the report lacks the field you need, extend the type in `types/report.ts` and populate it in `normalize/fromFfprobe.ts` or `normalize/fromImageProbe.ts`, with a test in `normalize/normalize.test.ts`.

## 4. Add it to the registry

Append to the kind array in the same file (`VIDEO_CHECKS`, `IMAGE_CHECKS`) or to `ALL_CHECKS` in `checks/registry.ts` for common checks. Order matters for display within a severity: compatibility blockers first, then structure, then privacy/size.

## 5. Point a fix at it (optional)

If an existing fix resolves the finding, reference it from `fixes` above **and** add the check id to that fix's `expected.resolves` in `fixes/video.ts` or `fixes/image.ts`. `verify()` only reports "fixed" for ids that the plan promised and that were present before.

If a new fix is needed: add a `FIX` id, an argv builder in `fixes/argv.ts` (snapshot-tested in `fixes/fixes.test.ts`), a `defineFix` entry, and register it in `VIDEO_FIXES` / `IMAGE_FIXES`. Keep the guardrails from `argv.ts` (`-map 0:v:0 -map 0:a:0?`, faststart, mux queue size).

## 6. Test with fixtures

`packages/core/src/checks/checks.test.ts` asserts the exact list of finding ids for every fixture and the recommended fix for each. Add:

- A **positive** case: a fixture that triggers the check. If none of the files in `fixtures/media/` does, add a generation line to `fixtures/generate.sh` (tiny, deterministic, `-fflags +bitexact`), run `pnpm fixtures`, and commit both the media file and the `fixtures/probes/<name>.json` it produces.
- A **negative** case: confirm `h264-ok.mp4` (and any other clean fixture) still returns `[]`.

```ts
it('loud.mp4 → audio too loud', () => {
  const r = videoReport('loud.mp4');
  expect(ids(r)).toEqual([CHECK.audioTooLoud]);
});
```

`videoReport()` from `testing/fixtures.ts` builds the report exactly as the app does (sniff + committed ffprobe JSON). For images, build an `ImageProbeRaw` by hand and pass it through `fromImageProbe`, as the existing image tests do.

## 7. Run the gates

```bash
pnpm typecheck
```

```bash
pnpm lint
```

```bash
pnpm test
```

Then drop the positive fixture into `pnpm dev` and confirm the finding reads well in the Report stage and, if a fix is attached, that Verify reports it as resolved.

## Checklist

- [ ] id in `fixes/ids.ts`
- [ ] wording in `explain/en.ts`
- [ ] `defineCheck` in `checks/{video,image,common}.ts`, registered
- [ ] fix reference + `expected.resolves` updated (if applicable)
- [ ] positive and negative fixture tests
- [ ] README check table updated
- [ ] gates green
