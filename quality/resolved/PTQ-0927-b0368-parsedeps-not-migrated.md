---
id: PTQ-0927
title: b0368 still hand-rolls the byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0368-plus-ordering-laundered-belt.test.ts:121-129
  - tests/helpers/e2e-s1.ts:36-68
sites: 1
fix_scope: module             # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918092852
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0368 still hand-rolls the byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports

## Observation
`tests/b0368-plus-ordering-laundered-belt.test.ts` declares a module-scope `function parseDeps(): ParseThetaDocumentDeps` that builds an inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`) plus a trivially-resolving `ModelReferenceMatcher`. `tests/helpers/e2e-s1.ts` already exports a `parseDeps()` producing the field-for-field identical value from its own `inertSystemNote()`/`resolvingMatcher` pieces. The file does not import `./helpers/e2e-s1` anywhere.

## Evidence

`tests/b0368-plus-ordering-laundered-belt.test.ts:121-129` (re-read immediately before filing):
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

`tests/helpers/e2e-s1.ts:36-68` (the canonical, exported version, re-read immediately before filing):
```ts
/** An in-band, no-op system-note channel that discards emitted batches. */
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};
...
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

Field-by-field the two shapes agree: `systemNote.pi.sendMessage` a no-op, `systemNote.ui.notify` a no-op, `systemNote.emitDiagnostic` a no-op, `modelMatcher.resolve` returning the literal `"resolved"`. Exact search: `grep -n "helpers/e2e-s1" tests/b0368-plus-ordering-laundered-belt.test.ts` → 0 hits.

Pattern-wide precedent: quality/resolved/PTQ-0533 (`status: fixed`) filed and fixed the identical claim for tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts — all three now import `parseDeps` from `./helpers/e2e-s1` (confirmed: `grep -n '^import.*parseDeps.*e2e-s1' tests/b0365-index-kind-belt.test.ts tests/b0366-join-element-laundered-belt.test.ts tests/b0367-null-left-binary-minus.test.ts` → 3 hits). quality/resolved/PTQ-0386 fixed the same shape for tests/b0369-control-flow-kind-belts.test.ts and tests/b0417-responses-binder-toolchoice-gate.test.ts. tests/b0368-plus-ordering-laundered-belt.test.ts — an earlier-numbered sibling of both fixed groups — still carries its own unmigrated local copy.

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s `parseDeps()` export exists precisely to hold this value once; two separate prior fixes (PTQ-0533, PTQ-0386) already migrated five sibling files off an identical local declaration. `tests/b0368-plus-ordering-laundered-belt.test.ts` reproduces the same nine-line function byte-for-byte, functionally identical to the exported helper, without importing it — the same root cause those fixes addressed elsewhere, left standing in this file.

## Suggested direction (non-binding, optional)
The local declaration is a candidate to be dropped in favour of importing `parseDeps` from `./helpers/e2e-s1`, the same substitution the five sibling files already made.

## False-positive check
- Gate-pin check: tests/b0368-plus-ordering-laundered-belt.test.ts does not match `*gate*.test.ts` or the named kin; `parseDeps()` is harness plumbing, not a pinned count or inventory assertion.
- Recording-double check: `parseDeps()` returns static no-op stubs consumed as constructor input, not a recording double asserted against for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0368-plus-and-ordering-laundered-operands-silent-js-coercion.md is `Status: fixed (0.348.0)`; `npx vitest run tests/b0368-plus-ordering-laundered-belt.test.ts` passes in full at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0368-plus-ordering-laundered-belt" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` — only that the local `parseDeps()` could be imported from the existing helper — so no citation is affected.
- Duplicate-of-resolved check: quality/resolved/PTQ-0533's own `locations` cite only tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts; quality/resolved/PTQ-0386's own `locations` cite only tests/b0369-control-flow-kind-belts.test.ts and tests/b0417-responses-binder-toolchoice-gate.test.ts. Neither fix's locations or fix commit touched tests/b0368-plus-ordering-laundered-belt.test.ts (confirmed by the local declaration still present at the cited lines), so this is a new, unfixed instance of the same root cause in a file neither prior fix reached.
- Coverage-drift check: the claim is about a repeated harness definition, not a missing test path; the file's own passing tests are unaffected by the claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: tests/b0368-plus-ordering-laundered-belt.test.ts:121-129 declares a module-scope `parseDeps()` consumed only by its own `parseOnly()` (:133) whose four leaf members (no-op `sendMessage`/`notify`/`emitDiagnostic`, `resolve` → the literal "resolved") are field-for-field the value tests/helpers/e2e-s1.ts:36-68's exported `parseDeps()` builds from `inertSystemNote()`/`resolvingMatcher`; `grep helpers/e2e-s1` in the file → 0 hits while the five siblings b0365/b0366/b0367 (PTQ-0533) and b0369/b0417 (PTQ-0386) each now `import { parseDeps } from "./helpers/e2e-s1"`; D7 boilerplate-duplication class in tests/ only, no carve-out applies (not a *gate* file, static no-op stubs not a recording double, docs/bugs 0368 `Status: fixed (0.348.0)`, 19/19 pass at HEAD, coverage-matrix 0 hits); not a duplicate — no open issue cites b0368, resolved PTQ-0533/0386 name only their own files, and resolved PTQ-0397's b0368 locations start at :174 (producer/pure-host harness) and never reach the :121-129 `parseDeps`; the local copy dates from the file's origin commit 7a513015 and was simply never migrated (triage: claude-fable-5-1)
