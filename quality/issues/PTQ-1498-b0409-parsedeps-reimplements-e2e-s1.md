---
id: PTQ-1498
title: b0409-omitted-defaulted-binds-default.test.ts's local parseDeps() reconstructs the canonical e2e-s1 parseDeps() field-for-field
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0409-omitted-defaulted-binds-default.test.ts:97-106
  - tests/helpers/e2e-s1.ts:60-63
  - tests/helpers/e2e-s1.ts:65-67
  - tests/helpers/e2e-s1.ts:89
sites: 2
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# b0409-omitted-defaulted-binds-default.test.ts's local parseDeps() reconstructs the canonical e2e-s1 parseDeps() field-for-field

## Observation
`tests/b0409-omitted-defaulted-binds-default.test.ts` declares a module-scope
`parseDeps(): ParseThetaDocumentDeps` that hand-builds a
`SystemNoteChannelDeps` (`pi.sendMessage` no-op, `ui.notify` no-op,
`emitDiagnostic` no-op) and a `ModelReferenceMatcher` whose `resolve` always
returns `"resolved"`. `tests/helpers/e2e-s1.ts` already exports a `parseDeps()`
built from its own `inertSystemNote()` and `resolvingMatcher`, which construct
the identical shape under identical field values, and this exported
`parseDeps` is what the file's own `parseDoc` uses to drive
`parseThetaDocument`. The in-scope file does not import `e2e-s1` at all.

## Evidence
`tests/b0409-omitted-defaulted-binds-default.test.ts:97-106`:
```ts
function parseDeps(): ParseThetaDocumentDeps {
  return {
    systemNote: {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    } as unknown as SystemNoteChannelDeps,
    modelMatcher: { resolve: (): "resolved" => "resolved" } as ModelReferenceMatcher,
  };
}
```

`tests/helpers/e2e-s1.ts:60-67,89` (the canonical pieces this reconstructs):
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};
...
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

Both functions return the same field values for every property
(`pi.sendMessage`, `ui.notify`, `emitDiagnostic` all no-ops; `modelMatcher`
resolves `"resolved"`); the only difference is the in-scope copy inlines the
literal object instead of calling the exported helper, and casts through
`as unknown as` where the canonical version types the object directly.

## Why this is a problem
The same "inert parse deps" value is constructed twice under two independent
declarations. A change to `ParseThetaDocumentDeps`'s required shape (a new
field, a renamed `systemNote` key) that the canonical `e2e-s1.parseDeps` picks
up would leave this file's copy silently stale until its own compile fails or
diverges, because nothing ties the two declarations together. This is the
identical duplication shape already confirmed and fixed once in this
repository for a different file (`quality/resolved/PTQ-0998-parsedeps-reimplements-e2e-s1.md`,
`tests/tools-entry-closed-grammar-lockstep.test.ts:251-262` against the same
`tests/helpers/e2e-s1.ts` export), which this file was not migrated to.

## Suggested direction (non-binding, optional)
The file already imports several other test-only types from `../src/...`; the
canonical `parseDeps` export at `tests/helpers/e2e-s1.ts:89` is the natural
shared home already used by every migrated `b0xxx` file's own front-end
parse harness.

## False-positive check
- Gate-pin: this is not a `*gate*.test.ts` file and asserts no pinned
  count/inventory; the carve-out does not apply.
- Recording-double: `parseDeps()` builds an inert no-op systemNote/matcher, not
  a recording double asserting a MUST-NOT-call witness; the carve-out does not
  apply.
- docs/bugs/ signature search: `grep -rn "parseDeps" docs/bugs/0409*` — no hit;
  this file's own header states the fixture posture ("NO SILENT SKIPPING") but
  makes no claim about `parseDeps`'s implementation, so no documented
  correct-reason-red applies here.
- coverage-matrix/bug-doc citation search: `grep -rn "b0409-omitted-defaulted-binds-default" docs/reference/coverage-matrix.md docs/bugs/*.md` —
  no hit naming this file's `parseDeps` function specifically; the file itself
  is not proposed for merge/rename/delete, only its local `parseDeps`
  declaration, so no citation constraint is crossed.
- Confirmed this is not a coverage claim: the finding is about an existing
  local declaration duplicating an existing exported helper, not about a
  missing test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim (tests/b0409-omitted-defaulted-binds-default.test.ts:97-106; tests/helpers/e2e-s1.ts:60-67,89-91), the local parseDeps sets the same fields to the same values as the exported one (no-op pi.sendMessage/ui.notify/emitDiagnostic plus resolve→"resolved"), it records nothing, and its only consumer is parse() at :111; the file does not import e2e-s1, so the fix is a mechanical import swap that also drops the now-unused SystemNoteChannelDeps import and the ModelReferenceMatcher named import (ParsedFrontmatter stays); one inaccuracy that does not change the verdict: the "file's own parseDoc" is actually e2e-s1's parseDoc at :107, not the test file's; not a gate file or recording double, docs/bugs/0409* has no parseDeps hit; not a duplicate — PTQ-0328/0447/0789/0998 do not cite b0409 and no open issue in quality/issues names it; D7 boilerplate duplication (triage: claude-opus-5-5)
