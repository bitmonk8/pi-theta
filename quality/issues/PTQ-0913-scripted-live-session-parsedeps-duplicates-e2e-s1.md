---
id: PTQ-0913
title: scripted-live-session-harness.ts's parseDeps() re-implements e2e-s1.ts's already-exported parseDeps() instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/scripted-live-session-harness.ts:101-110
  - tests/helpers/e2e-s1.ts:34-38
  - tests/helpers/e2e-s1.ts:40-43
  - tests/helpers/e2e-s1.ts:63-66
sites: 2
fix_scope: localized
d4_class: clone
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# scripted-live-session-harness.ts's parseDeps() re-implements e2e-s1.ts's already-exported parseDeps() instead of importing it

## Observation
`tests/helpers/e2e-s1.ts` exports `parseDeps()`, an inert
`ParseThetaDocumentDeps` builder combining a no-op `SystemNoteChannelDeps`
(`inertSystemNote()`) and a trivially-resolving `ModelReferenceMatcher`
(`resolvingMatcher`). `tests/helpers/scripted-live-session-harness.ts` also
exports a function named `parseDeps()`, independently constructing the same
two-field `ParseThetaDocumentDeps` value with the identical field names,
identical types, and identical inert bodies, rather than importing
`e2e-s1.ts`'s. `scripted-live-session-harness.ts`'s own `parse()` function
calls this local `parseDeps()` internally, so the duplicate is live, not
dead code.

## Evidence
`tests/helpers/e2e-s1.ts:34-38` (`inertSystemNote`):
```ts
/** An in-band, no-op system-note channel that discards emitted batches. */
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}
```
`tests/helpers/e2e-s1.ts:40-43` (`resolvingMatcher`):
```ts
/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};
```
`tests/helpers/e2e-s1.ts:63-66` (canonical `parseDeps`):
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```
`tests/helpers/scripted-live-session-harness.ts:101-110` (the re-implementation):
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```
Both functions return a value of type `ParseThetaDocumentDeps` whose
`systemNote` field is `{ pi: { sendMessage: () => {} }, ui: { notify: () =>
{} }, emitDiagnostic: () => {} }` and whose `modelMatcher` field is `{
resolve: () => "resolved" }` — field-for-field, type-for-type identical,
differing only in whether the pieces are factored into named helpers
(`inertSystemNote`/`resolvingMatcher`) or written inline. The doc comment
above each declaration is even verbatim identical: "Parse-theta-document
deps whose seams are inert offline no-ops."
`grep -n "^export function parseDeps" tests/helpers/e2e-s1.ts
tests/helpers/scripted-live-session-harness.ts` finds exactly one
declaration per file — two independent declarations of the same exported
name with the same signature and the same return value.

## Why this is a problem
`tests/helpers/e2e-s1.ts` already exports `parseDeps()`; it is the
canonical home cited by dozens of `tests/*.test.ts` files that import it
directly. `scripted-live-session-harness.ts` sits beside it under
`tests/helpers/` and could import the same symbol, but instead carries its
own copy of the identical construction, so the "inert offline no-op deps"
value now has two independent declarations to keep in sync under
`tests/helpers/` itself — the exact "copy-paste fixture where a canonical
helper exists" shape, at the level of the two helper modules rather than a
`tests/*.test.ts` caller.

## Suggested direction (non-binding, optional)
`scripted-live-session-harness.ts` could import `parseDeps` from `./e2e-s1`
in place of its own declaration, as an observation of the natural home this
value already has.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin; not applicable — both are `tests/helpers/` modules, not gate tests.
- Recording-double check: neither `parseDeps()` records any call or backs a
  "never called" witness; both are pure inert-value builders, not negative
  witnesses — the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "parseDeps" docs/bugs/*.md` → 0
  hits; no documented correct-reason red cites either declaration by name.
- coverage-matrix/bug-doc citation search: `grep -n
  "scripted-live-session-harness.ts\|e2e-s1.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` block, and neither `parseDeps()` declaration is itself
  a test — only that one import could replace one re-declaration — so no
  pinned citation is disturbed.
- Coverage check: the claim is entirely about two repeated DEFINITIONS; both
  are live (each backs its own file's exported `parse()`/`parseDoc()`
  callers), and no behaviour path is claimed untested.
- Overlap check: `grep -rl "scripted-live-session-harness.ts:10[0-9]"
  quality/intake quality/issues quality/resolved` and `grep -rl
  "scripted-live-session-harness" quality/issues quality/resolved` were run;
  every existing hit (PTQ-0328 and its many "not-migrated" descendants)
  addresses `tests/*.test.ts` files failing to import
  `scripted-live-session-harness.ts`'s exports, never this file's own
  `parseDeps()` duplicating `e2e-s1.ts`'s `parseDeps()`. No existing finding
  names this specific pair.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (e2e-s1.ts:34-38 `inertSystemNote`, :40-43 `resolvingMatcher`, :63-66 `export function parseDeps`; harness :101-110 `export function parseDeps` with the byte-identical doc comment), the two bodies construct field-for-field the same `{ systemNote: { pi.sendMessage noop, ui.notify noop, emitDiagnostic noop }, modelMatcher: { resolve → "resolved" } }` value; `grep -n "^export function parseDeps"` reproduces exactly one declaration per file (:64/:102); the harness copy is live only through its own `parse()` (:115) — all 12 tests/*.test.ts that import from the harness AND use `parseDeps` take it from `./helpers/e2e-s1`, none from the harness, so replacing the local declaration with an import is a mechanical, cycle-free dedupe (harness already imports vitest `expect`; e2e-s1.ts imports nothing from the harness); the copy dates from PTQ-0328's fix (feefe7ca, 2026-09-14) which hoisted b0288/b0319/b0414's local trio without noting e2e-s1's existing export — no design reason recorded; both locations under tests/, D7 copy-paste-fixture class, not a gate/kin, not a recording double, coverage-matrix → 0 hits; one correction — the stated `grep -rl parseDeps docs/bugs/*.md` returns 21 hits, not 0, but every hit cites e2e-s1's `parseDeps`/`parseDoc` and none pins the harness lines, so immaterial to a no-merge/no-rename finding; not a duplicate — PTQ-0628/0636 notes mention the harness `parseDeps` only as a candidate canonical home for other files' copies, and no open/resolved row names the harness↔e2e-s1 pair itself (triage: claude-fable-5-1)
