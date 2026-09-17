---
id: PTQ-0656
title: params-default-enum-access-merge.test.ts retypes tests/helpers/e2e-s1.ts's parseDeps() instead of importing it
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/params-default-enum-access-merge.test.ts:356-364
  - tests/helpers/e2e-s1.ts:26-36
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# params-default-enum-access-merge.test.ts retypes tests/helpers/e2e-s1.ts's parseDeps() instead of importing it

## Observation
tests/params-default-enum-access-merge.test.ts declares a module-scope
`function parseDeps(): ParseThetaDocumentDeps` that builds an inert
`SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`) and a
`ModelReferenceMatcher` whose `resolve` always returns `"resolved"`.
tests/helpers/e2e-s1.ts already exports a `parseDeps()` of the identical
name and identical field values, built from its own `inertSystemNote()` and
`resolvingMatcher` internals. The in-scope file feeds its local `parseDeps()`
directly into a hand-built `parseThetaDocument(source, parseDeps())` call
inside its own `parseCell` helper, rather than importing the canonical
export it needs the identical values from.

## Evidence

tests/params-default-enum-access-merge.test.ts:356-364 (re-read immediately before filing):
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

tests/helpers/e2e-s1.ts:26-36 (the canonical export, same field values):
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

Both builders return a `ParseThetaDocumentDeps` whose `systemNote.pi.sendMessage`,
`systemNote.ui.notify`, `systemNote.emitDiagnostic` are all no-ops and whose
`modelMatcher.resolve` always returns the literal `"resolved"` — the same
four field values, assembled inline in the in-scope file instead of through
the exported function.

## Why this is a problem
The in-scope file's own `parseCell` (lines 366-379) calls
`parseThetaDocument(source, parseDeps())` where `parseDeps()` resolves to the
locally-declared function rather than the identically-named, identically-valued
export the review batch's own third file
(tests/increment-decrement-wiring.test.ts) imports directly for the same
purpose (`import { parseDoc } from "./helpers/e2e-s1";`, itself built on
`e2e-s1.ts`'s own `parseDeps()`). This is duplication with the copy cited
above against the canonical source cited above.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from tests/helpers/e2e-s1.ts in place of the local
declaration — or, since `parseCell` only needs `parseThetaDocument` fed a
per-cell `sourcePath`, importing `parseDeps` alone while keeping the
per-cell `ThetaSource` construction local — is the path a sibling file in the
same review batch already uses for the identical purpose.

## False-positive check
- Gate-pin: tests/params-default-enum-access-merge.test.ts does not match
  `*gate*.test.ts` or a listed gate kin; the cited lines are an inert parse
  deps builder, not a pinned count or inventory.
- Recording-double: `parseDeps()` is an inert parse-time double (no-op
  channel, always-resolving matcher), not a recording double backing a
  MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "inertSystemNote\|resolvingMatcher"
  docs/bugs/*.md` → no hits; no documented correct-reason red discusses this
  reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "params-default-enum-access-merge" docs/reference/coverage-matrix.md
  docs/bugs/*.md` → the bug 0181 doc cites the file for its role reproducing
  the bug's cells, never for `parseDeps`'s definition site. This finding
  proposes no merge, rename or deletion of any `it()`/`describe()` — only
  that a locally-retyped helper function could be imported instead — so no
  citation is disturbed.
- Overlap check: `grep -rl "params-default-enum-access-merge"
  quality/intake/*.md quality/resolved/*.md` (run before writing this file)
  returned no hits. The sibling finding
  `qw20260917154546-d7-01-parsedeps-reimplemented-union-alias-files.md`
  names the identical reimplementation shape in two different files
  (tests/inbound-union-arm-dispatch.test.ts,
  tests/index-element-alias-runtime-disposition.test.ts) only, so this is a
  new (third) site of the same recurring class, not a re-filing.

## Triage
verdict: confirmed — independently reproduced: both excerpts verbatim at tests/params-default-enum-access-merge.test.ts:356-364 and tests/helpers/e2e-s1.ts:26-38, the local parseDeps() is field-for-field/value-for-value identical to the export (no-op pi.sendMessage/ui.notify/emitDiagnostic, resolve → "resolved"), has exactly one call site (:372 inside parseCell, which only needs deps plus a per-cell path so the export covers the need), and the host imports nothing from tests/helpers/ while 199 test files import from ./helpers/e2e-s1 (increment-decrement-wiring.test.ts:8 imports parseDoc as claimed); helper (2026-07-13, d23c22be) predates the test (2026-08-17, e73c1aca); bug 0181 is Status fixed with the ten cells green, docs/bugs grep for inertSystemNote|resolvingMatcher = 0 hits, coverage-matrix = 0 hits, bug docs cite the file only as a witness (no it()/describe() touched, carve-out inapplicable); same per-file copy-paste-fixture class already ratified as fixes in PTQ-0214/0314/0386/0405 at other files, and sibling intakes d7-115-01/-03 and d7-04 cite this file for different blocks (:420-437 NOOP triple, :193-208 ajvArgsNote), so not a duplicate; the candidate's "no intake hits" overlap claim is stale (three same-wave siblings now cite the file) but peripheral to the anchor (triage: claude-fable-5-1)
