---
id: PTQ-0166
title: Two doc comments in value.ts end with a dangling blank comment line left behind when the V2c commit deleted the stub paragraph they separated
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/value.ts:497-506
  - src/runtime/value.ts:583-589
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# Two doc comments in value.ts end with a dangling blank comment line left behind when the V2c commit deleted the stub paragraph they separated

## Observation
The doc comments on `valuesEqual` and `isWireLowerable` each close with a blank
` *` line immediately before ` */`. That blank line was the paragraph separator
between the prose and a "V2c-T inert stub:" paragraph; commit 984796c1 ("V2c —
runtime value model and structural equality") deleted the stub paragraph and
left the separator. These are the only two occurrences of a blank comment line
directly before a comment terminator across the fifteen files in this review's
scope.

## Evidence
src/runtime/value.ts:497-506 — the separator with nothing after it:

```ts
/**
 * The structural deep-equality relation of runtime-value-model.md §Equality
 * (the `==` operator). Cross-type pairs compare `false`; primitives compare by
 * value with `NaN == NaN` true and `+0 == -0` true; arrays compare element-wise
 * at equal length; objects compare theta-side key set and per-key value; enum
 * variants compare the declaring-enum tag *and* the wire value; `Result`
 * compares the discriminator and recurses on the payload. Never panics and
 * never raises a diagnostic — a cross-type comparison simply evaluates `false`.
 *
 */
```

src/runtime/value.ts:583-589 — the second:

```ts
/**
 * Whether a runtime value has a lowered-schema (wire) form. A `Result` value is
 * **never** lowerable — it has no lowered-schema form and never crosses the
 * wire (runtime-value-model.md, value-representation table, `Result` row).
 * Plain primitives, arrays, objects, and enum variants are lowerable.
 *
 */
```

Git history — `git log -L 497,507:src/runtime/value.ts` shows commit 984796c1
removing the paragraph the separator introduced:

```
  * never raises a diagnostic — a cross-type comparison simply evaluates `false`.
  *
- * V2c-T inert stub: reports every pair unequal (returns `false`), so each
- * equality test reds on its `true`-expecting primary assertion (the structural-
- * equality relation is absent). The paired V2c leaf implements the relation.
  */
```

The same commit, at `git log -L 583,590:src/runtime/value.ts`, for the second:

```
  * Plain primitives, arrays, objects, and enum variants are lowerable.
  *
- * V2c-T inert stub: reports every value lowerable, so the `Result`-not-lowerable
- * test reds on its primary assertion (the `Result` non-lowerable recognition is
- * absent). The paired V2c leaf implements the recognition.
  */
```

Exhaustiveness for the reviewed scope. Search: an `awk` scan over
`src/runtime/value.ts`, `src/runtime/wire-form-depth-walk.ts`,
`src/runtime/wire-translation.ts` and `src/seams/*.ts` for a line matching
`^\s*\*\s*$` immediately followed by `^\s*\*/\s*$` — 2 hits, both listed above.

## Why this is a problem
Leftover scaffolding: each blank line is a paragraph separator whose paragraph
no longer exists, so it separates prose from nothing. Its origin is mechanically
identified — one commit deleted the text on the other side of it in both places
— and its removal is the remainder of that edit rather than a style preference.

## Suggested direction (non-binding, optional)
The two lines are the tail of an already-completed deletion.

## False-positive check
- Git history: `git log --format="%h %s" -L 497,507:src/runtime/value.ts` and
  `-L 583,590:src/runtime/value.ts` both show commit eed66a89 ("V2c-T — runtime
  value-model and equality tests") adding the separator plus its paragraph, and
  commit 984796c1 ("V2c — runtime value model and structural equality")
  deleting only the paragraph. This is deletion residue, not an authored blank.
- Verified no tooling consumes the blank line: `grep -rn "runtime/value.ts\""
  --include=*.ts tests/` returns no source-text read of this file, and `grep -n
  "typedoc\|jsdoc\|api-extractor" package.json` returns nothing, so no doc
  generator renders these comments.
- Verified this is not the file's ambient comment style: `value.ts` carries 25
  block doc comments (`grep -c "/\*\*" src/runtime/value.ts`); the other 23
  close their final paragraph directly against ` */`.
- Verified the scope-wide count with the `awk` scan above so the claim is
  exhaustive rather than a sample.

## Triage
verdict: questionable — all cited facts reproduce exactly (lines 506/589, commits 984796c1/eed66a89, awk 2 hits in scope), but the anchor is semantically inert whitespace (no doc generator, no formatter, eslint clean) and the named root cause recurs repo-wide at 22 sites in 8 files with identical stub-deletion provenance (query-error.ts/aef88150, stdlib-array.ts/d0679392), so sites:2 + localized misframes it; human should rule (triage: claude-opus-5)
verdict: confirmed — both excerpts byte-match (blank ` *` at value.ts:505 and :588) and `git log -L` at both ranges reproduces eed66a89 adding ` *` + the "V2c-T inert stub" paragraph in one hunk and 984796c1 deleting only the paragraph, so each blank line is the un-removed remainder of a historical-narration comment whose feature landed — the D2 brief's "leftover scaffolding / historical narration comments" category and the same blame-proven excision-residue anchor the store accepted for the doc-duplicate issues, not taste (the other 23 `/**` blocks in the file close directly on ` */`); nothing consumes it (no typedoc/jsdoc/api-extractor in package.json, eslint.config.js has no comment rules and passes, no test reads the source text); no PTQ covers these lines (PTQ-0013 is the :30-37 header narration, a different root cause); the same mechanism recurs repo-wide at 22 sites in 7 files with identical T-commit/impl-commit provenance (verified query-error.ts/aef88150, stdlib-array.ts/d0679392, tool-call-execute.ts/38155d3a, invoke-diagnostics.ts/d9ea72a6, drain-state.ts/c1f11bbe, literals.ts/b7f981a9), but the reviewer is confined to its 15-file shard and the store already confirms shard-scoped fragments of one mechanism as separate issues (PTQ-0071/0072/0073/0075/0093/0106/0107 stub-narration family), so sites:2/localized is correct as filed (triage: claude-opus-5)
