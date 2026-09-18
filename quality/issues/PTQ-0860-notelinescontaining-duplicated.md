---
id: PTQ-0860
title: noteLinesContaining is redeclared byte-identically in two e2e test files instead of living in tests/helpers/
lens: D7
status: open
verdict: confirmed
locations:
  - tests/extension-tool-unreachable-load-refusal-e2e.test.ts:330-346
  - tests/subagent-root-registration-refusal-envelope.test.ts:280-294
sites: 2
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# noteLinesContaining is redeclared byte-identically in two e2e test files instead of living in tests/helpers/

## Observation
Both files declare a module-private `noteLinesContaining` function with the
identical signature, implementation, and purpose (split every captured
`pi.sendMessage` note into lines and filter to lines carrying every named
substring, so a refusal-attribution assertion can pin a diagnostic to the
specific refusing theta's own note line rather than any theta's line in the
same load pass). Only the doc-comment wording differs between the two
copies; the function body is byte-for-byte identical.

## Evidence
tests/extension-tool-unreachable-load-refusal-e2e.test.ts:330-346:
```ts
/**
 * The note LINES (split across every note) that contain ALL of `substrings`.
 * Load-refusal notes are rendered diagnostic lines carrying the refusing
 * theta's file path (`<file>: <code>: <message>`), so matching a diagnostic
 * code AND the refusing theta's filename on ONE line attributes the refusal to
 * that theta — a whole-pass `toContain` would be satisfied by ANY theta's
 * refusal (e.g. the subagent `codecall` theta's), even if the theta under test
 * refused via a different diagnostic.
 */
function noteLinesContaining(
  noteContent: readonly string[],
  ...substrings: readonly string[]
): string[] {
  return noteContent
    .flatMap((note) => note.split("\n"))
    .filter((line) => substrings.every((substring) => line.includes(substring)));
}
```

tests/subagent-root-registration-refusal-envelope.test.ts:280-294:
```ts
/**
 * The note LINES (split across every note) that contain ALL of `substrings`.
 * Load-refusal notes render as `<file>: <code>: <message>`, so matching a code
 * AND the refusing theta's filename on ONE line attributes the refusal to that
 * theta — a whole-pass `toContain` would be satisfied by any other theta's
 * refusal in the same pass.
 */
function noteLinesContaining(
  noteContent: readonly string[],
  ...substrings: readonly string[]
): string[] {
  return noteContent
    .flatMap((note) => note.split("\n"))
    .filter((line) => substrings.every((substring) => line.includes(substring)));
}
```

Search performed: `grep -n "function noteLinesContaining" tests/**/*.test.ts`
— exactly these 2 hits, no third site.

## Why this is a problem
This is the boilerplate-duplication class: an 8-line helper function, doc
comment included in spirit, is declared twice with an identical body across
two files that both already import a sibling helper
(`scrubAmbientControlPlane`/`restoreAmbientControlPlane`) from
`tests/helpers/ambient-control-plane-scrub.ts` for a related concern (the
per-launch control-plane env scrub). Both files independently reinvented the
same note-line-attribution filter rather than drawing it from a shared
`tests/helpers/` module, so a future change to the attribution rule (e.g.
loosening or tightening what counts as "the same line") must be made twice
to stay consistent.

## Suggested direction (non-binding, optional)
A `tests/helpers/` module already exists for this pair of files' other
shared load-refusal-note concerns (`ambient-control-plane-scrub.ts`); naming
it as where a single `noteLinesContaining` export could live is an
observation about an existing natural home, not a design.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named
  gate/pin patterns; no pinned count/inventory is at issue.
- Recording-double carve-out: `noteLinesContaining` is a pure string filter
  over already-captured note content, not a fake recording calls to back a
  "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "noteLinesContaining"
  docs/bugs/*.md` — 0 hits; no bug document pins or excuses either copy.
- coverage-matrix/bug-doc citation search: `grep -n
  "extension-tool-unreachable-load-refusal-e2e\|subagent-root-registration-refusal-envelope"
  docs/reference/coverage-matrix.md` — 0 hits; this finding proposes no
  merge, rename, or deletion of either file or test, only observes the
  duplicated helper.
- Reference check: both call sites are live (each file's own refusal-scoped
  assertions invoke their local copy multiple times), so this is duplication
  of a live helper, not dead code.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim at tests/extension-tool-unreachable-load-refusal-e2e.test.ts:330-346 and tests/subagent-root-registration-refusal-envelope.test.ts:280-294; sed-extracted the two 8-line function bodies (:339-346 / :287-294) and diffed → zero diff (only the doc-comment differs); `function noteLinesContaining` greps to exactly these 2 declarations repo-wide (src/extensions/tools/tests/docs), both live (3 call sites at :441/:464/:524 and 2 at :380/:492), no re-export or tests/helpers export of a note-line filter exists (e2e-s1 exports only `diagLines(doc)` over a ThetaDocument, not captured note text); both files already import from ./helpers/ambient-control-plane-scrub as stated; both under tests/, D7 boilerplate-duplication class, not a gate file, not a recording double, stated searches reproduce (docs/bugs `noteLinesContaining` → 0; coverage-matrix file cites → 0; bugs 0178/0183/0207/0240/0474 cite the files but no merge/rename/delete is proposed so no carve-out applies); not tracked — PTQ-0762/0537/0479/0760 cover different note-reader/attribution helpers in different files, same-wave d7-01/d7-03 cite different helpers in these files; note for the fixer: a third copy of the same filter is inlined (not as a named function, so the filing's `function noteLinesContaining` search is accurate) at tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:298-304 — fold it into the location list at fix time (triage: claude-fable-5-1)
