---
id: PTQ-0694
title: Four session-control-*.test.ts files independently redeclare tests/helpers/e2e-s1.ts's exported parseDeps() under four different local names
lens: D7
status: open
verdict: confirmed
locations:
  - tests/session-control-callable-set.test.ts:536-544
  - tests/session-control-dispatch.test.ts:67-75
  - tests/session-control-parse.test.ts:45-56
  - tests/session-control-static-checks.test.ts:196-204
  - tests/helpers/e2e-s1.ts:26-38
sites: 4
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Four session-control-*.test.ts files independently redeclare tests/helpers/e2e-s1.ts's exported parseDeps() under four different local names

## Observation
`tests/session-control-callable-set.test.ts` (`v6ParseDeps`),
`tests/session-control-dispatch.test.ts` (`parseDeps`),
`tests/session-control-parse.test.ts` (`makeDeps`), and
`tests/session-control-static-checks.test.ts` (`makeParseDeps`) each declare
a module-scope function returning `ParseThetaDocumentDeps`, built from an
inert `SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`)
and an always-`"resolved"` `ModelReferenceMatcher`. All four function bodies
build the identical two-field object, apart from cosmetic brace placement.
`tests/helpers/e2e-s1.ts` already exports a `parseDeps()` (lines 26-38)
constructing the identical shape via its own `inertSystemNote()`/
`resolvingMatcher` helpers. None of the four files imports it.

## Evidence
tests/session-control-callable-set.test.ts:536-544 (re-read immediately
before filing):
```ts
function v6ParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/session-control-dispatch.test.ts:67-75 (identical body):
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

tests/session-control-parse.test.ts:45-56 (identical body, brace layout
differs only on the `modelMatcher` literal):
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
```

tests/session-control-static-checks.test.ts:196-204 (identical body):
```ts
function makeParseDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/helpers/e2e-s1.ts:26-38 (the exported canonical form, built from its
own two private sub-helpers):
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

Exact search across the four files: `grep -n "^function v6ParseDeps\|^function parseDeps\|^function makeDeps\|^function makeParseDeps" tests/session-control-callable-set.test.ts tests/session-control-dispatch.test.ts tests/session-control-parse.test.ts tests/session-control-static-checks.test.ts` returns exactly one hit per file, matching the four locations cited above.

## Why this is a problem
The same nine-line `ParseThetaDocumentDeps` builder is retyped under four
different local names across four files that are part of the same RFC 0011
batch (all four carry the `RFC 0011 (V24a-T)` header and cross-reference each
other by filename), rather than importing the single exported `parseDeps()`
that `tests/helpers/e2e-s1.ts` already provides for exactly this shape. A
change to what "inert" means for `SystemNoteChannelDeps` or
`ModelReferenceMatcher` in this test suite requires editing four call sites
by hand instead of one.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `tests/helpers/e2e-s1.ts` (as several other files
in the suite already do) would remove all four local redeclarations; naming
that existing export is observation of where the duplicated code already
points, not a design for the change.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named
  gate kin; nothing cited is a pinned count or inventory assertion.
- Recording-double check: none of the four functions is a recording double or
  a MUST-NOT witness; each is an inert dependency builder consumed by a real
  `parseThetaDocument`/`checkInvokeStaticResolution` drive. Not applicable.
- docs/bugs/ signature search: `grep -rln "v6ParseDeps\|makeParseDeps\|parseDeps" docs/bugs/*.md` returns no hits; none of the four files is a documented correct-reason red for this shape (each file's own RED/GREEN narration concerns the RFC 0011 seam under test, never this setup helper).
- coverage-matrix/bug-doc citation search: `grep -n "session-control-callable-set\|session-control-dispatch\|session-control-parse\.test\|session-control-static-checks" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any file or `it()`/`describe()`.
- Coverage check: this finding is about a repeated helper DEFINITION that exists in all four files today, not a missing test path.

## Triage
verdict: confirmed — independently re-verified: all five excerpts match at the cited lines (callable-set:536-544, dispatch:67-75, parse:45-56, static-checks:196-204, e2e-s1.ts:26-38); a scratch diff shows three bodies byte-identical and the fourth differing only by a trailing comma in the modelMatcher literal; the four-file decl grep returns exactly one hit per file; none of the four imports from helpers/e2e-s1 (grep exit 1) while 30+ sibling tests do; e2e-s1's exported parseDeps() predates the batch (2bc69157 2026-07-19 vs c4fa4369 2026-09-16); each local is live (declared + one call); no carve-out applies (no *gate* file, inert builders not recording doubles, coverage-matrix and docs/bugs have 0 hits for the four filenames); same confirmed-and-fixed D7 copy-paste-fixture class as resolved PTQ-0214/0314/0386/0405 at new locations (per-file convention → not duplicate; sibling intake d7-140-03/-04 cite different fixtures); one peripheral inaccuracy — the stated docs/bugs grep for the generic name "parseDeps" actually hits 21 files, none of which names these four tests — does not touch the anchor (triage: claude-fable-5-1)
