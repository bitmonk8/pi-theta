---
id: PTQ-1500
title: b0437-producer-note-raw-send-fallback.test.ts's PART B parseDeps() reconstructs the canonical e2e-s1 parseDeps() field-for-field
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0437-producer-note-raw-send-fallback.test.ts:356-364
  - tests/helpers/e2e-s1.ts:60-63
  - tests/helpers/e2e-s1.ts:65-67
  - tests/helpers/e2e-s1.ts:89
sites: 2
fix_scope: localized         # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# b0437-producer-note-raw-send-fallback.test.ts's PART B parseDeps() reconstructs the canonical e2e-s1 parseDeps() field-for-field

## Observation
`tests/b0437-producer-note-raw-send-fallback.test.ts` declares a module-scope
`parseDeps(): ParseThetaDocumentDeps` (used by its own local `parse()` in
PART B, the SLSH-1 informational-note cell) that hand-builds a
`SystemNoteChannelDeps` (`pi.sendMessage` no-op, `ui.notify` no-op,
`emitDiagnostic` no-op) and a `ModelReferenceMatcher` whose `resolve` always
returns `"resolved"`. `tests/helpers/e2e-s1.ts` already exports a `parseDeps()`
built from its own `inertSystemNote()` and `resolvingMatcher`, constructing the
identical shape under identical field values. The in-scope file does not
import `e2e-s1` anywhere.

## Evidence
`tests/b0437-producer-note-raw-send-fallback.test.ts:356-364`:
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

The two declarations agree on every field value (`pi.sendMessage`,
`ui.notify`, `emitDiagnostic` all no-ops; `modelMatcher` resolves
`"resolved"`); the in-scope copy differs only in typing the intermediate
`systemNote`/`modelMatcher` locals directly instead of composing them through
`inertSystemNote()`/`resolvingMatcher`.

## Why this is a problem
The same "inert parse deps" value is independently declared a second time in
this file, with nothing tying it to the canonical export it duplicates. This
is the same duplication shape this repository has already confirmed and fixed
once for a different file against the same canonical export
(`quality/resolved/PTQ-0998-parsedeps-reimplements-e2e-s1.md`,
`tests/tools-entry-closed-grammar-lockstep.test.ts:251-262`), which this
file's PART B was not migrated to when it was authored.

## Suggested direction (non-binding, optional)
The canonical `parseDeps` export at `tests/helpers/e2e-s1.ts:89` is the
natural shared home; PART B's local `parse()` helper (which calls this local
`parseDeps()`) already mirrors `e2e-s1`'s own `parseDoc` shape closely enough
that the whole pair is a plausible single import site.

## False-positive check
- Gate-pin: this is not a `*gate*.test.ts` file and asserts no pinned
  count/inventory; the carve-out does not apply.
- Recording-double: `parseDeps()` builds an inert no-op systemNote/matcher, not
  a recording double witnessing a MUST-NOT call; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "parseDeps" docs/bugs/0437*` — no hit;
  the file's own header ("NO SILENT SKIPPING", the PART A/PART B split) makes
  no claim about `parseDeps`'s implementation, so no documented
  correct-reason-red applies.
- coverage-matrix/bug-doc citation search: `grep -rn "b0437-producer-note-raw-send-fallback" docs/reference/coverage-matrix.md docs/bugs/*.md` —
  no hit naming this file's `parseDeps` function; no merge/rename/delete is
  proposed for the file itself, only for the duplicated local declaration.
- Confirmed not a coverage claim: the finding concerns an existing local
  declaration duplicating an existing exported helper, not a missing test.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — local parseDeps() at tests/b0437-producer-note-raw-send-fallback.test.ts:356-364 reproduces verbatim and builds the same no-op pi.sendMessage/ui.notify/emitDiagnostic channel and always-"resolved" matcher as the exported tests/helpers/e2e-s1.ts:89 parseDeps (inertSystemNote 60-63, resolvingMatcher 65-67); the file does not import e2e-s1; it is not a gate file, not a recording double, and not a documented red; dedupe: PTQ-0249/0398/1368 (b0437 raw-pi claim, channel tail, channelWith) cover other causes, and PTQ-0398's triage explicitly left parseDeps out as a separate shape; PTQ-0998 is the same pattern in a different file and is resolved — a real D7 boilerplate-duplication finding with a mechanical import fix (triage: claude-opus-5-5)
