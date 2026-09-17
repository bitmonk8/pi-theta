---
id: PTQ-0648
title: Both reviewed files redeclare makeDeps()/parse() byte-for-byte instead of importing tests/helpers/e2e-s1.ts's parseDeps()/parseDoc()
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/par-body-restriction-registry-rows.test.ts:315-330
  - tests/par-for-body-return-refusal.test.ts:105-121
  - tests/helpers/e2e-s1.ts:26-41
sites: 2
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Both reviewed files redeclare makeDeps()/parse() byte-for-byte instead of importing tests/helpers/e2e-s1.ts's parseDeps()/parseDoc()

## Observation
tests/par-body-restriction-registry-rows.test.ts and
tests/par-for-body-return-refusal.test.ts each declare a module-scope
`makeDeps(): ParseThetaDocumentDeps` (an inert no-op `SystemNoteChannelDeps`
plus an always-`"resolved"` `ModelReferenceMatcher`) and a `parse(src, path)`
wrapper around `parseThetaDocument`. tests/helpers/e2e-s1.ts already exports
the identical shape as `parseDeps()`/`parseDoc()`. The
par-body-restriction-registry-rows.test.ts file's own header comment states
its parse harness's "Shape copied from tests/par-for-body-return-refusal.test.ts
(bug 0223), not imported" — naming the copy directly, but pointing at the
sibling file rather than the already-exported helper both files in fact
reimplement.

## Evidence
tests/par-body-restriction-registry-rows.test.ts:315-330 (re-read immediately before filing):
```ts
function makeDeps(): ParseThetaDocumentDeps {
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

function parse(src: string, path = "bug0200.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

tests/par-for-body-return-refusal.test.ts:105-121 — the identical two
functions, only the default `path` literal differs:
```ts
function makeDeps(): ParseThetaDocumentDeps {
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

/** Parse a UTF-8 `.theta` source string through the production whole-file parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

tests/helpers/e2e-s1.ts:26-41 — the canonical, already-exported equivalent:
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

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

Search: `grep -rl "helpers/e2e-s1" tests/*.test.ts` → 205 files already import
this module (neither reviewed file among them); both reviewed files
independently define a `function makeDeps` of the exact shape above.

## Why this is a problem
Two files under review each redeclare the identical "inert parse deps plus a
parse wrapper" fixture that tests/helpers/e2e-s1.ts already exports under the
same field/parameter shape (`parseDeps()`, `parseDoc()`), and one of the two
files' own comment states it copied the block from the other rather than
importing the shared module 205 other files already import from this exact
directory.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts's `parseDeps`/`parseDoc` is the home both files' own
local redeclarations already converge on in shape; the two `bug0200.theta`/
`test.theta` default-path spellings are the only observed difference from
`parseDoc`'s own default.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or a listed gate kin; the
  cited lines are a deps-builder/parse-wrapper pair, not a pinned count or
  inventory.
- Recording-double: the no-op `sendMessage`/`notify`/`emitDiagnostic` stubs
  are inert stimulus wiring for a parse call, not a recording double backing
  a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "makeDeps" docs/bugs/*.md` → no
  hits discussing this duplication as a documented correct-reason red for
  either bug 0200 or bug 0223.
- coverage-matrix/bug-doc citation search: `grep -n
  "par-body-restriction-registry-rows\|par-for-body-return-refusal"
  docs/reference/coverage-matrix.md` → 0 hits for both. This finding proposes
  no merge, rename, or deletion of either file or any `it()`/`describe()` —
  only that the shared deps-builder/parse-wrapper pair could be imported
  rather than redeclared — so no citation is affected.
- Overlap check: neither file appears in `locations` of any already-filed
  makeDeps-duplication finding this wave (checked by name against the
  supplied already-filed list and by grep of `quality/intake/*.md` for both
  file names, 0 hits before this filing).
- Coverage-drift check: the claim is about a repeated fixture-builder
  definition already covered by an existing exported helper, not about a
  missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both makeDeps() bodies are byte-identical (diff exit 0 at par-body-restriction-registry-rows:315-325 vs par-for-body-return-refusal:105-115) and field-for-field/value-for-value equal to tests/helpers/e2e-s1.ts:26-41 parseDeps()/parseDoc() (parse differs from parseDoc only in the `bug0200.theta` default literal in one file); 205 tests import helpers/e2e-s1 and neither reviewed file does; the helper (2026-07-13) predates both files (2026-08-21) so it was importable; the "shape copied … not imported" comments defer to tests/par-for.test.ts whose harness carries a bare header with no stated rationale, so no documented convention carve-out applies; bugs 0200/0223 are fixed and both files are green (28/28 via vitest), coverage-matrix has 0 hits, docs/bugs makeDeps hits are about other files (tool-arg-shape-enforcement, committed-fixture-parse-gate); not a duplicate — PTQ-0214/0239/0314/0386/0405 are the same class at other files per the established per-file filing convention, and PTQ-0208 cites the registry-rows file only in a readCorpus roster (triage: claude-fable-5-1)
