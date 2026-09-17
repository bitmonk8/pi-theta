---
id: PTQ-0709
title: reportOf's envelope-payload-narrowing helper is byte-identical across both in-scope subagent-invoke bug-witness files (and five siblings), with no tests/helpers/ home
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-invoke-inbound-enum-tag.test.ts:155-164
  - tests/subagent-invoke-nonfinite-return-refusal.test.ts:294-303
sites: 2
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# reportOf's envelope-payload-narrowing helper is byte-identical across both in-scope subagent-invoke bug-witness files (and five siblings), with no tests/helpers/ home

## Observation
`tests/subagent-invoke-inbound-enum-tag.test.ts` and `tests/subagent-invoke-nonfinite-return-refusal.test.ts` — the two real-spawn subagent-invoke bug-witness files in this review's scope — each declare a module-scope `reportOf(value: unknown): Record<string, unknown>` function, including its doc comment, that is character-for-character identical. Neither file imports it from a shared module; no `tests/helpers/` module currently exports this function.

## Evidence

`tests/subagent-invoke-inbound-enum-tag.test.ts:155-164`:
```ts
/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}
```

`tests/subagent-invoke-nonfinite-return-refusal.test.ts:294-303` — the same function, same doc comment, character-for-character identical:
```ts
/** Narrow the envelope's `Ok` payload to the report object, failing loudly when it is not one. */
function reportOf(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(
      `the driven root returned ${JSON.stringify(value)} instead of the R report object — ` +
        `the fixture set did not reach its tail expression, so no assertion below is meaningful`,
    );
  }
  return value as Record<string, unknown>;
}
```

Pattern-wide search: `grep -rn "function reportOf" tests/*.test.ts` → 7 files repo-wide (`b0337-theta-enum-identity-invoke.test.ts`, `b0342-forwarded-enum-subagent-chain.test.ts`, `inbound-union-arm-dispatch.test.ts`, `inbound-boundary-theta-callable.test.ts`, `invoke-prompt-cell-enum-return.test.ts`, and the two files in this review's scope). `grep -rn "reportOf" tests/helpers/*.ts` → 0 hits — no `tests/helpers/` module exports this function; the two in-scope files each retype it independently of one another and of the five siblings.

## Why this is a problem
Both files in this review's scope declare the identical "narrow an `unknown` envelope payload to a plain object, throwing loudly with the same wording when it is not one" helper, used to guard the same shape of `R`-report-object assertion each file's driven-root fixture returns. Sharing one declaration is unrealised even between the two files reviewed here, let alone the five further siblings the pattern-wide search surfaces.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting `reportOf` is the natural home the two in-scope files' (and the five siblings') identical declarations point toward, alongside the existing `tests/helpers/subagent-json-driver-harness.ts` this family of files already partially shares plumbing with.

## False-positive check
- Gate-pin check: neither in-scope file matches `*gate*.test.ts` or a named kin; not applicable.
- Recording-double check: `reportOf` is a type-narrowing guard that throws loudly on a shape mismatch, not a recording double backing a "never called" MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0067 and docs/bugs/0180 (the two files' respective subjects) are each named in their own file's header as the bug under witness; neither bug document cites `reportOf` itself as a pinned witness artefact — `grep -n "reportOf" docs/bugs/0067*.md docs/bugs/0180*.md` → 0 hits.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-invoke-inbound-enum-tag\|subagent-invoke-nonfinite-return-refusal" docs/reference/coverage-matrix.md` → 0 hits for either file. This finding proposes no merge, rename, or deletion of either file or any `it()` cell — only that the duplicated narrowing helper could be imported rather than redeclared — so no citation is affected.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated helper function, leaving both files' tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-invoke-inbound-enum-tag.test.ts:155-164 and tests/subagent-invoke-nonfinite-return-refusal.test.ts:294-303 and `diff` of the two extracted ranges is empty; each copy is live (called at :265 and :406 respectively); `grep -rn "function reportOf" tests/` → 7 files, `grep -rl reportOf tests/helpers/ src/ extensions/ tools/` → 0 and no `import.*reportOf` anywhere, so no shared home exists; 4 of the 5 siblings are also byte-identical (inbound-union-arm-dispatch.test.ts:1378-1387 differs only in message line-wrap/"fixture pair" wording, a nuance the title's "(and five siblings)" glosses); D7 boilerplate-duplication class in tests/ only; carve-outs do not bite (neither file is a gate, both are named as witnesses in docs/bugs/0067 and 0180 but the finding proposes no merge/rename/delete of any file or cell, coverage-matrix cites neither); no existing PTQ mentions reportOf (triage: claude-fable-5-1)
