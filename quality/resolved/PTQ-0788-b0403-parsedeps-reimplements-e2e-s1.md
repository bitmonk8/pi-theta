---
id: PTQ-0788
title: b0403's local parseDeps() reimplements the canonical tests/helpers/e2e-s1.ts parseDeps() fixture
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/b0403-unary-minus-message-registry-divergence.test.ts:191-199
  - tests/helpers/e2e-s1.ts:30-42
  - tests/b0406-object-typed-params-misclassified-string.test.ts:3
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0403's local parseDeps() reimplements the canonical tests/helpers/e2e-s1.ts parseDeps() fixture

## Observation
tests/b0403-unary-minus-message-registry-divergence.test.ts declares its own
local `parseDeps(): ParseThetaDocumentDeps` function that builds an inert
`SystemNoteChannelDeps` (no-op `pi.sendMessage`, no-op `ui.notify`, no-op
`emitDiagnostic`) and a trivially-resolving `ModelReferenceMatcher`, then
returns `{ systemNote, modelMatcher }`. `tests/helpers/e2e-s1.ts` already
exports a `parseDeps()` that constructs and returns the identical two-field
deps object from the identical inert no-op seams. Another file in this same
review scope, tests/b0406-object-typed-params-misclassified-string.test.ts,
imports and uses that exact canonical export
(`import { parseDoc, parseDeps, errors } from "./helpers/e2e-s1";`) rather
than restating it.

## Evidence
tests/b0403-unary-minus-message-registry-divergence.test.ts:191-199
```typescript
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

tests/helpers/e2e-s1.ts:30-42
```typescript
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

tests/b0406-object-typed-params-misclassified-string.test.ts:3 (in-scope proof
the canonical export is a live, importable, currently-used helper, not a
theoretical one)
```typescript
import { parseDoc, parseDeps, errors } from "./helpers/e2e-s1";
```

Both b0403's local function and e2e-s1's exported function build the exact
same `pi.sendMessage` no-op, the exact same `ui.notify` no-op, the exact same
`emitDiagnostic` no-op, and the exact same `resolve: () => "resolved"`
matcher, then return them under the same two field names (`systemNote`,
`modelMatcher`) on the same `ParseThetaDocumentDeps` shape. The only
difference is that e2e-s1 factors the system-note object into a named helper
(`inertSystemNote`) while b0403 inlines it — a restructuring, not a semantic
difference.

## Why this is a problem
tests/helpers/e2e-s1.ts's own header states its purpose is to be the shared
driver so "a test can assert on the returned diagnostics / tokens without a
model or session" — it is the named home for exactly this fixture. b0403
restates the fixture instead of importing it, and the restatement is proven
avoidable within this very review scope: b0406 imports the identical export
from the identical file for the identical purpose. This is the "copy-paste
fixtures/doubles" class: a double re-implemented where a canonical helper
already exists under tests/helpers/ and is already in active use.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts's exported `parseDeps` is the natural home for this
fixture, as b0406 already demonstrates by importing it directly.

## False-positive check
- Gate-pin check: b0403 is not a `*gate*.test.ts` file and files no pinned
  census/inventory count; the local `parseDeps` is plumbing, not a pinned
  assertion.
- Recording-double check: `parseDeps`'s no-op seams record nothing and are
  never asserted against as a MUST-NOT witness — not a negative-witness
  double.
- docs/bugs/ signature search: `grep -rn "b0403" docs/bugs/` finds
  `docs/bugs/0403-unary-minus-message-diverges-diag4-sanction-never-landed.md`,
  whose §Fix/Gates section names
  `tests/b0403-unary-minus-message-registry-divergence.test.ts` as a witness
  by file name only (5/5 tests), not by internal helper structure; it does
  not cite or pin the local `parseDeps` function, so this finding does not
  propose merging, renaming, or deleting the cited test file — only that its
  internal parse-deps plumbing could import rather than restate the existing
  export.
- coverage-matrix.md citation search: `grep -n "b0403" docs/reference/coverage-matrix.md`
  returns no hits.
- Scope check: both cited test files are inside the reviewed set (b0403,
  b0406); the canonical helper cited (tests/helpers/e2e-s1.ts) is not itself
  being filed against — it is cited only to show the existing, already-used
  home for the fixture, per the coverage/routing rule that a helper file
  outside the briefed scope is not itself a filing target.

## Triage
verdict: confirmed — independently re-verified: tests/b0403-unary-minus-message-registry-divergence.test.ts:191-199 declares a local `parseDeps()` whose `pi.sendMessage`/`ui.notify`/`emitDiagnostic` no-ops and `resolve: () => "resolved"` matcher are semantically identical to the exported `parseDeps()` at tests/helpers/e2e-s1.ts:30-42 (only the `inertSystemNote` factoring differs), it is live (sole caller :217 `parseThetaDocument(source, parseDeps())`), and the canonical export is in active use (91 tests/ files import parseDeps from ./helpers/e2e-s1, b0406:3 among them); both locations under tests/, D7 copy-paste-fixture class, not a `*gate*` file, no recording-double or red-test carve-out, stated searches reproduce (docs/bugs → only 0403 citing the file by name; coverage-matrix → 0 hits); not a duplicate — `grep -rln b0403 quality/issues/ quality/resolved/` finds only PTQ-0587 (the corpus-reader trio, a different root cause) and none of the thirteen resolved parseDeps-reimplementation PTQs (0214/0314/0386/0447/0485/0533/0563/0610/0648/0656/0694/…) cite this file, while the two same-wave parseDeps siblings target different files (b0370, type-name-as-value-refusal) consistent with the per-file precedent; fix is a mechanical import swap (triage: claude-fable-5-1)
