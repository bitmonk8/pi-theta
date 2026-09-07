---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: lowerQueryResponseSchema's enums-default doc counts "the two shipped seam-contract pins that call this with two arguments" while nineteen two-argument call sites exist
lens: D2                     # the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending             # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/query-schema-lowering.ts:155-162
sites: 1                     # count of occurrences cited in Evidence
fix_scope: localized         # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907183353
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# lowerQueryResponseSchema's enums-default doc counts "the two shipped seam-contract pins that call this with two arguments" while nineteen two-argument call sites exist

## Observation
The doc comment on `lowerQueryResponseSchema` justifies the `enums = []`
default parameter with a definite description of its beneficiary set: "the two
shipped seam-contract pins that call this with two arguments keep compiling
(bug 0028 §Fix)". In the current tree the two-argument caller set has nineteen
members (all in tests/), and both production call sites pass three arguments.
The count narrates the tree at bug-0028 time, not the tree the sentence
describes in the present tense.

## Evidence
src/runtime/query-schema-lowering.ts:155-162 (the doc; excerpted):
```ts
 * set — this file's own `schema` / `enum` decls plus the ones its `import`s
 * pull in (`mergedSchemaDeclsOf` / `mergedEnumDeclsOf`,
 * production-theta-producer.ts, bug 0465) — so an imported name lowers to its
 * declared shape here. `enums` defaults to `[]` so the two shipped
 * seam-contract pins that call this with two arguments keep compiling (bug
 * 0028 §Fix).
 */
```

Current two-argument call sites — exact search: grep
`lowerQueryResponseSchema\([^,)]*, [A-Za-z_][A-Za-z0-9_()]*\)` across src/,
extensions/, tools/, tests/ returns 20 single-line matches, of which one
(tests/wire-translation-inbound-retag.test.ts:573) is a three-argument call the
line pattern over-matches; the nineteen genuine two-argument sites are:
tests/annotation-root-brace-union-lowering.test.ts:491,
tests/b0291-off-session-transport-fold-threading.test.ts:201,
tests/b0292-validation-errors-canonical-order.test.ts:133,
tests/b0352-initial-depth-breach-opens-repair.test.ts:176,
tests/b0353-followup-respond-payload-depth-walk.test.ts:159,
tests/b0355-repair-terminal-masked-followup-slot.test.ts:197,
tests/b0399-boundary-event-attempts-tokens-masked.test.ts:428,
tests/e2e-s3-typed-query-conformance.test.ts:141,
tests/inline-object-nested-lowering.test.ts:564,
tests/off-session-transport-classification.test.ts:242,
tests/off-session-two-phase.test.ts:350,
tests/params-brace-union-rhs-lowering.test.ts:485,
tests/production-typed-query-validation.test.ts:127,
tests/production-typed-query-validation.test.ts:243,
tests/query-schema-transitive-defs.test.ts:101,
tests/typed-query-provider-gate.test.ts:273,
tests/typed-repair-two-phase.test.ts:247,
tests/typed-two-phase-live.test.ts:364,
tests/unresolved-annotation-lowering.test.ts:295.

Both production call sites pass three arguments
(src/extension/production-theta-producer.ts:3194-3197 and :4544-4547, each
threading `mergedSchemaDeclsOf(...)` and `mergedEnumDeclsOf(...)`).

## Why this is a problem
Historical narration with a drifted count: the restrictive clause "the two …
that call this with two arguments" identifies the two-argument caller set as
having exactly two members, and a reader auditing whether the default is still
load-bearing is pointed at two callers when nineteen exist. This is the same
stale-caller-count shape triage has already seen confirmed elsewhere
(qw20260907130901-d2-06 "two call sites" vs one;
qw20260907183353-d2-06 "the two positions" vs three): the sentence was written
when bug 0028 added the default for the then-shipped pins and was not updated
as later waves (b0291, b0352-b0355, b0399, and others postdating bug 0028)
added two-argument callers.

## Suggested direction (non-binding, optional)
Recast the sentence to the default's current role — schema-only callers omit
`enums` — without a member count, or move the bug-0028 sequencing to the bug
doc where it already lives.

## False-positive check
- Count verified two ways: the single-line pattern search above (20 hits, one
  three-argument over-match excluded by reading
  tests/wire-translation-inbound-retag.test.ts:573), and per-site reads of the
  nineteen listed lines confirming exactly two arguments at each.
- Production-caller check: `lowerQueryResponseSchema(` grepped across src/,
  extensions/, tools/ — call sites are exactly production-theta-producer.ts:3194
  and :4544, both three-argument, so the default's live beneficiaries are the
  test callers counted above.
- Not a vestigial-default claim: the default IS read (the nineteen two-argument
  calls exercise it), so no deadness or vestigiality is asserted against the
  parameter itself — the claim is confined to the counted sentence.
- History intent: the sentence cites bug 0028 §Fix as its origin; the
  two-argument callers include files created by later fixes (b0291, b0352,
  b0353, b0355, b0399, b0465-adjacent waves), showing drift after the sentence
  was written rather than an error at birth.
- Overlap check: no filed finding cites query-schema-lowering.ts;
  qw20260907183353-d2-06-empty-schema-body-caller-roster-stale concerns
  `emptySchemaBodyDiagnostic` in src/parser/schema-declarations.ts, a different
  module and claim.

## Triage
