---
id: PTQ-1389
title: thetaSrc frontmatter-wrapping fixture builder byte-identical across three discriminator test files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/empty-object-discriminator-field-withhold.test.ts:164-166
  - tests/discriminator-field-classifier-brace-group.test.ts:535-537
  - tests/non-literal-by-field-refusal.test.ts:166-168
sites: 3
fix_scope: module
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# thetaSrc frontmatter-wrapping fixture builder byte-identical across three discriminator test files

## Observation
`tests/empty-object-discriminator-field-withhold.test.ts`,
`tests/discriminator-field-classifier-brace-group.test.ts`, and
`tests/non-literal-by-field-refusal.test.ts` each declare a private
`thetaSrc(decls: string): string` function with the identical body, wrapping
`decls` in the standard `mode: prompt` frontmatter plus a fixed `let a = 1\na`
tail. No canonical helper under `tests/helpers/` provides this wrapper.

## Evidence
tests/empty-object-discriminator-field-withhold.test.ts:164-166:
```ts
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}
```

tests/discriminator-field-classifier-brace-group.test.ts:535-537:
```ts
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}
```

tests/non-literal-by-field-refusal.test.ts:166-168:
```ts
function thetaSrc(decls: string): string {
  return `---\nmode: prompt\n---\n${decls}\nlet a = 1\na`;
}
```
Search: `grep -rn "function thetaSrc" tests/*.test.ts` — 3 hits, the three
cited above; each function body is byte-identical.

## Why this is a problem
All three files are part of the same discriminator-field-classification bug
family (bug 0129 / 0128 / 0095-adjacent) and each independently retyped the
same three-line frontmatter-wrapping helper rather than sharing one
definition, so a change to the standard frontmatter shape these fixtures
assume (e.g. the mode value or the fixed tail) requires editing three
call sites in lockstep with nothing to force that.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` export of this frontmatter wrapper is where all
three call sites' identical body already points.

## False-positive check
Not a gate/pin file (none of the three match `*gate*.test.ts` or kin). Not a
recording double / MUST-NOT witness — `thetaSrc` is a plain string builder, no
call recording. Searched `quality/issues`, `quality/resolved`, `quality/intake`
for "thetaSrc" and for the three file names — no existing filing addresses this
specific triplication (unrelated hits were for registry-oracle and
non-literal-by-field-refusal's own `animalRow`/`loadRow` naming, a different
root cause). Not a coverage claim: the three test files' own assertions are
unaffected; only the repeated fixture builder is observed.

## Triage
verdict: confirmed — excerpts reproduce at the cited lines (164-166, 535-537, 166-168) and `grep -rn "function thetaSrc" tests/` gives exactly the three cited hits with byte-identical bodies; a copy-paste fixture builder in tests/ within D7, not a gate file, not a recording double, coverage-matrix has 0 hits for the three files, and no PTQ row names thetaSrc or these files (the same-wave animalVariants/seamLines filing covers a disjoint builder; PTQ-0555/0606/1078 cover other fixture builders); one correction to the filing's observation: a canonical helper DOES exist — tests/helpers/e2e-s1.ts:141 `body(stmt)` renders `${FM}${stmt}\n${TAIL}` = the same `---\nmode: prompt\n---\n<decls>\nlet a = 1\na` plus a trailing `\n`, and all three files already import from e2e-s1 — which strengthens rather than weakens the finding (the dedupe target is already exported) (triage: claude-fable-5-1)
