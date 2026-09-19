---
id: PTQ-0961
title: e2e-s4-never-emitted-diagnostics.test.ts and e2e-s4-uncovered-emitted-diagnostics.test.ts hand-roll the ThetaSource+parseThetaDocument call that tests/helpers/e2e-s1.ts's exported parseDoc already wraps
lens: D7
status: open
verdict: confirmed
locations:
  - tests/e2e-s4-never-emitted-diagnostics.test.ts:1-27
  - tests/e2e-s4-uncovered-emitted-diagnostics.test.ts:1-26
  - tests/helpers/e2e-s1.ts:74-77
sites: 2
fix_scope: module
wave: qw20260918131151
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
fix_skips: 1
---

# e2e-s4-never-emitted-diagnostics.test.ts and e2e-s4-uncovered-emitted-diagnostics.test.ts hand-roll the ThetaSource+parseThetaDocument call that tests/helpers/e2e-s1.ts's exported parseDoc already wraps

## Observation
Both S4 sibling files already import `parseDeps` from `./helpers/e2e-s1` (aliased `makeDeps`) — this is the residue of a prior, now-fixed duplication (PTQ-0642, `status: fixed`, resolved) that collapsed a locally-redeclared `makeDeps(): ParseThetaDocumentDeps` into the shared `parseDeps` export. Both files still, independently, hand-build a `ThetaSource` object literal (`{ path: "test.theta", bytes: new TextEncoder().encode(src) }`) and call `parseThetaDocument(source, makeDeps())` directly inside their own local `codesOf`/`parse` wrapper, even though the same module (`tests/helpers/e2e-s1.ts`) already exports `parseDoc(src, path = "test.theta")`, which performs the identical two lines and is imported and used for this exact purpose by another in-scope file (`tests/division-result-type-number.test.ts:29`, `parseDoc as parseDoc`).

## Evidence

`tests/e2e-s4-never-emitted-diagnostics.test.ts:1-27`:
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps as makeDeps } from "./helpers/e2e-s1";
...
function codesOf(src: string): string[] {
  const source: ThetaSource = {
    path: "test.theta",
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeDeps()).diagnostics.map(
    (d: Diagnostic) => d.code,
  );
}
```

`tests/e2e-s4-uncovered-emitted-diagnostics.test.ts:1-26`:
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import type { ThetaSource } from "../src/lexer/lexer";
import { parseThetaDocument } from "../src/parser/theta-document";
import { parseDeps as makeDeps } from "./helpers/e2e-s1";
...
function parse(src: string): readonly Diagnostic[] {
  const source: ThetaSource = {
    path: "test.theta",
    bytes: new TextEncoder().encode(src),
  };
  return parseThetaDocument(source, makeDeps()).diagnostics;
}

function find(src: string, code: string): Diagnostic | undefined {
  return parse(src).find((d) => d.code === code);
}
```

The canonical helper, `tests/helpers/e2e-s1.ts:74-77`:
```ts
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```
`codesOf(src)` is mechanically `parseDoc(src).diagnostics.map((d) => d.code)`; `parse(src)` is mechanically `parseDoc(src).diagnostics`. Both wrappers reduce to a one-line call over the already-exported helper.

