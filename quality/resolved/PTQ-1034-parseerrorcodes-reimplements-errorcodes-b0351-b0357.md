---
id: PTQ-1034
title: b0351live and b0357 each redeclare a local parseErrorCodes helper instead of importing the canonical errorCodes from tests/helpers/e2e-s1.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:122-128
  - tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:125-130
  - tests/helpers/e2e-s1.ts:273-275
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0351live and b0357 each redeclare a local parseErrorCodes helper instead of importing the canonical errorCodes from tests/helpers/e2e-s1.ts

## Observation
`tests/helpers/e2e-s1.ts` exports `errorCodes(thetaText, thetaPath)`, the
"error-severity load/parse codes `parseDoc` attributes to one source, sorted."
Both `b0351live-value-position-query-success-binds.test.ts` and
`b0357-doc-comment-anchor-registration.test.ts` import `parseDoc` (and, in
b0357's case, also `errors`) from that same module, but each declares its own
module-scope `parseErrorCodes(thetaText, thetaPath)` function whose body
reproduces `errorCodes`'s own composition instead of importing it. A prior
finding (PTQ-0486, fixed) migrated eight sibling `tests/live/acceptance` files
off this exact local-function shape but explicitly listed these same two files
as outside its scope, so the local copies never moved.

## Evidence

`tests/live/acceptance/b0351live-value-position-query-success-binds.test.ts:122-128`:
```ts
/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return parseDoc(thetaText, thetaPath)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code)
    .sort();
}
```
This body is byte-for-byte the same four-statement chain as the canonical
export below; the file's own import line 68 is `import { parseDoc } from
"../../helpers/e2e-s1";` — `errorCodes` is available from the same module and
is not imported.

`tests/live/acceptance/b0357-doc-comment-anchor-registration.test.ts:125-130`:
```ts
/** Error-severity diagnostic codes from a parse-only run, sorted for readable failures. */
function parseErrorCodes(thetaText: string, thetaPath: string): string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics)
    .map((d) => d.code)
    .sort();
}
```
This file's import line 66 is `import { parseDoc, errors } from
"../../helpers/e2e-s1";` — it already imports both primitives `errorCodes` is
built from (`errors` + `parseDoc`) and composes them locally instead of
importing `errorCodes` itself.

`tests/helpers/e2e-s1.ts:273-275` — the canonical export both files re-derive:
```ts
export function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  return errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) => d.code).sort();
}
```

Exact search and hit count: `grep -n "^function parseErrorCodes" tests/live/acceptance/*.test.ts` returns 3 hits: the two cited above plus `b0307live-value-position-query-err-binds.test.ts:120` (outside this review's briefed scope, named only as corroborating pattern context, not as a filed site).

## Why this is a problem
Both files already import the module that exports `errorCodes` under the
identical `(thetaText, thetaPath) => readonly string[]`/`string[]` signature
and identical parse→filter→map→sort composition, yet each retypes the body by
hand under a locally-scoped name. A change to how these attribution guards
should classify diagnostic codes (e.g. widening severity, changing the sort
key) landing in the canonical `errorCodes` would not reach either local copy,
and a change made to one local copy would not reach the other or the
canonical export, since none of the three shares a definition.

## Suggested direction (non-binding, optional)
Both files' own import lines already reach `tests/helpers/e2e-s1.ts`, which
already exports `errorCodes` under the exact signature each local function
reproduces — the natural existing home this duplication already sits beside.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); the
  duplicated function is harness plumbing, not a pinned count or inventory.
- Recording-double check: `parseErrorCodes` performs no recording and backs
  no "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -m1 -i status docs/bugs/0351*.md
  docs/bugs/0357*.md` shows both reported fixed; neither is a documented
  correct-reason red, and this finding does not touch either file's
  assertions or dispositions.
- coverage-matrix/bug-doc citation search: `grep -n "b0351live\|b0357-doc-comment-anchor" docs/reference/coverage-matrix.md` returns 0 hits. This finding
  proposes no merge, rename, or deletion of any file or `it()`/`describe()`
  cell — only that the local `parseErrorCodes` copies could import the
  existing shared definition.
- Coverage-drift check: this finding is about a repeated harness-support
  function definition that exists and runs identically (functionally) in both
  files; it makes no claim that any path or behaviour is untested.
- Live-suite posture check: this is not about the live-host
  `failLoudly`/skip posture (each file's own `requireLiveHost()` precondition
  is separate, correct, and unaffected) — the finding is scoped to the
  offline `parseErrorCodes` helper alone, which runs before any live host is
  required.
- Prior-finding overlap check: resolved `PTQ-0486` fixed the same shape for
  eight OTHER files and its own evidence explicitly excludes
  `b0351live-value-position-query-success-binds.test.ts` and
  `b0357-doc-comment-anchor-registration.test.ts` as "outside this brief's
  reviewed file list … not as part of this finding's count" — confirming
  these two copies were never migrated by that fix. No open/intake finding
  names either file for this shape.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: both excerpts reproduce at :123-128 (b0351, inline `.filter(severity==="error")`) and :126-130 (b0357, `errors(...)`), each a functionally identical restatement of `errorCodes` at tests/helpers/e2e-s1.ts:273-275; both files import from that very module (b0351 `parseDoc`, b0357 `parseDoc, errors`) without importing `errorCodes`; both local copies are live (b0351 :138/:142, b0357 :144, all `.toEqual([])`/`.not.toContain` consumers that accept `readonly string[]`); `grep -n "^function parseErrorCodes" tests/live/acceptance/*.test.ts` → exactly 3 hits (b0307/b0351/b0357) as stated, while the 8 files PTQ-0486 (fixed) migrated now all use `import { errorCodes as parseErrorCodes }` and PTQ-0486:49 explicitly names b0307/b0351/b0357 as outside its count — so not a duplicate (PTQ-0756/0256 cover b0297/b0298/b0301 and tests/b04xx files respectively; no open row names these two); carve-outs hold (no gate file, no recording double, docs/bugs 0351/0357 both status fixed, 0 coverage-matrix hits, requireLiveHost posture untouched); D7 boilerplate-duplication with the mechanical fix already demonstrated by PTQ-0486's eight siblings — fixer note: b0307live-value-position-query-err-binds.test.ts:120 is the same unmigrated shape and should be swept in the same pass (triage: claude-fable-5-1)
