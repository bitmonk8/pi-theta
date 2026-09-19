---
id: PTQ-1033
title: b0282live and b0284live each declare a near-identical paramsShapeTheta fixture builder with its bind_model rationale comment
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/live/b0282live-unknown-applied-generic-head-registration.test.ts:187-217
  - tests/live/b0284live-non-identifier-applied-generic-head.test.ts:177-211
sites: 2
fix_scope: module
wave: qw20260918202006
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0282live and b0284live each declare a near-identical paramsShapeTheta fixture builder with its bind_model rationale comment

## Observation
`tests/live/b0282live-unknown-applied-generic-head-registration.test.ts` and
`tests/live/b0284live-non-identifier-applied-generic-head.test.ts` each
declare a module-scope `paramsShapeTheta` function that assembles the same
nine-line frontmatter/body shape — `mode: prompt`, a fixed `bind_model:
anthropic/claude-haiku-4-5`, a `params:` block whose single field's type is
the function's one argument, and the identical two-line body
(`let z = 1` / `"ok"`). Each function is preceded by a doc comment making the
identical claim in near-identical wording: that `bind_model:` is
"load-bearing, not decoration" because a `params:`-declaring theta is not
bypass-eligible, citing `classifyBinderBypass` and `resolveBinderModel` by
name and explaining that without a resolvable binder model the
registrability precondition this builder backs would be vacuous. The two
copies differ only in the parameter name (`head` vs `typeText`), the literal
field key (`p` vs the file-level `FIELD` constant `b0284p`), one added
line-wrap in the return statement and comment, and the specific `src/…`
citation lines inside the comment (reflecting each file's own bug's source
references).

## Evidence

tests/live/b0282live-unknown-applied-generic-head-registration.test.ts:187-217:
```ts
/**
 * The `params:` carrier's fixture SHAPE, parameterised ONLY by the head written
 * at the `params:` right-hand side, so the carrier and its registrability
 * precondition below differ in that one token and in nothing else.
 *
 * `bind_model:` is load-bearing, not decoration. A theta that declares `params:`
 * is not bypass-eligible (`classifyBinderBypass`,
 * `src/extension/production-composition.ts` line 994), so its binder model must
 * resolve at LOAD from the `bind_model:` → `theta.binderModel` chain; when
 * neither resolves, `resolveBinderModel` (`src/binder/binder-model.ts`) raises
 * error-severity `theta/load/binder-model-unresolved` and the load walk drops the
 * theta at line 1034 — the SAME registration denial this cell attributes to the
 * head gate. Without a resolvable binder model the carrier's absence assertion
 * would hold for that unrelated reason with the gate active AND with it removed,
 * witnessing nothing. Measured offline over the shipped composition root: the
 * head below is the only variable that moves the outcome.
 */
function paramsShapeTheta(head: string): string {
  return [
    "---",
    "description: d",
    "mode: prompt",
    "bind_model: anthropic/claude-haiku-4-5",
    "params:",
    `  p: '${head}'`,
    "---",
    "",
    "let z = 1",
    '"ok"',
  ].join("\n") + "\n";
}
```

tests/live/b0284live-non-identifier-applied-generic-head.test.ts:177-211
(re-read immediately before filing):
```ts
/**
 * The offender's fixture SHAPE, parameterised ONLY by the type written at the
 * `params:` right-hand side, so the offender and its registrability
 * precondition below differ in that one token and in nothing else.
 *
 * `bind_model:` is load-bearing, not decoration. A theta that declares `params:`
 * is not bypass-eligible (`classifyBinderBypass`,
 * `src/binder/binder-envelope.ts` line 204, consulted at
 * `src/extension/production-composition.ts` line 995), so its binder model must
 * resolve at LOAD from the `bind_model:` → `theta.binderModel` chain; when
 * neither resolves, `resolveBinderModel` (`src/binder/binder-model.ts` line 179)
 * raises
 * error-severity `theta/load/binder-model-unresolved` and the load walk drops
 * the theta — the SAME registration denial this cell attributes to the head
 * gate. Without a resolvable binder model the offender's absence assertion
 * would hold for that unrelated reason with the gate active AND with it
 * removed, witnessing nothing. The type below is the only variable that moves
 * the outcome.
 */
function paramsShapeTheta(typeText: string): string {
  return (
    [
      "---",
      "description: d",
      "mode: prompt",
      "bind_model: anthropic/claude-haiku-4-5",
      "params:",
      `  ${FIELD}: '${typeText}'`,
      "---",
      "",
      "let z = 1",
      '"ok"',
    ].join("\n") + "\n"
  );
}
```

