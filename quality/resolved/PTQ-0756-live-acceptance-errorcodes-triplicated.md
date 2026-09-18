---
id: PTQ-0756
title: b0297live, b0298live, and b0301live each redeclare a byte-identical errorCodes(thetaText, thetaPath) helper instead of composing it from e2e-s1.ts's already-imported errors() export
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts:167-173
  - tests/live/acceptance/b0298live-system-nonscalar-load-refusal.test.ts:156-162
  - tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts:181-187
  - tests/helpers/e2e-s1.ts:83-86
sites: 3                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0297live, b0298live, and b0301live each redeclare a byte-identical errorCodes(thetaText, thetaPath) helper instead of composing it from e2e-s1.ts's already-imported errors() export

## Observation
Three sibling `tests/live/acceptance/` bug-report acceptance files —
b0297live, b0298live, b0301live — each declare, at module scope, a
byte-identical `errorCodes(thetaText, thetaPath)` function: parse the source
with `parseDoc`, filter the resulting diagnostics to `severity === "error"`,
map to `.code`, and sort. All three files already import `parseDoc` from
`../../helpers/e2e-s1` on the same import line, and that module also exports
`errors(diags)` — the identical filter step — one `.map((d) => d.code).sort()`
short of what each file re-derives locally.

## Evidence

tests/live/acceptance/b0297live-bind-context-nonscalar-load-refusal.test.ts:167-173:
```ts
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  const doc = parseDoc(thetaText, thetaPath);
  return doc.diagnostics
    .filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}
```

tests/live/acceptance/b0298live-system-nonscalar-load-refusal.test.ts:156-162 — byte-identical:
```ts
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  const doc = parseDoc(thetaText, thetaPath);
  return doc.diagnostics
    .filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}
```

tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts:181-187 — byte-identical:
```ts
function errorCodes(thetaText: string, thetaPath: string): readonly string[] {
  const doc = parseDoc(thetaText, thetaPath);
  return doc.diagnostics
    .filter((d: Diagnostic) => d.severity === "error")
    .map((d: Diagnostic) => d.code)
    .sort();
}
```

Each file's own import line already reaches the module hosting the
composable filter — e.g.
tests/live/acceptance/b0301live-bind-echo-nonboolean-load-refusal.test.ts:78-79:
```ts
import { failLoudly, requireLiveHost, spawnPiPrint } from "./harness";
import { parseDoc } from "../../helpers/e2e-s1";
```

tests/helpers/e2e-s1.ts:83-86 — the already-exported filter each file
reimplements the second half of:
```ts
/** Error-severity diagnostics only. */
export function errors(diags: readonly Diagnostic[]): Diagnostic[] {
  return diags.filter((d) => d.severity === "error");
}
```

Exact search: `grep -n "function errorCodes(thetaText" tests/live/acceptance/*.test.ts`
returns 5 hits, all byte-identical bodies: the three in scope above, plus
tests/live/acceptance/b0406live-object-param-system-interp-registration.test.ts:137
and tests/live/acceptance/b0444live-array-union-element-system-interp.test.ts:141
(outside this review's scope, cited only as corroborating pattern context, not
as filed sites).

## Why this is a problem
This is the "Boilerplate duplication" class: the same five-line function —
parse, filter to error severity, map to `.code`, sort — is retyped at module
scope in three in-scope files rather than composed once from the sibling
`errors()` export each file already imports alongside `parseDoc` on the same
line. `errors(parseDoc(thetaText, thetaPath).diagnostics).map((d) =>
d.code).sort()` is exactly what each local `errorCodes` computes by hand;
nothing in any of the three files' bug-specific logic depends on the
duplicated implementation rather than a shared one.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already hosts `errors`/`codes`/`diagCodes` as the
shared diagnostic-reading surface each of these three files imports `parseDoc`
from; that module is the existing home this duplication already sits beside.

## False-positive check
- Gate-pin check: none of the three files (b0297live, b0298live, b0301live)
  matches `*gate*.test.ts` or the named kin (closing-gate, cross-cutting-gates,
  rfc-*-spec-surface-gate, committed-fixture-parse-gate,
  registry-closed-set-corpus-gate); nothing cited here is a pinned count or
  inventory assertion.
- Recording-double check: `errorCodes` reads an already-produced diagnostics
  array and returns a derived list; it records no calls and backs no
  "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0297-bind-context-nonscalar-silently-registers.md
  (Status: fixed 0.330.0), docs/bugs/0298-system-nonscalar-silent-drop-and-prompt-mode-suppression.md
  (Status: fixed 0.300.0), docs/bugs/0301-bind-echo-tool-loop-respond-repair-silent-default-holes.md
  (Status: fixed 0.332.0) — none is a documented correct-reason red; each
  test's own attribution-guard assertions pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0297live\|b0298live\|b0301live" docs/reference/coverage-matrix.md` → 0
  hits. This finding proposes no merge, rename, or deletion of any test or
  `it()` — only that the internal `errorCodes` helper could be composed from
  an existing sibling export — so no witness-list citation is disturbed.
- Live-suite convention check: `errorCodes`'s own live-host precondition
  (`requireLiveHost` / `failLoudly`) is the correct fail-loudly posture per
  AGENTS.md "Live-suite conventions" and is unrelated to this finding, which
  concerns only the duplicated helper function definition, not the live-host
  gating or any stochastic assistantText assertion.
- Coverage check: the claim is entirely about a repeated helper-function
  DEFINITION, not a missing test path; all three cited files exercise and
  pass their `errorCodes` calls in the attribution-guard section at HEAD.
- Prior-finding overlap check: `grep -rn "function errorCodes(thetaText"
  quality/intake quality/resolved` → 0 hits before this filing. The closest
  named prior finding, PTQ-0256 ("b0406 and b0408 each redefine an identical
  errorCodes helper"), covers a DIFFERENT signature
  (`errorCodes(doc: ReturnType<typeof parseDoc>): string[]`, no `.sort()`, no
  `thetaPath` parameter) in different, non-live files; it does not name or
  cite any of b0297live/b0298live/b0301live.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -n "function errorCodes(thetaText" tests/live/acceptance/*.test.ts` returns exactly the 5 stated hits and a diff of the extracted 7-line bodies at b0297live:167, b0298live:156, b0301live:181 confirms they are byte-identical; each file imports `parseDoc` from `../../helpers/e2e-s1` (lines 79/69/92) whose exported `errors(diags)` (e2e-s1.ts:83-86) is the same severity filter, and every local call (2 per file, attribution-guard section) is compatible with `errors(parseDoc(text, path).diagnostics).map((d) => d.code).sort()`; all four locations are under tests/, none is a gate/pin test or recording double, docs/bugs 0297/0298/0301 are all `Status: fixed`, coverage-matrix grep → 0 hits, live-suite failLoudly posture untouched; not a duplicate — resolved PTQ-0256 cites only tests/b04xx files with a different `errorCodes(doc)` signature (its fix composed those wrappers from `errors()`, the same direction proposed here), and no intake/open row names any of these three live files (triage: claude-fable-5-1)
