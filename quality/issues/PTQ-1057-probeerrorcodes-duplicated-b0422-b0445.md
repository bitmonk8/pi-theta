---
id: PTQ-1057
title: probeErrorCodes is declared byte-identically in both b0422live and b0445live with no shared tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:250-256
  - tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:202-208
sites: 2                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# probeErrorCodes is declared byte-identically in both b0422live and b0445live with no shared tests/helpers/ home

## Observation
Both `b0422live-imported-schema-system-interp-wire-and-refusal.test.ts` and
`b0445live-imported-array-element-system-interp.test.ts` declare a
module-scope `probeErrorCodes(text, path)` function — parse with
`parseThetaDocument`/`parseDeps()`, filter to error severity, map to `.code` —
used by each file's prober-attribution guard. The two declarations are
byte-for-byte identical, including the doc comment. Both files already import
the same two underlying primitives (`parseThetaDocument` from
`src/parser/theta-document`, `parseDeps` from `tests/helpers/e2e-s1`) that the
function is built from, but neither imports the other's declaration or a
shared one — no `tests/helpers/` module exports this composition.

## Evidence

`tests/live/acceptance/b0422live-imported-schema-system-interp-wire-and-refusal.test.ts:250-256`:
```ts
/** The error-severity parse codes a single prober source draws (probers carry no imports). */
function probeErrorCodes(text: string, path: string): readonly string[] {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(text) }, parseDeps())
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code);
}
```

`tests/live/acceptance/b0445live-imported-array-element-system-interp.test.ts:202-208` — byte-identical:
```ts
/** The error-severity parse codes a single prober source draws (probers carry no imports). */
function probeErrorCodes(text: string, path: string): readonly string[] {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(text) }, parseDeps())
    .diagnostics.filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code);
}
```

Both files' shared import lines: `b0422live:88` `import { parseThetaDocument,
type ThetaDocument } from "../../../src/parser/theta-document";` and
`b0422live:93` `import { parseDeps } from "../../helpers/e2e-s1";`;
`b0445live:71` and `b0445live:78` are the identical two import statements.

Exact search: `grep -n "^function probeErrorCodes" tests/live/acceptance/*.test.ts` returns exactly these 2 hits.

## Why this is a problem
The same five-line function is retyped whole in two sibling files that
already share both underlying imports it is composed from. A change to how
either file's prober-attribution guard should classify diagnostic codes (for
example, widening beyond error severity, or sorting the result the way the
sibling `errorCodes`/`parseErrorCodes` helpers in this same directory do)
landing in one copy would leave the other checking a different contract, with
nothing in either file surfacing the drift, since neither imports a shared
definition.

## Suggested direction (non-binding, optional)
Both files already import `parseThetaDocument` and `parseDeps` from the same
two modules; a shared helper in `tests/helpers/` (or exported from one file
for the other, though a third home is more natural given neither file already
depends on the other) is the shape both identical declarations already point
at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or its named kin;
  `probeErrorCodes` is harness plumbing, not a pinned count or inventory.
- Recording-double check: `probeErrorCodes` performs no recording and backs
  no "never called" witness; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -m1 -i status docs/bugs/0422*.md
  docs/bugs/0445*.md` shows both reported fixed; neither file is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0422live\|b0445live" docs/reference/coverage-matrix.md` returns 0 hits.
  This finding proposes no merge, rename, or deletion of either file or its
  `it()`/`describe()` cells — only that the identical `probeErrorCodes`
  declaration could be shared.
- Coverage-drift check: this finding is about a repeated harness-support
  function definition that exists and runs identically in both files; it
  makes no claim that any path or behaviour is untested.
- Live-suite posture check: this is not about the live-host
  `failLoudly`/skip posture (each file's own `requireLiveHost()`/
  `resolveAcceptanceHost()` precondition handling is separate and unaffected)
  — the finding is scoped to the offline `probeErrorCodes` reader alone.
- Prior-finding overlap search: `grep -rl "probeErrorCodes" quality/issues
  quality/resolved quality/intake` returns no hits before this filing; no
  open/resolved/intake finding names this function or either file for this
  shape. Distinct from this wave's d7-01/d7-02 findings, which cover a
  different function (`parseErrorCodes`/`errorCodes` built over `parseDoc`,
  not `parseThetaDocument`) in four other files.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: `grep -n "^function probeErrorCodes" tests/live/acceptance/*.test.ts` returns exactly the 2 stated hits (b0422live:251, b0445live:203; declarations at :250-256/:202-208 with doc comment), a mktemp sed-range extract of both 7-line spans is diff-empty (md5 cb38a457 both), both copies are live (b0422live calls at :281/:338, b0445live at :244, all attribution guards asserting `.toEqual([])`), both files import only `parseDeps` from `../../helpers/e2e-s1` (:93/:78), neither is a *gate* test or recording double, docs/bugs/0422 and 0445 both `Status: fixed`, coverage-matrix.md → 0 hits, failLoudly posture untouched — genuine D7 boilerplate duplication in tests/ with a mechanical dedupe; ONE CORRECTION for the fixer: the title's "no shared tests/helpers/ home" does not hold — tests/helpers/e2e-s1.ts:273-275 already exports `errorCodes(thetaText, thetaPath)` = `errors(parseDoc(text, path).diagnostics).map((d) => d.code).sort()`, and `parseDoc` (e2e-s1.ts:76-79) is exactly `parseThetaDocument({ path, bytes: new TextEncoder().encode(src) }, parseDeps())`, so `probeErrorCodes` is that canonical minus `.sort()` (inert for the three `toEqual([])` call sites) and the candidate's "parseThetaDocument not parseDoc" distinction from d7-01/d7-02 is illusory; the fix is to import `errorCodes` (as 11 sibling acceptance files already do, e.g. b0297live:79, b0314live:59), not to mint a new helper; not a duplicate — PTQ-0256/PTQ-0486/PTQ-0756 are all resolved and cite other files under other helper names whose name-based fixes could not reach `probeErrorCodes` (same per-file-set ruling as PTQ-0486 vs PTQ-0256), and this wave's d7-01 (b0351/b0357) and d7-02 (b0406/b0444) name disjoint files (triage: claude-fable-5-1)
