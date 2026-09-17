---
id: PTQ-0606
title: The theta()/invokeCaller()/callableCaller() planted-fixture builder trio is redeclared byte-for-byte across four production-load test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/invoke-arg-array-literal-provable.test.ts:230-257
  - tests/invoke-arg-type-mismatch-wired.test.ts:268-293
  - tests/division-result-type-number-invoke.test.ts:172-183
  - tests/modulo-zero-result-type-number.test.ts:1750-1762
sites: 4
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 1
---

# The theta()/invokeCaller()/callableCaller() planted-fixture builder trio is redeclared byte-for-byte across four production-load test files

## Observation
Four test files that each drive `discoverAndComposeFixtures` over a planted `.pi/theta/` workspace declare a private `function theta(...lines): string` that joins lines with `\n` and a trailing `\n`, and a private `function invokeCaller(...body): string` that wraps that body in a fixed `mode: subagent` frontmatter block with no `tools:` key. Both functions are byte-identical across all four files. Two of the four (the pair in this review's scope) additionally declare a byte-identical `callableCaller(entry, ...body)` that wraps a body in the same frontmatter with one `tools:` entry, differing only in one doc-comment word each.

## Evidence
tests/invoke-arg-array-literal-provable.test.ts:230-257:
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/**
 * A `mode: subagent` callee declaring one `params:` field named `x`.
 * ...
 */
function callee(paramType: string): string {
  return theta("---", "mode: subagent", "params:", `  x: ${paramType}`, "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}

/** A `mode: subagent` caller resolving one callable entry — the callable surface. */
function callableCaller(entry: string, ...body: readonly string[]): string {
  return theta("---", "mode: subagent", "tools:", `  - ${entry}`, "---", ...body, "@`hi`");
}
```

tests/invoke-arg-type-mismatch-wired.test.ts:268-293 — `theta`, `callee`, `invokeCaller` and `callableCaller` bodies verified byte-identical to the excerpt above (`diff` on each function body in isolation produces no output); the only differences anywhere in the four functions are the `callee` doc comment's third sentence and `callableCaller`'s doc comment ("one callable entry" vs "one `.theta` entry").

tests/division-result-type-number-invoke.test.ts:172-183 (`theta` and `invokeCaller` verified byte-identical to the excerpts above via `diff`):
```ts
function theta(...lines: readonly string[]): string {
  return lines.join("\n") + "\n";
}

/** A `mode: subagent` callee declaring one `params: x: string` field. */
function calleeStr(): string {
  return theta("---", "mode: subagent", "params:", "  x: string", "---", "@`hi`");
}

/** A `mode: subagent` caller with no `tools:` — the `invoke(...)` literal surface. */
function invokeCaller(...body: readonly string[]): string {
  return theta("---", "mode: subagent", "---", ...body, "@`hi`");
}
```

tests/modulo-zero-result-type-number.test.ts:1750-1762 — `theta` and `invokeCaller` verified byte-identical to the excerpts above via `diff`.

Exact search: `grep -rl "^function invokeCaller" tests/*.test.ts` → exactly these four files. `grep -rl "^function callableCaller" tests/*.test.ts` → the two in-scope files plus `tests/arg-mismatch-diagnostic-count-by-surface.test.ts`, whose `callableCaller(entries: readonly string[], ...)` takes an array parameter and is a diverged (not identical) variant, so it is not counted among the four identical sites above. `ls tests/helpers/` (38 modules, checked in full) contains no module exporting a `theta`/`invokeCaller`/`callableCaller`-shaped planted-fixture-text builder.

## Why this is a problem
This is the "Boilerplate duplication" class: the same three-function fixture-text builder (a raw-line joiner and two frontmatter-wrapping callers) is typed out four separate times rather than shared, even though all four files already import shared production-load pieces (`discoverAndComposeFixtures`, `ThetaFixture`) and construct the same kind of planted `.pi/theta/` workspace `tests/helpers/production-load-harness.ts` centralises the surrounding harness for. None of the four files' own variation (the callee-shape functions built on top: `callee(paramType)` vs `calleeStr()`) requires re-deriving `theta`/`invokeCaller` from scratch each time.

## Suggested direction (non-binding, optional)
A shared `theta(...lines)` / `invokeCaller(...body)` / `callableCaller(entry, ...body)` export alongside the existing `tests/helpers/production-load-harness.ts` module (which already centralises this file family's `runProductionLoad`/`plantThetaWorkspace`/`disposeWorkspace` pieces) is the home the four identical copies point at; each file's own callee-shape function is the part that legitimately stays local.

## False-positive check
- Gate-pin carve-out: none of the four files match `*gate*.test.ts` or the named kin; not applicable.
- Recording-double carve-out: no recording double or negative witness is involved; not applicable.
- docs/bugs/ signature search: `grep -rl "function invokeCaller\|function callableCaller" docs/bugs/*.md` → 0 hits; no documented correct-reason red covers this builder trio.
- coverage-matrix/bug-doc citation search: `grep -n "invoke-arg-array-literal-provable\|invoke-arg-type-mismatch-wired\|division-result-type-number-invoke\|modulo-zero-result-type-number" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any of the four files or any `it()`/`describe()`, only that the identical builder functions could be imported rather than re-derived.
- Prior-filing search: `grep -rl "invokeCaller\|callableCaller" quality/intake quality/resolved` → 0 hits before this filing; the previously filed `production-load-harness`/`runProductionLoad` findings (PTQ-0210, PTQ-0240, PTQ-0259, PTQ-0312, and the in-wave suffix-guard finding for this same five/four-file family) each name a different code block (the `runProductionLoad` stderr-mirror function, or the suffix-collision `beforeAll` loop) and do not cite the `theta`/`invokeCaller`/`callableCaller` builder functions cited here.
- Coverage-drift check: the finding is about a repeated builder-function DEFINITION, not a missing test path; every copy is already exercised by its own file's tests.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts match at the cited lines; sed-extracted `theta`+`invokeCaller` bodies diff byte-identical across all four files and `callableCaller` byte-identical across the two in-scope files (arg-mismatch-diagnostic-count-by-surface's array-taking variant correctly excluded as diverged); `grep -rl "^function invokeCaller" tests/*.test.ts` → exactly these 4; no `tests/helpers/` module exports any of the three builders (production-load-harness.ts exports only runProductionLoad/plantThetaWorkspace/disposeWorkspace); all four import discoverAndComposeFixtures/ThetaFixture as claimed; none is a *gate* test, none is cited by docs/reference/coverage-matrix.md or docs/bugs/; no prior PTQ row cites these builders (PTQ-0207's `theta(label, body)` is a different LoadRow-parsing shape; PTQ-0210/0240/0259/0312 and in-wave d7-106-01 cite the disjoint runProductionLoad/plant-dispose blocks) — a mechanical D7 boilerplate-duplication dedupe (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