Exact search: `grep -rn "function paramsShapeTheta" tests/live/*.test.ts` →
exactly these two hits, both inside this wave's scope.

## Why this is a problem
Both files independently assemble the identical nine-line fixture shape and
independently restate the identical "bind_model is load-bearing" rationale
that justifies it — the same registrability-precondition idiom (bug 0282's
`params:` carrier and bug 0284's `params:` offender share the exact same
frontmatter requirement, since both are `params:`-declaring thetas that are
not bypass-eligible). A change to the fixed frontmatter lines (the pinned
model, the two-line body, the `params:` key layout) or to the binder-model
citation the comment makes would need to land in both copies with nothing
enforcing that a second copy is not left stale.

## Suggested direction (non-binding, optional)
A single shared `paramsShapeTheta(field, typeText)`-shaped builder — parallel
to the shared `promptTheta`/`noteChannelTheta` helpers both files already
import from `tests/helpers/live-diagnostic-oracle` — is the natural home the
two files' own import block already points at.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; both cited functions are plain fixture-text builders, not pinned
  counts or inventories.
- Recording-double check: `paramsShapeTheta` returns a static string; it
  records no calls and backs no "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -n "Status" docs/bugs/0282-*.md
  docs/bugs/0284-*.md` — both report fixed status; neither doc names
  `paramsShapeTheta` or documents this duplication as a correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0282live\|b0284live"
  docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no
  merge, rename or deletion of either test file or its `it()` block, only
  that the shared builder could be declared once.
- Coverage check: the claim is about a duplicated fixture-builder
  declaration and its accompanying rationale comment, not a missing test
  path; each file's own assertions against its own planted theta are
  unaffected.
- Duplicate-search: `grep -rl "paramsShapeTheta" quality/issues/*.md
  quality/resolved/*.md quality/intake/*.md` → 0 hits before this filing.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at b0282live:187-217 and b0284live:177-211; a mktemp whitespace-normalised diff of the two `paramsShapeTheta` bodies differs only in the parameter name (`head`/`typeText`), the field key (`p` vs `${FIELD}`) and b0284's wrapping parens — the nine frontmatter/body lines are otherwise identical, and the "load-bearing, not decoration" rationale comment recurs in exactly these two files (`grep -rn "load-bearing, not decoration" tests/ src/` → 2); `grep -rn "function paramsShapeTheta" tests/` → exactly these 2 (each with 2 live callers at :223/:236 and :217/:230); the pair is correctly scoped against the wider `bind_model: haiku` + `params:` family (13 other tests/live files) whose builders carry a different `@`-query/BODY_MARKER body and no `description: d`; tests/helpers/live-diagnostic-oracle.ts exports promptTheta/toolsTheta/noteChannelTheta but no params-shape builder; neither file is a gate, coverage-matrix 0 hits, bug docs 0282 (fixed 0.280.0) and 0284 (fixed 0.281.0) cite the test files by path/stem but no merge/rename/delete is proposed; not a duplicate — PTQ-0219/0431/0933 cover the offline tests/b028x `paramsTheta`/load-row trio and PTQ-0615 the live cells' `promptTheta`/CASE_CODE builder, none names `paramsShapeTheta`; same D7 copy-paste-fixture class as PTQ-0615 (triage: claude-fable-5-1)