## Why this is a problem
The `ThetaSource` object-literal-plus-`parseThetaDocument` call is retyped identically in both files (search: `grep -n 'path: "test.theta"' tests/e2e-s4-*.test.ts` → 2 hits, one per file), while the same two lines are already packaged behind `parseDoc` in the very module both files import from for `parseDeps`. This is the same "harness sequence repeated across test files with a canonical helper sitting one import away" shape the wave's own prior filing on this exact file pair (PTQ-0642) already established and fixed for the `makeDeps` half of the same header; the `ThetaSource`-construction half of the identical header was left behind.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `parseDoc` is the natural call each file's local `codesOf`/`parse` wrapper already reduces to.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named kin (census/pin gates).
- Recording-double check: `codesOf`/`parse`/`find` return diagnostics for a direct assertion, not a "never called" negative witness; the recording-double carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "e2e-s4-never-emitted-diagnostics\|e2e-s4-uncovered-emitted-diagnostics" docs/bugs/*.md` → `docs/bugs/0013-...md`, `docs/bugs/0025-...md`, both fixed bugs citing the files for their *behavioural* subject (which registry codes fire), not this local-harness duplication.
- coverage-matrix/bug-doc citation search: `grep -n "e2e-s4-never-emitted-diagnostics\|e2e-s4-uncovered-emitted-diagnostics" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any `it()`/`describe()` — only that the local `ThetaSource`-construction line could call the already-exported `parseDoc` — so no witness-list citation is disturbed.
- Prior-filing overlap check: `quality/resolved/PTQ-0642-e2e-s4-makedeps-harness-duplicated.md` (status `fixed`, verdict `confirmed`) already covers and closed the `makeDeps` half of this same header pair; that filing's own evidence block cites only the `makeDeps` function body, not the `ThetaSource`/`parseThetaDocument` lines this filing cites, so this is a distinct residual root cause left behind by that fix, not a re-file of it.
- Coverage check: the claim is about a repeated construction sequence, not a missing test path.

## Triage
verdict: confirmed — re-verified independently: both excerpts match verbatim at never-emitted:1-27 and uncovered-emitted:1-26, helpers/e2e-s1.ts:74-77 `parseDoc(src, path = "test.theta")` is byte-equivalent to each local wrapper's ThetaSource literal + `parseThetaDocument(source, makeDeps())` (makeDeps is a direct alias of parseDeps), so `codesOf`/`parse` fold to one-line calls and the `ThetaSource`/`parseThetaDocument` imports drop; `grep 'path: "test.theta"' tests/e2e-s4-*.test.ts` → 2 hits (:21, :18), docs/bugs → 0013/0025 behavioural only, coverage-matrix → 0; not a duplicate — PTQ-0642's fix commit d7b9c00b swapped only the makeDeps body for the parseDeps import and left the ThetaSource construction untouched, no other intake/issues/resolved filing cites either s4 file, and the store already treats "local parse reimplements parseDoc" as its own per-file-pair class (PTQ-0731/0914/0950 open, PTQ-0405 fixed); plain it() files, no gate/recording-double/red carve-out; one peripheral inaccuracy — the division-result-type-number.test.ts citation is line 32 with an unaliased `parseDoc` import, not :29 `parseDoc as parseDoc` — does not touch the anchor (triage: claude-fable-5-1)

## Fix attempts
- qw20260919193904: skipped — [PTQ-0967-fnarg-letrhs-message-builders-duplicated.md] PTQ-0967: Shared six builder pairs through registry-oracle, preserving each file's failure wording. / PTQ-0971: Reused the shared AJV fixture at seven remaining sites; five were already deduplicated. Preserved the distinct production-slug fixture. / PTQ-0972: Replaced the local registry read with readRegistry(["parse"]), retaining the error-message path. / PTQ-0973: Imported shared at/render helpers at three remaining sites. No tests or assertions changed across any issue; the required tsc and full test gate passed (689 files, 11,586 tests). || [PTQ-0975-invoke-arg-array-literal-registry-read-not-migrated.md] PTQ-0975: Replaced local registry parsing with readRegistry(["parse"]); preserved error wording and all assertions. Required TypeScript/full-test gate passed. / PTQ-0977: Replaced duplicated two-page parsing with readRegistry(["parse", "load"]); preserved shard order and all assertions. Required gate passed. / PTQ-0978: Adopted shared production-load and workspace helpers; preserved per-call isolation and cleanup. No tests deleted or weakened. Required gate passed. / PTQ-0981: Imported shared diagLines and removed its local copy and unused types; all assertions preserved. Exact required gate passed: TypeScript clean, 689 test files and 11,586 tests passed. || [PTQ-0982-hexinvocationroot-reimplements-imported-rootdouble.md] PTQ-0982: Delegated hexInvocationRoot to rootDouble with an invocation-ID override; sequence behavior preserved. / PTQ-0983: Shared invokeArgMessage across all five triaged copies, preserving registry interpolation and failure checks. / PTQ-0984: Shared loweredParams across all eight triaged copies, preserving source construction and paths; affected live cell passed. / PTQ-0986: Imported the existing noopPi and removed its local duplicate. No tests or assertions removed across these fixes; required gate passed—TypeScript clean, 689 files and 11,586 tests green. ||
