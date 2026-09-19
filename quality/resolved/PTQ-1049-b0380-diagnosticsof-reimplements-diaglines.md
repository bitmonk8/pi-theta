---
id: PTQ-1049
title: b0380's local diagnosticsOf reimplements the canonical diagLines export from tests/helpers/e2e-s1.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0380-params-key-not-identifier-load-refusal.test.ts:133-141
  - tests/helpers/e2e-s1.ts:289-292
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# b0380's local diagnosticsOf reimplements the canonical diagLines export from tests/helpers/e2e-s1.ts

## Observation
`tests/helpers/e2e-s1.ts` exports `diagLines(doc)`, documented as "Every
diagnostic rendered `<severity> <code>: <message>`, in emission order."
`tests/live/acceptance/b0380-params-key-not-identifier-load-refusal.test.ts`
imports `parseDoc` from that same module but declares its own
`diagnosticsOf(text, path)` function whose map body is the identical
`` `${d.severity} ${d.code}: ${d.message}` `` template, composed by hand from
`parseDoc(text, path).diagnostics` instead of by calling
`diagLines(parseDoc(text, path))`.

## Evidence

`tests/live/acceptance/b0380-params-key-not-identifier-load-refusal.test.ts:133-141`:
```ts
/** Render one source's parse diagnostics as `severity code: message` strings. */
function diagnosticsOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}

/** Codes only, for the attribution guard. */
function codesOf(text: string, path: string): readonly string[] {
  return parseDoc(text, path).diagnostics.map((d) => d.code);
}
```

`tests/helpers/e2e-s1.ts:289-292` — the canonical export whose body
`diagnosticsOf` reproduces once `parseDoc`'s result is substituted in:
```ts
/** Every diagnostic rendered `<severity> <code>: <message>`, in emission order. */
export function diagLines(doc: ThetaDocument): string[] {
  return doc.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`);
}
```

The file's own import line (line 62) is
`import { parseDoc } from "../../helpers/e2e-s1";` — `diagLines` is exported
from the same module and is not imported.

## Why this is a problem
`diagnosticsOf(text, path)` is exactly `diagLines(parseDoc(text, path))`
written out by hand instead of composed from the two primitives (`parseDoc`,
already imported, and `diagLines`, available from the same import site). The
file's own attribution-guard message at line 151 depends on `diagnosticsOf`'s
output format staying byte-for-byte in sync with `diagLines`'s; a future
change to the canonical rendering (e.g. adding a source-path prefix) would
not reach this file's local copy, and nothing here would surface the drift.

## Suggested direction (non-binding, optional)
The file's own import line already reaches `tests/helpers/e2e-s1.ts`, which
already exports `diagLines` under the identical rendering the local
`diagnosticsOf` reproduces — the natural existing home this duplication
already sits beside.

## False-positive check
- Gate-pin check: the file does not match `*gate*.test.ts` or its named kin;
  `diagnosticsOf` is harness plumbing, not a pinned count or inventory.
- Recording-double check: `diagnosticsOf` performs no recording and backs no
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -m1 -i status docs/bugs/0380*.md` shows
  the bug reported fixed; the file is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0380-params-key-not-identifier" docs/reference/coverage-matrix.md`
  returns 0 hits. This finding proposes no merge, rename, or deletion of the
  file or its `it()`/`describe()` cell — only that the local `diagnosticsOf`
  helper could be composed from the existing shared `diagLines` export.
- Coverage-drift check: this finding is about a repeated rendering-helper
  definition that exists and runs in the file at HEAD; it makes no claim
  that any path or behaviour is untested.
- Live-suite posture check: this is not about the live-host
  `failLoudly`/skip posture (the file's own `requireLiveHost()` precondition
  is separate, correct, and unaffected) — the finding is scoped to the
  offline `diagnosticsOf` reader alone, which runs before any live host is
  required.
- Prior-finding overlap search: `grep -rl "b0380-params-key-not-identifier"
  quality/issues quality/resolved` returns only the unrelated, already-fixed
  `PTQ-0480-live-host-precondition-guard-duplicated.md`; no open/resolved/
  intake finding cites this file's `diagnosticsOf`/`codesOf` pair.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: b0380:133-141 `diagnosticsOf` carries the byte-identical `${d.severity} ${d.code}: ${d.message}` map over `parseDoc(text, path).diagnostics` and tests/helpers/e2e-s1.ts:289-292 exports `diagLines(doc)` with that exact body; the file's sole e2e-s1 import (:62) names `parseDoc` only, and the local copy is live (3 callers :151/:154/:158, the :151 attribution message depending on its rendering); all locations under tests/, boilerplate-duplication class, not a gate file, no recording double, no cell merge/rename/delete (bug 0380 status fixed, coverage-matrix 0 hits), failLoudly posture untouched; not a duplicate — the candidate's overlap grep actually returns four resolved rows (PTQ-0246/0377/0386/0480), none touching diagnosticsOf/diagLines, and open PTQ-0755/0759 neither list b0380 nor mention e2e-s1/diagLines (their root cause is a missing shared offender/probe/clean harness, whereas this is an existing export not imported), matching the confirmed per-file precedent PTQ-0770/0865/0869/0877/0981/0996/0802; fixer notes: the same-wave d7-01 triage flagged b0380's mkdtemp/spawn/rmSync shell for fold-in to 0755/0759 (separate from this row), and the sibling local `codesOf(text, path)` at :139-141 is likewise signature-identical to e2e-s1.ts:224 `export function codesOf(src, path)` (triage: claude-fable-5-1)

## Fix attempts
- qw20260918202006: skipped — [PTQ-1024-clean-stem-vacuity-guard-quadruplicated.md] PTQ-1024: Shared the clean fixture and registration guard across all five files, including b0267. Assertions preserved; required gate and affected live tests passed. / PTQ-1048: Shared chain-source builders and driven-turn assertions across three files. Fixture bytes and test names preserved; required gate and affected live tests passed. / PTQ-1034: Replaced local helpers in b0351, b0357, and triage-added b0307 with canonical errorCodes imports. Assertions unchanged; required gate and affected live tests passed. / PTQ-1040: Replaced both local helpers with canonical errorCodes imports and removed orphaned Diagnostic imports. Assertions unchanged; required gate and affected live tests passed. Overall verification: TypeScript, 687 offline files (11,569 tests), and all 10 affected live files passed. No tests deleted. ||
