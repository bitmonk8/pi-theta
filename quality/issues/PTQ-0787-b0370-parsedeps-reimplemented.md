---
id: PTQ-0787
title: b0370 hand-rolls a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0370-reassign-target-scope.test.ts:104-112
  - tests/helpers/e2e-s1.ts:26-43
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0370 hand-rolls a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports

## Observation
tests/b0370-reassign-target-scope.test.ts declares a module-scope `function parseDeps(): ParseThetaDocumentDeps` that builds an inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`) plus a trivially-resolving `ModelReferenceMatcher`. tests/helpers/e2e-s1.ts already exports a `parseDeps()` producing the field-for-field identical value from its own `inertSystemNote()`/`resolvingMatcher` pieces. The file does not import anything from `./helpers/e2e-s1`.

## Evidence
tests/b0370-reassign-target-scope.test.ts:104-112 (re-read immediately before filing):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/helpers/e2e-s1.ts:26-43 (the canonical, exported `parseDeps()`, re-read immediately before filing):
```ts
import type { ModelReferenceMatcher } from "../../src/parser/frontmatter";
import type { LoweredSchema } from "../../src/seams/schema-validator";

/** An in-band, no-op system-note channel that discards emitted batches. */
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```
Field-by-field the two shapes are the same values: `systemNote.pi.sendMessage` a no-op, `systemNote.ui.notify` a no-op, `systemNote.emitDiagnostic` a no-op, `modelMatcher.resolve` returning the literal `"resolved"` — b0370's local copy only inlines what `e2e-s1.ts` factors through `inertSystemNote()`/`resolvingMatcher`. `grep -n "helpers/e2e-s1" tests/b0370-reassign-target-scope.test.ts` → 0 hits.

Pattern-wide precedent: resolved quality/resolved/PTQ-0533-b0365-b0366-b0367-parsedeps-duplicated.md fixed the identical nine-line shape in tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts (all three now import `parseDeps` from `./helpers/e2e-s1`, confirmed by re-reading those files' import lists in this same review). tests/b0370-reassign-target-scope.test.ts, a sibling file in the same b03xx runtime-belt bug-report family reviewed alongside those three, still carries the unmigrated local copy.

## Why this is a problem
tests/helpers/e2e-s1.ts's `parseDeps()` export exists precisely to hold this value once; PTQ-0533 already established (fixed) that a b03xx runtime-belt file redeclaring it locally instead of importing it is the D7 boilerplate-duplication shape this repository routes to the shared helper. tests/b0370-reassign-target-scope.test.ts reproduces the same nine-line function byte-for-byte, functionally identical to the exported helper, without importing it.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already exports `parseDeps()` with the identical value; b0370's local declaration could be dropped in favour of importing it, as its three sibling files (b0365/b0366/b0367) already do.

## False-positive check
- Gate-pin check: tests/b0370-reassign-target-scope.test.ts does not match `*gate*.test.ts` or the named kin; `parseDeps()` is harness plumbing, not a pinned count or inventory assertion.
- Recording-double check: `parseDeps()` returns static no-op stubs consumed as constructor input, not a recording double asserted against for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0370-reassign-target-scope-unchecked-cross-boundary-writes.md exists and is cited by the file's own header; its Status line reads "fixed" and the file's suite passes at HEAD (all `describe`/`it` blocks execute to a pass/fail verdict, none skipped) — not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0370-reassign-target-scope" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the local `parseDeps()` could be imported from the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; the copy is exercised by the file's own passing tests.
- Duplicate-of-resolved check: resolved PTQ-0533 cites tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts as its locations only (all three now migrated, confirmed by re-reading their import lists); this finding cites a fourth, disjoint file (tests/b0370-reassign-target-scope.test.ts) not touched by that fix.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: b0370's local `parseDeps()` at tests/b0370-reassign-target-scope.test.ts:104-112 reproduces verbatim and is live (called at :116/:133/:157), the exported helper reproduces at tests/helpers/e2e-s1.ts:26-43 and yields the field-for-field identical value (three no-op system-note members + `resolve` → "resolved"), `grep helpers/e2e-s1` in the file → 0 hits, docs/bugs/0370 Status fixed (0.370.0), 33/33 green, 0 coverage-matrix hits, no gate/recording-double carve-out and no merge/rename/delete proposed; both locations under tests/, D7 boilerplate-duplication class; not a duplicate — resolved PTQ-0533 cites only b0365/b0366/b0367 (all three now import from ./helpers/e2e-s1, confirmed), resolved PTQ-0534 covers b0370's rootDouble/producer/render trio (different root cause), no open issue names b0370, and the same-wave parseDeps siblings (b0403, type-name-as-value) cite disjoint files — the not-migrated residual class PTQ-0228/PTQ-0240 established as separately filable; one overstatement on record: "byte-identical" is false — the helper factors the value through `inertSystemNote()`/a shared `resolvingMatcher` const while b0370 inlines it, so the copies are semantically equivalent, not byte-equal (immaterial to the dedupe) (triage: claude-fable-5-1)
