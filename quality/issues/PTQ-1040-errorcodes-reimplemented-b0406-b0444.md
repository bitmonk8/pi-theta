---
id: PTQ-1040
title: b0406live and b0444live each redeclare a byte-identical errorCodes helper instead of importing the canonical export from tests/helpers/e2e-s1.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:136-142
  - tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:140-146
  - tests/helpers/e2e-s1.ts:273-275
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0406live and b0444live each redeclare a byte-identical errorCodes helper instead of importing the canonical export from tests/helpers/e2e-s1.ts

## Observation
Both `b0406live-object-param-system-interp-registration.test.ts` and
`b0444live-array-union-element-system-interp.test.ts` declare their own
module-scope `errorCodes(thetaText, thetaPath)` function — parse with
`parseDoc`, filter to error severity, map to `.code`, sort — under the SAME
name as the canonical `errorCodes` already exported by
`tests/helpers/e2e-s1.ts`, which both files already import `parseDoc` from. A
prior finding (PTQ-0756, fixed) migrated three sibling files off this exact
shape and its own evidence section explicitly named these two files as
"outside this review's scope, cited only as corroborating pattern context,
not as filed sites" — so the local copies in these two files were never
migrated.

## Evidence

`tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:136-142`:
```ts
/** The error-severity load/parse codes `parseDoc` attributes to one source. */
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}
```

`tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:140-146` — byte-identical:
```ts
/** The error-severity load/parse codes `parseDoc` attributes to one source. */
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}
```

Both files' own import lines already reach the module hosting the export
this shadows — `b0406live:79` and `b0444live:72` are each
`import { parseDoc } from "../../helpers/e2e-s1";`.

`tests/helpers/e2e-s1.ts:273-275` — the canonical export both local functions
reproduce under the identical name and signature:
```ts
export function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) => d.code).sort();
}
```

Exact search: `grep -n "^function errorCodes(thetaText" tests/live/acceptance/*.test.ts` returns exactly these 2 hits (the b0297live/b0298live/b0301live siblings that PTQ-0756 already migrated no longer match this pattern).

## Why this is a problem
Each file locally shadows the exact name and signature of an export it
already has the import line for, differing from the canonical body only by
an explicit `Diagnostic` type annotation on the callback parameters. A change
to how these attribution guards should classify diagnostic codes landing in
the canonical `errorCodes` would not reach either local copy, and the two
local copies themselves could silently diverge from one another with nothing
surfacing the drift, since neither imports the other or the shared
definition.

## Suggested direction (non-binding, optional)
Both files' own import lines already reach `tests/helpers/e2e-s1.ts`, which
already exports `errorCodes` under the exact name and signature each local
function reproduces — the natural existing home this duplication already
sits beside.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin;
  the duplicated function is harness plumbing, not a pinned count or
  inventory.
- Recording-double check: `errorCodes` performs no recording and backs no
  "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -m1 -i status docs/bugs/0406*.md
  docs/bugs/0444*.md` shows both reported fixed; neither is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0406live\|b0444live" docs/reference/coverage-matrix.md` returns 0 hits.
  This finding proposes no merge, rename, or deletion of any file or
  `it()`/`describe()` cell — only that the local `errorCodes` copies could
  import the existing shared definition.
- Coverage-drift check: this finding is about a repeated harness-support
  function definition that exists and runs identically in both files; it
  makes no claim that any path or behaviour is untested.
- Live-suite posture check: this is not about the live-host
  `failLoudly`/skip posture (each file's own `requireLiveHost()` precondition
  is separate, correct, and unaffected) — the finding is scoped to the
  offline `errorCodes` helper alone, which runs before any live host is
  required.
- Prior-finding overlap check: resolved `PTQ-0756` fixed the same
  byte-identical-body/same-name shape for three OTHER files
  (b0297live/b0298live/b0301live) and its own Evidence section states its
  5-hit search "returns 5 hits… the three in scope above, plus
  tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:137
  and tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:141
  (outside this review's scope, cited only as corroborating pattern context,
  not as filed sites)" — confirming these two copies were left unmigrated by
  that fix. No open/intake finding names either file for this shape.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: `grep -n "^function errorCodes(thetaText" tests/live/acceptance/*.test.ts` returns exactly the 2 stated hits (b0406live:137, b0444live:141), a mktemp sed-range diff of :136-142 vs :140-146 is empty (byte-identical), both copies are live (2 attribution-guard calls each at :155/:167 and :160/:178), both files import only `parseDoc` from `../../helpers/e2e-s1` (:79/:72) whose `export function errorCodes(thetaText, thetaPath)` (e2e-s1.ts:273-275) has the identical name, signature and semantics (`errors(...).map(code).sort()`) and is already imported by 11 sibling live files, so the fix is a mechanical import swap; all 3 locations are under tests/, neither file is a gate/pin test or recording double, docs/bugs 0406/0444 are both `Status: fixed`, coverage-matrix grep → 0, failLoudly posture untouched; not a duplicate — resolved PTQ-0756 covered b0297live/b0298live/b0301live and its own Evidence excluded these two sites as "not as filed sites", PTQ-0256/PTQ-0486 cover differently-named/signatured helpers in other files, no open quality/issues row names either file for this helper, and the same-wave intake siblings d7-01 (b0351/b0357 `parseErrorCodes`) and d7-04 (b0422/b0445 `probeErrorCodes`) cite disjoint files (triage: claude-fable-5-1)
