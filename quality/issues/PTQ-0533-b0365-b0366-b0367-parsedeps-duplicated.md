---
id: PTQ-0533
title: b0365, b0366 and b0367 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0365-index-kind-belt.test.ts:133-141
  - tests/b0366-join-element-laundered-belt.test.ts:138-146
  - tests/b0367-null-left-binary-minus.test.ts:125-133
  - tests/helpers/e2e-s1.ts:26-38
sites: 3
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0365, b0366 and b0367 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports

## Observation
tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts each declare a module-scope `function parseDeps(): ParseThetaDocumentDeps` that builds an inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`) plus a trivially-resolving `ModelReferenceMatcher`. The three nine-line declarations are byte-identical to each other. tests/helpers/e2e-s1.ts already exports a `parseDeps()` (lines 26-38) that assembles the identical `ParseThetaDocumentDeps` shape (same no-op `sendMessage`/`notify`/`emitDiagnostic`, same `resolve: () => "resolved"`) from its own `inertSystemNote()`/`resolvingMatcher` helpers, under an `export` keyword. None of the three files imports anything from `./helpers/`.

## Evidence

tests/b0365-index-kind-belt.test.ts:133-141 (re-read immediately before filing):
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

`diff` against tests/b0366-join-element-laundered-belt.test.ts:138-146 and tests/b0367-null-left-binary-minus.test.ts:125-133 → zero output in both comparisons: byte-identical across all three files.

tests/helpers/e2e-s1.ts:26-38 (the canonical, exported `parseDeps()`, re-read immediately before filing):
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

/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```
Field-by-field the two shapes are the same values: `systemNote.pi.sendMessage` a no-op, `systemNote.ui.notify` a no-op, `systemNote.emitDiagnostic` a no-op, `modelMatcher.resolve` returning the literal `"resolved"` — the three local copies only inline what `e2e-s1.ts` factors through `inertSystemNote()`/`resolvingMatcher`.

Pattern-wide precedent: resolved PTQ-0386 ("b0369 and b0417 each hand-roll a byte-identical parseDeps() that tests/helpers/e2e-s1.ts already exports") filed and fixed the identical claim for tests/b0369-control-flow-kind-belts.test.ts and tests/b0417-responses-binder-toolchoice-gate.test.ts — both since migrated off their local copies. b0365, b0366 and b0367 (earlier bug numbers than 0369/0417) still carry the unmigrated local copy.

## Why this is a problem
tests/helpers/e2e-s1.ts's own `parseDeps()` export exists precisely to hold this value once; PTQ-0386 already established (fixed) that b0369 and b0417 redeclaring it locally is the D7 boilerplate-duplication shape this repository routes to the shared helper. tests/b0365-index-kind-belt.test.ts, tests/b0366-join-element-laundered-belt.test.ts and tests/b0367-null-left-binary-minus.test.ts reproduce the same nine-line function byte-for-byte across all three files (confirmed by direct `diff` above) and functionally identically to the exported helper, without importing it.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts already exports `parseDeps()` with the identical value; each of the three files' local declaration could be dropped in favour of importing it.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin; `parseDeps()` is harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `parseDeps()` returns static no-op stubs consumed as constructor input, not a recording double asserted against for a MUST-NOT witness; the carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0365-array-index-nonintegral-silent-undefined.md, docs/bugs/0366-join-element-precondition-no-runtime-belt.md and docs/bugs/0367-null-left-binary-minus-parses-as-unary-negation.md are all `Status: fixed`; `npx vitest run tests/b0365-index-kind-belt.test.ts tests/b0366-join-element-laundered-belt.test.ts tests/b0367-null-left-binary-minus.test.ts` → 49 passed (49) at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0365-index-kind-belt\|b0366-join-element-laundered-belt\|b0367-null-left-binary-minus" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the local `parseDeps()` could be imported from the existing helper — so no citation is affected.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every copy is exercised by its own file's passing tests (49/49, confirmed above).
- Duplicate-of-resolved check: resolved PTQ-0386 covers the same shape for b0369/b0417 only (different `locations`); this finding cites three different, earlier-numbered files not touched by that fix, so it is not a re-file of the same instance.

## Triage
verdict: confirmed — independently re-verified: `sed`-extracted tests/b0365-index-kind-belt.test.ts:133-141, tests/b0366-join-element-laundered-belt.test.ts:138-146 and tests/b0367-null-left-binary-minus.test.ts:125-133 `diff` byte-identical, each a module-scope `parseDeps()` consumed only by its file's `parseOnly()`; tests/helpers/e2e-s1.ts:26-38 exports `parseDeps()` producing the same field-for-field value (no-op sendMessage/notify/emitDiagnostic, `resolve` → "resolved"); `grep helpers/` across the three files → 0 hits; D7 boilerplate-duplication class in tests/ only, no gate/recording-double/red-signature carve-out applies (bug docs 0365/0366/0367 all `Status: fixed`, 49/49 pass at HEAD, 0 coverage-matrix hits); not a duplicate — resolved PTQ-0214/0314/0386/0405 cite different files and same-wave siblings d7-01/d7-03 cite disjoint line ranges and different root causes (triage: claude-fable-5-1)
