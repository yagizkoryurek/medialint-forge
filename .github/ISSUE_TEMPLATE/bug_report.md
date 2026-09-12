---
name: Bug report
about: Something analyzed, fixed or verified incorrectly, or the app errored
title: ''
labels: bug
assignees: ''
---

## What happened

<!-- One or two sentences. -->

## Steps to reproduce

1. Open the app (URL or `pnpm dev`)
2. Drop `…`
3. Choose fix `…`
4. …

## Expected

## Actual

## The file

MediaLint Forge never uploads your file, so we cannot see it. Please either:

- attach a small file that reproduces the problem (no personal content — the app shows GPS/device metadata for a reason), or
- paste an `ffmpeg` command that generates one (see `fixtures/generate.sh` for examples), or
- paste the relevant lines from the **command log** (header → "Command log"): the `[sniff]`, `ffprobe …`, `[checks]` and `[verify]` lines, and any `ffmpeg …` command plus the error output.

```
(command log here)
```

## Environment

- Browser and version:
- OS:
- Engine status shown in the header (e.g. "ffmpeg ready (multithreaded)" or "slow mode"):
- Hosted URL or local `pnpm dev`:
