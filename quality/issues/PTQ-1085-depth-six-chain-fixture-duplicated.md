---
id: PTQ-1085
title: the five-deep L1..L5 schema-chain fixture and its DEPTH_6_ARGS document are declared independently in two in-scope binder-dispatch tests
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0397-binder-failure-note-runtime-event.test.ts:148-164
  - tests/binder-post-merge-ajv-enforcement.test.ts:203-209
  - tests/binder-post-merge-ajv-enforcement.test.ts:330-330
sites: 2
fix_scope: module
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# the five-deep L1..L5 schema-chain fixture and its DEPTH_6_ARGS document are declared independently in two in-scope binder-dispatch tests

## Observation
Both `tests/b0397-binder-failure-note-runtime-event.test.ts` and `tests/binder-post-merge-ajv-enforcement.test.ts` declare the identical five-level named-schema chain (`schema L1 { a: L2 }` through `schema L5 { e: string }`) and the identical `DEPTH_6_ARGS` merged-args literal (`{ p: { a: { b: { c: { d: { e: "x" } } } } } } as const`), each under its own file-local constant name (`DEEP_CHAIN_THETA` / `DEEP_CHAIN_BODY`). Each file's own doc comment states the same purpose in near-identical wording — "a/the five-deep named-schema chain … whose lowered fragment ADMITS a depth-6 `params` document … reaches the post-default-merge hook … rather than being stopped by the envelope AJV at extraction" — describing the same fixture built for the same reason: to reach the binder's post-default-merge depth-walk enforcement point (schema-subset.md enforcement point #4) with a document one level past the depth cap.

## Evidence
tests/b0397-binder-failure-note-runtime-event.test.ts:141-164:
```ts
/**
 * A five-deep named-schema chain whose lowered fragment ADMITS a depth-6
 * `params` document, so a depth-6 `ok`-envelope `args` reaches the
 * post-default-merge hook and cross-routes into the AJV-on-`args` class
 * (`ajv_args`) rather than being stopped by the envelope AJV at extraction. No
 * declared default → the depth walk over the binder's own args is the subject.
 */
const DEEP_CHAIN_THETA = [
  "---",
  "mode: prompt",
  "bind_model: binder-model",
  "params:",
  "  p: L1",
  "---",
  "schema L1 { a: L2 }",
  "schema L2 { b: L3 }",
  "schema L3 { c: L4 }",
  "schema L4 { d: L5 }",
  "schema L5 { e: string }",
  "@`p bound`",
  "",
].join("\n");
const DEEP_CHAIN_PATH = "/theta/b0397deep.theta";
const DEPTH_6_ARGS = { p: { a: { b: { c: { d: { e: "x" } } } } } } as const;
```

tests/binder-post-merge-ajv-enforcement.test.ts:198-209 (the same schema chain, factored as a body-only fragment reused by three fixtures) and :330 (byte-identical `DEPTH_6_ARGS`):
```ts
/**
 * The five-deep named-schema chain: the shape whose lowered fragment ADMITS a
 * depth-6 `params` document, so the depth breach reaches the post-default-merge
 * hook instead of being stopped by the envelope AJV at extraction. Each link is
 * a body `schema` declaration, resolved whole-file from the `params:` RHS.
 */
const DEEP_CHAIN_BODY = [
  "schema L1 { a: L2 }",
  "schema L2 { b: L3 }",
  "schema L3 { c: L4 }",
  "schema L4 { d: L5 }",
  "schema L5 { e: string }",
].join("\n");
```
```ts
const DEPTH_6_ARGS = { p: { a: { b: { c: { d: { e: "x" } } } } } } as const;
```

Search: `grep -n "schema L1 { a: L2 }" tests/*.test.ts` returns exactly these two files; `grep -n "DEPTH_6_ARGS = { p: { a: { b: { c: { d: { e: \"x\" } } } } } }" tests/*.test.ts` returns exactly the same two files.

## Why this is a problem
The `L1`..`L5` schema-depth fixture and the `DEPTH_6_ARGS` document are the specific data shape that exercises the shared enforcement point both files target (the post-default-merge depth walk over merged `args`), and both files' own doc comments describe the fixture's purpose in near-identical language. Each file types the five `schema L<n>` lines and the six-level-deep args literal on its own rather than importing one shared declaration, so a change to the depth cap's boundary value or the chain's shape needs the identical edit made twice.

## Suggested direction (non-binding, optional)
Both files already import from `tests/helpers/scripted-live-session-harness.ts` (the module the sibling PTQ-0454/PTQ-0537 fixes already consolidated other pieces of this same harness lineage into); the depth-chain body and the `DEPTH_6_ARGS` literal are the two remaining pieces of the shared "reach the post-merge depth-walk boundary" fixture that neither file's own import list currently draws from that module.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited code is a fixture literal, not a pinned count or inventory assertion.
- Recording-double check: `DEEP_CHAIN_THETA`/`DEEP_CHAIN_BODY`/`DEPTH_6_ARGS` are input fixtures, not recording doubles backing a "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "b0397-binder-failure-note-runtime-event\|binder-post-merge-ajv-enforcement" docs/bugs/*.md` finds `docs/bugs/0397-binder-failure-notes-empty-event-payload.md` and `docs/bugs/0066-ajv-verdict-discarded-unreachable-enforcement.md` (plus others) naming each file as a whole witness; none cites the `DEEP_CHAIN_THETA`/`DEEP_CHAIN_BODY`/`DEPTH_6_ARGS` declarations themselves as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0397-binder-failure-note-runtime-event\|binder-post-merge-ajv-enforcement" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`, only that the depth-chain fixture and args literal could be shared rather than retyped.
- Prior-finding check: `grep -rl "DEEP_CHAIN\|schema L1 { a: L2 }" quality/issues quality/resolved quality/intake` → 0 hits before this filing.
- Coverage check: the claim is entirely about a repeated fixture-literal DEFINITION; each file's own tests exercise its own copy against its own seam, so this is not a coverage-gap claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce at the cited lines (b0397 :148-164, enforcement :203-209 and :330); `schema L1 { a: L2 }` and the `{ p: { a: { b: { c: { d: { e: "x" } } } } } }` literal each grep to exactly these two tests/ files and to nothing under tests/helpers or src; the candidate in fact understates the clone — a node comparison (mktemp scratch) shows b0397's whole `DEEP_CHAIN_THETA` is byte-identical to the enforcement file's `DEEP_NO_DEFAULT_THETA` (same frontmatter, chain body, `@\`p bound\`` tail), not just the five schema lines; both copies are live (b0397 :168/:183/:428-430; enforcement :240/:325/:537/:541/:633/:638/:702); the b0397 copy landed 2026-09-03 (ec2a8ac2) mirroring the 2026-08-08 (94e81974) original's doc-comment wording, so this is a copy-paste fixture, not convergent design; no carve-out binds (neither file is a gate; 0 coverage-matrix hits; docs/bugs 0066/0397 name the files as whole witnesses only, and the DIAG-2 ratchet entry `theta/b0397deep` is the slug/path, untouched by sharing the body); not tracked elsewhere — PTQ-0454/0537/0926/1022 and the same-wave d7-01 TWO_PARAM_THETA filing cover different helpers/fixtures; the shared helper both files import already exports `TWO_PARAM_THETA` (:175), so the direction is consistent with existing practice (triage: claude-fable-5-1)
