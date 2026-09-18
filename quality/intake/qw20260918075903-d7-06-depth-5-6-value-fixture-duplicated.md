---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: DEPTH_5_VALUE / DEPTH_6_VALUE worked-example fixtures are declared byte-identically in tests/invoke-ceiling-depth.test.ts and tests/depth-enforcement.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - tests/invoke-ceiling-depth.test.ts:34-39
  - tests/depth-enforcement.test.ts:36-39
sites: 2
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# DEPTH_5_VALUE / DEPTH_6_VALUE worked-example fixtures are declared byte-identically in tests/invoke-ceiling-depth.test.ts and tests/depth-enforcement.test.ts

## Observation
Both files declare module-scope constants named `DEPTH_5_VALUE` and
`DEPTH_6_VALUE` holding the exact same nested-object literals — the
schema-subset.md §Depth worked example at the cap and one level over it — each
preceded by a comment restating the same depth count and the same
"deferred to AJV" / "tripping ceiling #4" framing. `depth-enforcement.test.ts`
is the `V5e-T` leaf that owns the depth-walk decision in isolation;
`invoke-ceiling-depth.test.ts` is the `V15j-T` leaf that is explicitly
"delegated" from it (its own header: "this is the delegated live-carrier
witness for V5e's params / invoke<T>-return routing rows … building on the
V15a invoke core") and its own module header names `depth-walk.ts` as a
collaborator, yet the two five/six-level worked examples are retyped rather
than imported from either file.

## Evidence
tests/invoke-ceiling-depth.test.ts:34-39:
```ts
// A depth-5 value: {a:{b:{c:{d:1}}}} — five nesting levels, at the cap (within
// ceiling #4, deferred to the downstream AJV check).
const DEPTH_5_VALUE = { a: { b: { c: { d: 1 } } } };
// A depth-6 value: {a:{b:{c:{d:{e:1}}}}} — one level over the cap
// (schema-subset.md §Depth worked example), tripping ceiling #4.
const DEPTH_6_VALUE = { a: { b: { c: { d: { e: 1 } } } } };
```

tests/depth-enforcement.test.ts:36-39:
```ts
// A depth-5 value: {a:{b:{c:{d:1}}}} — five nesting levels, at the cap (accepted).
const DEPTH_5_VALUE = { a: { b: { c: { d: 1 } } } };
// A depth-6 value: schema-subset.md §Depth worked example (rejected).
const DEPTH_6_VALUE = { a: { b: { c: { d: { e: 1 } } } } };
```

The two `const` initialisers are byte-identical
(`{ a: { b: { c: { d: 1 } } } }` and `{ a: { b: { c: { d: { e: 1 } } } } }`);
only the trailing prose in the preceding comment differs. Exact search:
`grep -rln "DEPTH_5_VALUE\|DEPTH_6_VALUE" tests/*.test.ts` → exactly these
two files, no others.

## Why this is a problem
The two constants encode the same schema-subset.md §Depth worked example (the
five-level accepted shape and the six-level breach shape that the whole `V5e`
family of ceiling-#4 leaves — `V5e-T` itself, and the delegated `V15j-T`
witness in scope here — is built around), retyped rather than shared. Neither
file imports the other's constant, and no `tests/helpers/` module currently
holds this pair, so a change to the worked example (a different cap, a
different nesting shape) requires editing the literal in both places by hand
with no compiler or test failure connecting the two edits if one is missed.

## Suggested direction (non-binding, optional)
A shared home for the `DEPTH_5_VALUE`/`DEPTH_6_VALUE` pair — e.g. exported
from `tests/depth-enforcement.test.ts` (the leaf that owns the decision in
isolation) or a small `tests/helpers/` fixture module — is where the other
`V5e`-derived leaves in this family could read the same worked example from,
rather than retyping it; that is an observation about where the duplicate
already points, not a design.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named
  census/pin-gate kin; both are `*-T` TDD leaves asserting a routing/depth
  decision, not a pinned inventory count, so the gate carve-out does not
  apply.
- Recording-double check: `DEPTH_5_VALUE`/`DEPTH_6_VALUE` are plain data
  literals, not recording doubles or fakes, so the negative-witness carve-out
  does not apply.
- docs/bugs/ signature search: `grep -rl "DEPTH_5_VALUE\|DEPTH_6_VALUE"
  docs/bugs/` → no hits; neither file is cited by a documented
  correct-reason-red bug report for this shape.
- coverage-matrix/bug-doc citation search: `grep -n
  "invoke-ceiling-depth.test.ts\|depth-enforcement.test.ts"
  docs/reference/coverage-matrix.md` found no line-range citation naming
  these specific constants or lines; this finding proposes no merge, rename,
  or deletion of any `it()`/`describe` cell, only sharing the two fixture
  constants, so no citation is at risk.
- Coverage check: both cited files' current tests continue to pass under the
  current inline literals (`npx vitest run tests/invoke-ceiling-depth.test.ts`
  → 5 tests passing; `npx vitest run tests/depth-enforcement.test.ts` → 7
  tests passing, both verified at the time of this review); this is a claim
  about a duplicated fixture definition, not a missing test path.

## Triage
verdict: questionable — independently re-verified: both excerpts reproduce verbatim at tests/invoke-ceiling-depth.test.ts:34-39 and tests/depth-enforcement.test.ts:36-39 with byte-identical initialisers, both copies live (:49/:96-100 and :51/:93/:98/:110/:146/:151/:161), the identifier search reproduces (only these two files declare the pair), no tests/helpers depth fixture exists, coverage-matrix cites neither file, both sites under tests/, D7 copy-paste-fixture class, no gate/recording-double/red-test carve-out — but the anchor is thin enough to need a human ruling: the payload is two one-line data literals of which `DEPTH_6_VALUE` is the spec's own normative worked example (schema-subset.md:37 `{"a": {"b": {"c": {"d": {"e": 1}}}}}` → depth 6 rejected) cited to its clause at both sites, each file independently asserts the depth semantics against the cap (`jsonDepth(...)).toBe(5)/(6)`, breach expected) so a mistyped copy fails its own test, and the same literal recurs under other names in ≥5 further test files (tool-calls-depth-ceiling `DEPTH_5_ARG/6_ARG`, prompt-tool-loop-governor `DEPTH_5_INPUT/6_INPUT`, subagent-return-depth-refusal:534-535, tool-calls.test.ts:300/308, defaulting-post-merge-classification:154 — acknowledged by the shard's own REVIEW_LOG:365 note) so the two-site framing dedupes 2 of ~7 copies; also the filing's stated `docs/bugs/` search is wrong — docs/bugs/0187:243 and 0202:35,236-237,515,625-626,1008 cite `DEPTH_5_VALUE (:36)` / `DEPTH_6_VALUE (:39)` by line as carrier-free pinned vehicles (immaterial to the merge/rename/delete carve-out since no cell is touched, but a refuted claim on record); whether minting a shared home for a 2-line spec-vector literal is worth it, and whether it should be filed repo-wide rather than pairwise, is a human call (triage: claude-fable-5-1)
verdict: questionable — re-verified independently: both excerpts reproduce verbatim (invoke-ceiling-depth.test.ts:34-39, depth-enforcement.test.ts:36-39), initialisers byte-identical, both copies live (7 and 5 uses), identifier grep across src/ and tests/ → only these two files declare the pair, no tests/helpers depth fixture, coverage-matrix cites neither file, no open PTQ tracks a depth fixture, both sites under tests/ in the D7 copy-paste-fixture class with no gate/recording-double/live carve-out — but the anchor is too thin to confirm: the payload is two one-line data literals whose depth-6 shape is the spec's normative vector (schema-subset.md:37) cited to its clause at both sites and independently pinned by each file's own `jsonDepth`/breach assertions (a mistyped copy fails locally), the same literal recurs under other names in 5 further test files (tool-calls-depth-ceiling `DEPTH_5_ARG/6_ARG`, prompt-tool-loop-governor `DEPTH_5_INPUT/6_INPUT`, subagent-return-depth-refusal:526-527, tool-calls.test.ts:300/308, defaulting-post-merge-classification:154) so the two-site framing dedupes 2 of ~7 copies, and the filing's stated `docs/bugs/` search is refuted (fixed bugs 0187:243 and 0202:35,236-237,625-626,1008 cite `DEPTH_5_VALUE (:36)`/`DEPTH_6_VALUE (:39)` by line as byte-untouched pinned neighbours — no open red witness, no cell touched, so no carve-out, but on record); whether a shared home for a 2-line spec-vector literal is worth minting, and pairwise vs repo-wide, needs a human ruling (triage: claude-fable-5-1)
