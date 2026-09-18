---
id: PTQ-1018
title: subagent-fn-child-launch.test.ts's local parseDeps retypes tests/helpers/e2e-s1.ts's exported parseDeps composition
lens: D7
status: open
verdict: confirmed
locations:
  - tests/subagent-fn-child-launch.test.ts:51-59
  - tests/helpers/e2e-s1.ts:38-72
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# subagent-fn-child-launch.test.ts's local parseDeps retypes tests/helpers/e2e-s1.ts's exported parseDeps composition

## Observation
`tests/subagent-fn-child-launch.test.ts` declares a module-scope `parseDeps(): ParseThetaDocumentDeps` that builds an inert `{ pi.sendMessage, ui.notify, emitDiagnostic }` system-note stub plus an always-resolving `{ resolve: () => "resolved" }` model matcher, and returns `{ systemNote, modelMatcher }`. `tests/helpers/e2e-s1.ts` already exports a `parseDeps()` composing the identical two pieces (`inertSystemNote()` and `resolvingMatcher`) into the identical `{ systemNote, modelMatcher }` shape, under the same exported name, and is the shared parse-dependency source many sibling test files in this suite already import.

## Evidence

`tests/subagent-fn-child-launch.test.ts:51-59` (re-read immediately before filing):
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

`tests/helpers/e2e-s1.ts:38-72` — the canonical composition (same field values, split into two named pieces, wired to the same exported function name):
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

Both compose the identical `SystemNoteChannelDeps` value (`pi.sendMessage`
no-op, `ui.notify` no-op, `emitDiagnostic` no-op) and the identical
`ModelReferenceMatcher` value (`resolve: () => "resolved"`) into the same
two-field `ParseThetaDocumentDeps` return shape, under the identical exported
function name `parseDeps`.

## Why this is a problem
`tests/helpers/e2e-s1.ts` is this suite's shared parse-dependency source (its header states it wraps the real front-end entry points with "inert, in-band recording seams" for exactly this purpose), and it is already imported by numerous sibling files in the same test suite for this identical composition. `subagent-fn-child-launch.test.ts` retypes the same composition under the same function name instead of importing it, so a change to the inert system-note shape or the resolving-matcher shape (e.g. a new required `SystemNoteChannelDeps` field) is applied to the canonical export but not to this file's local copy unless both are hand-synchronised.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `./helpers/e2e-s1` in place of the local declaration is the direction the identical composition and identical exported name already point toward; this file's own local `parse(src, path)` wrapper (which adds a fixture-must-parse-clean check `e2e-s1.ts`'s `parseDoc` does not perform) can keep calling the imported `parseDeps()` in place of the local one without otherwise changing.

## False-positive check
- Gate-pin check: `subagent-fn-child-launch.test.ts` does not match `*gate*.test.ts` or a named gate kin; the cited lines are a parse-dependency fixture composition, not a pinned count or inventory assertion.
- Recording-double check: `parseDeps`'s stubs are pure inert no-ops (no recorded calls, no "never called" witness); they back the file's positive parse-then-drive assertions. The carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-fn-child-launch.test.ts" docs/bugs/0479-frontmatter-model-ignored-session-model-drives-every-turn.md` cites this file only as a witness for the FN-7 model-collision tests, not for this parse-dependency composition; no other docs/bugs file names this function or these lines.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-fn-child-launch.test.ts" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of any `it()`/`describe()` block — only that the local composition could be imported from the existing shared parse-dependency module.
- Coverage-drift check: the claim is about a repeated fixture-composition DEFINITION inside an existing, passing test file; it makes no claim that any behaviour or path is untested.
- Prior-filing search: resolved `PTQ-0706` (`tests/subagent-fn.test.ts`'s `makeDeps`/`parse` pair reimplementing the same `e2e-s1.ts` `parseDeps`/`parseDoc` pair) is the same root cause confirmed in a DIFFERENT file (`subagent-fn.test.ts`, not `subagent-fn-child-launch.test.ts`); its own per-file convention (noted in its triage: "same confirmed-and-fixed D7 copy-paste-fixture class ... at a new file → not duplicate") applies here — this is the same class recurring at a file PTQ-0706 does not cite.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/subagent-fn-child-launch.test.ts:51-59 and tests/helpers/e2e-s1.ts:39-49/:70-72, the compositions are value-for-value identical (inert pi.sendMessage/ui.notify/emitDiagnostic trio, resolve → "resolved", same { systemNote, modelMatcher } shape, same name), the local copy is live (sole caller parse() at :63) while the file imports nothing from ./helpers/e2e-s1 (grep exit 1) and 68 sibling tests import parseDeps from it; e2e-s1.ts (d23c22be, 2026-07-13) predates the test file (89faa7c5, 2026-09-15) so the helper was available at authoring; no carve-out applies (not a *gate* test, inert no-op stubs not a recording double, file green 20/20 at HEAD, docs/bugs/0479:186 cites the file only for the FN-7 collision witness, coverage-matrix 0 hits); no quality/ record (issues or resolved) names parseDeps in this file — the five resolved records citing it (PTQ-0465/0482/0688/0689/0852) cover fakeExecutableHost, noopPi, RecordingBus, M9 and the status-bus double — so this is the confirmed-and-fixed PTQ-0706/0214/0239 copy-paste-fixture class at a new file (per-file convention → not duplicate); sibling same-wave d7-01/d7-11 cite this file for noopPi, a different root cause (triage: claude-fable-5-1)
