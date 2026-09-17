---
id: PTQ-0457
title: committed-fixture-parse-gate.test.ts and production-conformance.test.ts each reimplement tests/helpers/e2e-s1.ts's parseDeps instead of importing it
lens: D7
status: open
verdict: confirmed
locations:
  - tests/committed-fixture-parse-gate.test.ts:96-107
  - tests/conformance/production-conformance.test.ts:82-93
  - tests/helpers/e2e-s1.ts:27-39
sites: 2
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# committed-fixture-parse-gate.test.ts and production-conformance.test.ts each reimplement tests/helpers/e2e-s1.ts's parseDeps instead of importing it

## Observation
Both `tests/committed-fixture-parse-gate.test.ts` and
`tests/conformance/production-conformance.test.ts` declare their own
module-scope function that builds a `ParseThetaDocumentDeps`: an inert
`SystemNoteChannelDeps` (`sendMessage`/`notify`/`emitDiagnostic` all no-ops)
plus a `ModelReferenceMatcher` whose `resolve` always returns `"resolved"`.
`tests/helpers/e2e-s1.ts` already exports a `parseDeps()` function of the
identical shape and field values. Neither of the two reviewed files imports
it; each redeclares the same six-field object graph locally.

## Evidence
tests/committed-fixture-parse-gate.test.ts:96-107 — the reimplemented double:
```ts
/** Trivially-resolving seam doubles — no `pi.sendMessage`, no model lookup. */
function makeDeps(): ParseThetaDocumentDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  const systemNote: SystemNoteChannelDeps = {
    pi,
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/conformance/production-conformance.test.ts:82-93 — the same shape,
independently redeclared:
```ts
/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
function parseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = {
    resolve: (): "resolved" => "resolved",
  };
  return { systemNote, modelMatcher };
}
```

tests/helpers/e2e-s1.ts:27-39 — the canonical helper already exporting the
identical construction:
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

`tests/construct-token-table-tails.test.ts:12` (same review scope) already
imports `parseDoc` — which calls this exact `parseDeps()` internally — from
`./helpers/e2e-s1`, so the canonical import is both available and already in
live use by a sibling file in this same batch: `import { parseDoc } from
"./helpers/e2e-s1";`.

## Why this is a problem
This is the copy-paste-fixture class: both reviewed files rebuild, field for
field and value for value, the exact `ParseThetaDocumentDeps` double
`tests/helpers/e2e-s1.ts` already exports under the name `parseDeps`. The
committed-fixture-parse-gate.test.ts copy additionally threads
`deps.systemNote` into `lexTheta` directly, which e2e-s1.ts's own `lexBytes`
export already does internally (`lexBytes` builds `inertSystemNote()` and
calls `lexTheta`). Neither reimplementation is required by anything specific
to either file's own subject matter — both build the identical inert deps
graph for the identical reason (drive the real lexer/parser without a model
or system-note channel).

## Suggested direction (non-binding, optional)
Importing `parseDeps` (and, where a raw-bytes read is needed,
`parseDocBytes`/`lexBytes`) from `tests/helpers/e2e-s1.ts` is the path a
sibling file in this same review batch already takes for the identical
purpose; naming it here is an observation about where that sibling already
points, not a design for the change.

## False-positive check
- Gate-pin carve-out: `tests/committed-fixture-parse-gate.test.ts` matches
  the gate-kin naming pattern, but this finding does not challenge any pinned
  count or inventory in that file (the `EXPECTED_SHIPPED_THETA` /
  `EXPECTED_SHIPPED_THETALIB` pins are untouched) — it challenges only the
  unrelated `makeDeps()` helper duplication, so the carve-out does not
  shield this claim.
- Recording-double carve-out: `makeDeps()`/`parseDeps()` are inert
  parse-time doubles with no recorded calls asserted as MUST-NOT-happen;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "committed-fixture-parse-gate\|production-conformance" docs/bugs/*.md`
  surfaces only prose references to each file's own subject matter (H7b's
  fixture-parse obligation; production-conformance's `runSource` harness and
  stale-count history) — none excuses or pins the `makeDeps`/`parseDeps`
  block cited here. Both files pass at HEAD (unrelated to this claim), so
  this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "committed-fixture-parse-gate\|production-conformance" docs/reference/coverage-matrix.md`
  — hits exist for each file by name in the matrix, but only naming the file
  as a whole (the row/witness citation), never the `makeDeps`/`parseDeps`
  helper function specifically; this finding proposes no merge, rename, or
  deletion of either file or of any cited test, only that an internal helper
  function could import the existing export instead of redeclaring it.
- Reference/callers check: `tests/helpers/e2e-s1.ts`'s `parseDeps` export is
  a live, in-use export (construct-token-table-tails.test.ts's `parseDoc`
  import calls it internally, and PTQ-0214's resolved finding lists further
  importers), not a dead-code target being proposed.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — re-verified independently: all three excerpts match verbatim at committed-fixture-parse-gate.test.ts:96-107, production-conformance.test.ts:82-93 and e2e-s1.ts:27-39, the two local bodies are value-identical to each other (diff differs only by the hoisted `pi` const) and to the exported `parseDeps()`; neither file imports anything from helpers/e2e-s1 (grep 0 hits) while 233 test files do, git blame shows both blocks unchanged since the files' creation (a6d403e8 2026-07-03 / 12626235 2026-07-04) predating the helper (d23c22be 2026-07-13) and never migrated; both files green at HEAD (vitest 75/75), the *gate* carve-out covers pinned counts not fixture clones (EXPECTED_SHIPPED_* untouched), docs/bugs/0132 cites `makeDeps` only descriptively for its `{ systemNote, modelMatcher }` shape and coverage-matrix names the files only as whole witnesses; no PTQ tracks these two sites (PTQ-0259 cites production-conformance :234-264, the load harness; PTQ-0214/0239/0314/0386/0405 are the same class at other files, matching the established per-file-pair convention); peripheral drift only: the sibling `parseDoc` import is at construct-token-table-tails.test.ts:7, not :12 (triage: claude-fable-5-1)
