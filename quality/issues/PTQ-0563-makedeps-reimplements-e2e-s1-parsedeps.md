---
id: PTQ-0563
title: makeDeps()/makeParseDeps() are redeclared byte-for-byte in three inbound-boundary test files instead of importing tests/helpers/e2e-s1.ts's parseDeps()
lens: D7
status: open
verdict: confirmed
locations:
  - tests/inbound-boundary-binder-args.test.ts:108-116
  - tests/inbound-rebuild-declaration-order.test.ts:81-89
  - tests/inbound-translation-plan.test.ts:37-47
  - tests/helpers/e2e-s1.ts:26-38
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# makeDeps()/makeParseDeps() are redeclared byte-for-byte in three inbound-boundary test files instead of importing tests/helpers/e2e-s1.ts's parseDeps()

## Observation
tests/inbound-boundary-binder-args.test.ts (`makeParseDeps`),
tests/inbound-rebuild-declaration-order.test.ts (`makeDeps`) and
tests/inbound-translation-plan.test.ts (`makeDeps`) each declare a
module-scope function returning `ParseThetaDocumentDeps` built from an inert
`SystemNoteChannelDeps` (no-op `sendMessage`/`notify`/`emitDiagnostic`) and an
always-`"resolved"` `ModelReferenceMatcher`. All three bodies produce the
identical two-field object. tests/helpers/e2e-s1.ts already exports a
`parseDeps()` (lines 26-38) building the identical shape from its own
`inertSystemNote()`/`resolvingMatcher` helpers. A fourth file in this SAME
review scope, tests/inbound-boundary-typed-query.test.ts, already imports
`parseDoc` (which itself calls the exported `parseDeps()` internally) from
`./helpers/e2e-s1` at line 107 — demonstrating the helper is reachable from
this exact directory and already in active use by a sibling in the same
review batch.

## Evidence

tests/inbound-boundary-binder-args.test.ts:108-116 (re-read immediately before filing):
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

tests/inbound-rebuild-declaration-order.test.ts:81-89 — byte-identical:
```ts
function makeDeps(): ParseThetaDocumentDeps {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```

tests/inbound-translation-plan.test.ts:37-47 — identical fields, only the
`modelMatcher` literal reformatted onto two lines:
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

tests/helpers/e2e-s1.ts:26-38 — the canonical, already-exported equivalent,
already imported by a sibling file in this same review scope
(tests/inbound-boundary-typed-query.test.ts:107, `import { parseDoc } from
"./helpers/e2e-s1"`):
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

## Why this is a problem
Three files under review redeclare the identical "inert parse deps" fixture —
same no-op system-note channel, same always-resolving model matcher — instead
of importing the already-exported `parseDeps()` from tests/helpers/e2e-s1.ts.
A fourth file inside this exact review scope
(tests/inbound-boundary-typed-query.test.ts) imports a different export
(`parseDoc`) from that same module, showing the module is already on this
directory's import path; the three redeclarations are not explained by the
helper being hard to find from here.

## Suggested direction (non-binding, optional)
Importing `parseDeps` (or the higher-level `parseDoc`, which several of these
files' own local `loadFixture`/`parse` wrappers duplicate the shape of) from
tests/helpers/e2e-s1.ts is the home the three redeclarations, and the
sibling in-scope file's own import, already point toward.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or a listed gate
  kin; the cited lines are a deps-builder helper, not a pinned count or
  inventory.
- Recording-double: the no-op `sendMessage`/`notify`/`emitDiagnostic` stubs
  are inert stimulus wiring for a parse call, not a recording double backing
  a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "makeParseDeps\|makeDeps" docs/bugs/`
  → no hits; no documented correct-reason red discusses this duplication.
- coverage-matrix/bug-doc citation search: `grep -n
  "inbound-boundary-binder-args\|inbound-rebuild-declaration-order\|inbound-translation-plan"
  docs/reference/coverage-matrix.md` → 0 hits for all three. This finding
  proposes no merge, rename or deletion of any file or `it()`/`describe()` —
  only that the shared deps-builder could be imported rather than redeclared
  — so no citation is affected.
- Overlap check: this exact three-file grouping (inbound-boundary-binder-args,
  inbound-rebuild-declaration-order, inbound-translation-plan) does not appear
  as `locations` in any already-filed intake finding or resolved PTQ (checked
  by name against the supplied already-filed list); the broader `makeDeps`
  pattern has been filed repeatedly for OTHER file pairs elsewhere in the
  wave (e.g. qw20260917154546-d7-01-blockexpr-production-makedeps-harness-duplicated.md,
  qw20260917154546-d7-11-e2e-s4-makedeps-harness-duplicated.md), confirming
  this is the same recognised smell class applied to a distinct, uncited
  trio of sites.
- Coverage-drift check: the claim is about a repeated fixture-builder
  DEFINITION already covered by an existing exported helper, not about a
  missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: all four excerpts reproduce verbatim at the cited lines (binder-args:108-116 and rebuild-declaration-order:81-89 diff-identical modulo name, translation-plan:37-47 identical modulo one-line/two-line matcher literal, e2e-s1.ts:26-38 exports the field-for-field equal parseDeps), each local builder has exactly one call site feeding parseThetaDocument, none of the three files imports anything from ./helpers/ while inbound-boundary-typed-query.test.ts:107 does import parseDoc from ./helpers/e2e-s1, git --follow dates the helper 2026-07-13 before all three files (2026-08-14/16) so it was available to import, bugs 0067/0120/0172 are Status fixed and the three files are 22/22 green so no documented-red carve-out applies, no *gate* file and 0 coverage-matrix hits, and the location trio is distinct from resolved PTQ-0214/0239/0314/0386/0405 and from every sibling wave intake candidate (d7-01 union-alias, d7-115-02, d7-161-02 cite other files; d7-01 realAjv/d7-03/d7-04 are different fixtures in these files); the candidate's "grep makeDeps docs/bugs → no hits" is inaccurate (0106/0132 mention makeDeps in unrelated files) but that peripheral check does not touch the anchor (triage: claude-fable-5-1)
