---
id: PTQ-0998
title: tools-entry-closed-grammar-lockstep.test.ts's local parseDeps() reconstructs the canonical e2e-s1 parseDeps() helper field-for-field
lens: D7
status: open
verdict: confirmed
locations:
  - tests/tools-entry-closed-grammar-lockstep.test.ts:251-262
  - tests/helpers/e2e-s1.ts:42-50
  - tests/helpers/e2e-s1.ts:71-73
sites: 2
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# tools-entry-closed-grammar-lockstep.test.ts's local parseDeps() reconstructs the canonical e2e-s1 parseDeps() helper field-for-field

## Observation
`tests/tools-entry-closed-grammar-lockstep.test.ts` declares a module-scope
`parseDeps(): ParseThetaDocumentDeps` (lines 251-262) that hand-builds a
`SystemNoteChannelDeps` object (`pi.sendMessage` no-op, `ui.notify` no-op,
`emitDiagnostic` no-op) and a `ModelReferenceMatcher` whose `resolve` always
returns `"resolved"`. `tests/helpers/e2e-s1.ts` already exports a
`parseDeps()` function built from its own `inertSystemNote()` and
`resolvingMatcher`, which construct the identical shape under the identical
field values, and this exported `parseDeps` is used to drive
`parseThetaDocument` elsewhere in the very same helper module (its own
`parseDoc` calls it directly).

## Evidence
`tests/tools-entry-closed-grammar-lockstep.test.ts:251-262`:
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

`tests/helpers/e2e-s1.ts:42-50` (the pieces the canonical `parseDeps`
composes):
```ts
function inertSystemNote(): SystemNoteChannelDeps {
  const pi: SystemNoteSender = { sendMessage: (): void => {} };
  return { pi, ui: { notify: (): void => {} }, emitDiagnostic: (): void => {} };
}

/** A trivially-resolving `model:` matcher (the model hook is not under test). */
const resolvingMatcher: ModelReferenceMatcher = {
  resolve: (): "resolved" => "resolved",
};
```

`tests/helpers/e2e-s1.ts:71-73` — the exported `parseDeps` that composes them:
```ts
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

Field-for-field, both `parseDeps` implementations return the same
`SystemNoteChannelDeps` shape (`pi.sendMessage` no-op, `ui.notify` no-op,
`emitDiagnostic` no-op) and the same `ModelReferenceMatcher`
(`resolve: () => "resolved"`); the in-scope file's version simply inlines
what `inertSystemNote()`/`resolvingMatcher` already build, instead of
importing `parseDeps` from `tests/helpers/e2e-s1.ts`.

## Why this is a problem
The in-scope file's local `parseDeps` and the canonical helper's exported
`parseDeps` answer "what deps does a trivial, non-model-resolving parse
need" identically, but as two independently-typed declarations: a future
change to the inert system-note shape or the resolving-matcher literal
(e.g. adding a required `SystemNoteChannelDeps` field) has to be applied to
this file's local copy separately from the canonical helper's.

## Suggested direction (non-binding, optional)
Importing `parseDeps` from `tests/helpers/e2e-s1.ts` (as the file already
imports `readCorpus` from `./helpers/corpus-reader`) would let this file ask
the canonical builder for the same inert-parse deps instead of restating its
two constituent pieces locally.

## False-positive check
- Gate-pin check: `tools-entry-closed-grammar-lockstep.test.ts` does not
  match `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: neither `parseDeps` implementation records a call
  or backs a "never called" MUST-NOT witness — both are inert stand-ins
  consumed by `parseThetaDocument` to produce a document under test. The
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "SystemNoteChannelDeps" docs/bugs/
  *.md` and `grep -rn "resolvingMatcher\|inertSystemNote" docs/bugs/*.md` →
  0 hits; no documented correct-reason red cites either declaration.
- coverage-matrix/bug-doc citation search: `grep -n
  "tools-entry-closed-grammar-lockstep" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  test, `it()`, or `describe()` — only that the local builder could import
  the canonical one instead of reconstructing its two pieces inline.
- Coverage-drift check: this finding is about a duplicated dependency
  builder inside one already-passing test file; it makes no claim that any
  behaviour or path is untested.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts reproduce verbatim (tests/tools-entry-closed-grammar-lockstep.test.ts:251-262; tests/helpers/e2e-s1.ts:42-50, 71-73) and the local `parseDeps` is field-for-field the exported one (inert `pi.sendMessage`/`ui.notify`/`emitDiagnostic` no-ops + `resolve: () => "resolved"`, same `ParseThetaDocumentDeps` return type); it records nothing and is consumed only at :335 and :426 as a plain parse input, so the recording-double carve-out does not apply; the file is not a gate test, coverage-matrix grep → 0 reproduces, and the six bug docs that cite the file (0069/0105/0106/0107/0110/0112/0253) never name the local helper as a witness; the filing's stated `SystemNoteChannelDeps` docs/bugs search is misreported (10 hits, not 0) but every hit is a production-code discussion in an unrelated bug (0023/0073/0179/0432/0451/0453), so the misreport is immaterial; no existing PTQ tracks this file's `parseDeps` (the many sibling `parseDeps`-reimplements-e2e-s1 rows — PTQ-0214/0787/0788/0841/0913/0927 etc. — each cover a different file, establishing this class as confirmed-and-fixed precedent; PTQ-0936 is the only prior row touching this file and is a different root cause); file green 13/13, and the fix is a mechanical import swap (triage: claude-fable-5-1)
