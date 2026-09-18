---
id: PTQ-0573
title: The span()/site()/withCode() seam-call harness for src/parser/schema-declarations.ts is redeclared byte-identically in the V5a and V5b test files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/disc-unions-recursion.test.ts:34-46
  - tests/schema-declarations.test.ts:34-46
  - tests/discriminator-field-classifier-brace-group.test.ts:502-510
  - tests/non-literal-by-field-refusal.test.ts:673-680
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# The span()/site()/withCode() seam-call harness for src/parser/schema-declarations.ts is redeclared byte-identically in the V5a and V5b test files

## Observation
`tests/disc-unions-recursion.test.ts` (V5b — discriminated unions,
recursion, cycle detection) declares, at module scope, a `span()` function
returning a fixed 1:1–1:2 `SourceRange`, a `site()` function returning
`{ file: "test.theta", range: span() }`, and a `withCode(diags, code)`
function that returns the first diagnostic carrying `code`. The same three
functions, same bodies, same doc-comments, appear at the same lines in
`tests/schema-declarations.test.ts` (V5a — object/alias/enum declarations),
the paired sibling file that exercises the same
`src/parser/schema-declarations.ts` module's other seams. Two further files
that call into the same module's `checkDiscriminatedUnion` seam
(`discriminator-field-classifier-brace-group.test.ts`,
`non-literal-by-field-refusal.test.ts`) each independently redeclare a
near-identical `span()`/`site()` pair (one drops `withCode`, the other
inlines the range literal under a different file name). No
`tests/helpers/` module exports a `SourceRange`/located-site builder for
this seam family.

## Evidence

tests/disc-unions-recursion.test.ts:34-46:
```ts
/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

tests/schema-declarations.test.ts:34-46 — byte-identical (`diff` of the two
14-line blocks shows no difference):
```ts
/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}

/** The first diagnostic carrying `code`, if any. */
function withCode(diags: readonly Diagnostic[], code: string): Diagnostic | undefined {
  return diags.find((d) => d.code === code);
}
```

tests/discriminator-field-classifier-brace-group.test.ts:502-510 — the same
`span()`/`site()` pair, same doc-comments, `withCode` absent from this file:
```ts
/** A throwaway 1:1–1:2 span for the seam calls. */
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}

/** A located site at the throwaway span. */
function site(): { file: string; range: SourceRange } {
  return { file: "test.theta", range: span() };
}
```

tests/non-literal-by-field-refusal.test.ts:673-680 — the same shape with the
range literal inlined and a different `file` value:
```ts
/** A throwaway 1:1–1:2 span for the seam calls. */
function site(): { file: string; range: SourceRange } {
  const range: SourceRange = {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 2 },
  };
  return { file: "bug0128.theta", range };
}
```

Exact search: `grep -n "^function span\|^function site\|^function withCode" tests/disc-unions-recursion.test.ts tests/schema-declarations.test.ts tests/discriminator-field-classifier-brace-group.test.ts tests/non-literal-by-field-refusal.test.ts` finds the declarations at the line numbers above in all four files; `diff` of the two byte-identical `disc-unions-recursion.test.ts:34-46` / `schema-declarations.test.ts:34-46` blocks produces no output.

## Why this is a problem
This is the "Boilerplate duplication" class: the identical throwaway
`SourceRange`/located-`site` construction, worded with the identical
doc-comment ("A throwaway 1:1–1:2 span for the seam calls." / "A located
site at the throwaway span."), is declared independently in the two files
that are explicitly paired as the V5a/V5b halves of the same
`schemas.md` obligation area's coverage of the same
`src/parser/schema-declarations.ts` module (both files' own header comments
state this pairing), plus two further files calling into the same module's
`checkDiscriminatedUnion` seam. Neither file imports from the other or from
a shared module; each re-derives the same three (or two) functions from
scratch.

## Suggested direction (non-binding, optional)
A small shared helper alongside the existing `tests/helpers/` fixtures —
covering the throwaway `SourceRange`, the located `site()`, and the
first-diagnostic-by-code lookup these `schema-declarations.ts`-seam test
files each rebuild — is the natural home the two byte-identical V5a/V5b
copies already point at; naming that shape is observation, not a design for
the change.

## False-positive check
- Gate-pin check: none of the four files matches `*gate*.test.ts` or the
  named gate kin — not applicable.
- Recording-double check: `span`/`site`/`withCode` are inert location/lookup
  builders, not recording doubles backing a "never called" witness — the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "checkDiscriminatedUnion\|schema-declarations" docs/bugs/*.md` finds bug documents describing the discriminator-detection defects these files test, none of which states a reason the two files' harnesses must diverge or stay file-local.
- coverage-matrix/bug-doc citation search: `grep -rn "disc-unions-recursion\|schema-declarations.test" docs/reference/coverage-matrix.md docs/bugs/*.md` returns no hit outside each file's own self-reference; this finding proposes no merge, rename, or deletion of any `it()`/`describe()`, only that the shared harness code is duplicated.
- Coverage check: the claim is about repeated helper DEFINITIONS, not a
  missing test path; each copy is exercised by its own file's tests.
- Prior-finding overlap check: `grep -rl "checkDiscriminatedUnion\|detectTypeAliasCycles" quality/intake quality/resolved` returns only PTQ-0012 and PTQ-0113, neither of which concerns this span/site/withCode duplication.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all four excerpts match verbatim at the cited lines (grep of ^function span|site|withCode hits exactly 34/39/44, 34/39/44, 503/508, 675) and diff of disc-unions-recursion.test.ts:34-46 vs schema-declarations.test.ts:34-46 is empty; the two other copies drop withCode / inline the range under "bug0128.theta"; no tests/helpers/ module exports site() or withCode (tests/helpers/invoke-seam-scaffold.ts:54 and tool-call-dispatch-harness.ts:51 do already export an identical span(), which the filing understates but which only reinforces the boilerplate-duplication class); no gate/recording-double/coverage-matrix carve-out applies and no it() merge is proposed; PTQ-0238/0244/0278/0301/0344 cover other span-harness families, not these four files (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
