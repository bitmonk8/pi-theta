# Bug 0336 — A comment inside the line-pinned live-production-acceptance test file cites `resolveEnumVariant` at `src/runtime/lexical-environment.ts:526`, but that method now sits at `:671`; the cited line holds an unrelated local-slot lookup in `resolve`

- **Status:** open.
- **Sev/Diff estimate:** S4/D1 — S4: comment-only citation drift in a test
  file; no assertion, gate, or runtime behaviour depends on it. D1: a
  single-token edit inside one comment, executed under the file's 14864-line
  pin with no line-count change.
- **Kind:** defect — stale `path:line` citation.
- **Affected:** `tests/live/live-production-acceptance.test.ts:8234` (comment
  inside the bug-0185 cell narration). The cited target is
  `src/runtime/lexical-environment.ts`.
- **Observed at:** HEAD `52712fb3`, v0.294.0.

## Summary

The bug-0185 cell's explanatory comment inside
`tests/live/live-production-acceptance.test.ts` cites `resolveEnumVariant` at
`src/runtime/lexical-environment.ts:526`. The `resolveEnumVariant` method
definition is at `:671` at HEAD (returns `undefined` at `:674`). Line `:526`
holds a local-slot lookup inside the unrelated `resolve` method. The file is
line-pinned at exactly 14864 lines; multiple bug docs cite into it by line, so
the correction is a same-line-count comment edit.

## Reproduction

```
grep -n ':526' tests/live/live-production-acceptance.test.ts
#   8234:// (src/runtime/lexical-environment.ts:526) answered `undefined`, the pure

grep -n 'resolveEnumVariant' src/runtime/lexical-environment.ts
#   671:  public resolveEnumVariant(enumName: string, variant: string): ...

sed -n '526p' src/runtime/lexical-environment.ts
#   const slot = env.locals.get(name);   ← inside resolve(), unrelated

wc -l tests/live/live-production-acceptance.test.ts
#   14864
```

## Expected behaviour

The comment cites the line where `resolveEnumVariant` is defined, so a reader
following the citation lands on the method the sentence names.

## Actual behaviour / root cause

The comment cites `:526`. That line holds `const slot = env.locals.get(name);`
inside `resolve`. `resolveEnumVariant` is defined at `:671` and returns
`undefined` at `:674`. The citation was correct when the bug-0185 cell was
written and drifted as `src/runtime/lexical-environment.ts` grew — most
recently past bug 0303's changes (v0.291.0), which is why the value is stale by
more than the earlier residual note recorded (that note proposed `:582`, itself
now stale).

## Why it matters

A reader following the citation lands on unrelated code. The file is
line-pinned at 14864 lines and edited only under that pin, so the drift
persists until a run permitted to touch the file corrects it in place.

## Fix

In `tests/live/live-production-acceptance.test.ts` at `:8234`, replace
`src/runtime/lexical-environment.ts:526` with
`src/runtime/lexical-environment.ts:671` (the `resolveEnumVariant` definition;
returns `undefined` at `:674`). This is a same-line-count comment edit: hold
the file at 14864 lines (`wc -l` 14864 before and after), change no assertion,
fixture, or code. Re-derive the target line at fix time — the method may drift
again before this lands.

This edit folds into any future batch permitted to touch
`tests/live/live-production-acceptance.test.ts` under the line-14864 pin
(e.g. the precedent runs recorded in
`./0286-live-cell-89-drive-discriminator-answers-intermediate-value.md` §Fix
and `./0287-driveslash-whole-drive-text-accumulator-drops-a-later-turns-stream.md`);
no separate run is required if one is already open on the file.

## Provenance

Surfaced by residual R2 of `.pi/tmp/fixes/0305-report.md`, which recorded a
stale `:526` cite in the rider-forbidden live-acceptance file and proposed
`:582`. Re-derived at HEAD `52712fb3` (v0.294.0): the method is at `:671`, so
the report's proposed value is itself stale after bug 0303 (v0.291.0). All
citations in this report verified by `grep`/`sed`/`Read` at HEAD offline. No
live test was run.
