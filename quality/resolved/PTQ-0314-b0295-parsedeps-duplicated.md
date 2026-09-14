---
id: PTQ-0314
title: b0295 redeclares an inert parseDeps() fixture that tests/helpers/e2e-s1.ts already exports under the identical name
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0295-child-internal-cancel-wrap-arm.test.ts:483-491
  - tests/helpers/e2e-s1.ts:26-39
sites: 2                     # count of occurrences cited in Evidence
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260914060226
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-14
---

# b0295 redeclares an inert parseDeps() fixture that tests/helpers/e2e-s1.ts already exports under the identical name

## Observation
tests/b0295-child-internal-cancel-wrap-arm.test.ts declares a module-scope
`function parseDeps()` (used once, to parse a small `subagent fn` source
through the real `parseThetaDocument` in cell (G)) that builds an inert,
no-op `SystemNoteChannelDeps` (a `pi.sendMessage` no-op, a `ui.notify` no-op,
an `emitDiagnostic` no-op) plus a `ModelReferenceMatcher` whose `resolve`
always returns `"resolved"`. `tests/helpers/e2e-s1.ts` already exports a
function of the exact same name, `parseDeps()`, returning the exact same
values (the same no-op `sendMessage`/`notify`/`emitDiagnostic` triple and the
same always-`"resolved"` matcher) via its own `inertSystemNote()` +
`resolvingMatcher`. b0295 imports nothing from `tests/helpers/e2e-s1.ts`; at
least 39 other test files already do import `parseDeps` from that module for
this identical purpose.

## Evidence

tests/b0295-child-internal-cancel-wrap-arm.test.ts:483-491 — the local
declaration:
```ts
function parseDeps(): { systemNote: SystemNoteChannelDeps; modelMatcher: ModelReferenceMatcher } {
  const systemNote: SystemNoteChannelDeps = {
    pi: { sendMessage: (): void => {} },
    ui: { notify: (): void => {} },
    emitDiagnostic: (): void => {},
  };
  const modelMatcher: ModelReferenceMatcher = { resolve: (): "resolved" => "resolved" };
  return { systemNote, modelMatcher };
}
```
used once, at tests/b0295-child-internal-cancel-wrap-arm.test.ts:521:
`const doc = parseThetaDocument(source, parseDeps());`.

tests/helpers/e2e-s1.ts:26-39 — the canonical, already-exported function
under the identical name, producing the identical values via a differently
factored but behaviourally equivalent body:
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
`ParseThetaDocumentDeps` (src/parser/theta-document.ts:1023-1029) is declared
as exactly `{ readonly systemNote: SystemNoteChannelDeps; readonly
modelMatcher: ModelReferenceMatcher }` — the same two fields, same types, as
b0295's own inline return-type annotation — so the canonical export's return
value is a drop-in replacement for the local one at its one call site.

Exact search: `grep -rl "function parseDeps(): ParseThetaDocumentDeps {" tests --include="*.test.ts"`
→ 74 files carry a local copy of this same-named function; `grep -rl
"import.*parseDeps.*from \"\./helpers/e2e-s1\"" tests --include="*.test.ts"`
→ 39 files already import it from the canonical module instead (e.g.
tests/b0304-transitive-lib-diagnostics.test.ts, tests/b0302-stem-keyed-cycle-graph.test.ts,
tests/callee-post-parse-errors-un-register-tools-caller.test.ts), confirming
the import path is a proven, working substitute and not merely a
hypothetical one. tests/b0295-child-internal-cancel-wrap-arm.test.ts is the
only one of the seven files in this review's scope that declares a local
`parseDeps`; its own inline return type differs textually from
`ParseThetaDocumentDeps` (spelled out rather than named) but is structurally
identical, confirmed by both being passed directly as `parseThetaDocument`'s
second, `ParseThetaDocumentDeps`-typed argument.

## Why this is a problem
This is the "Copy-paste fixtures" class: a fixture builder is re-implemented
under the exact function name a canonical `tests/helpers/` module already
exports, producing the identical inert values (the same three no-op methods,
the same always-`"resolved"` matcher), where the canonical export is not a
hypothetical fit but one 39 sibling files already rely on for this same
purpose. b0295 already imports a different, adjacent scaffold
(`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR`/`span`/
`RecordedHop`) from `tests/helpers/invoke-seam-scaffold.ts` rather than
retyping it — a prior, confirmed finding (tracked in-repo as PTQ-0301)
established that this file was migrated to that import — but its cell (G),
the one place in the file that needs a real parsed `ThetaDocument`, still
builds its own copy of the unrelated `parseDeps` fixture from scratch instead
of reaching for the sibling helper module already proven to serve this exact
need elsewhere in the suite.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already exports a `parseDeps()` producing the
identical values under the identical name, already imported by 39 sibling
files for this same purpose; it is the existing home the local declaration
in cell (G) could import from instead of retyping.

## False-positive check
- Gate-pin check: tests/b0295-child-internal-cancel-wrap-arm.test.ts does not
  match `*gate*.test.ts` or the named kin; the cited lines are an inert
  fixture builder, not a pinned count or inventory assertion.
- Recording-double check: `parseDeps()` builds inert no-op stand-ins for a
  system-note channel and a model matcher, consumed once to parse a source
  string; nothing here backs a "never called" witness, so the
  negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0295-child-internal-cancel-wrap-arm-unreachable.md
  — Status "fixed (0.337.0)". `npx vitest run
  tests/b0295-child-internal-cancel-wrap-arm.test.ts` → 7 passed (7) at HEAD,
  so this is not a documented correct-reason red, and the bug document does
  not discuss or require a specific implementation of cell (G)'s parse-deps
  fixture.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0295-child-internal-cancel-wrap-arm" docs/reference/coverage-matrix.md` →
  0 hits. `grep -rl "b0295-child-internal-cancel-wrap-arm" docs/bugs/` → its
  own bug document plus docs/bugs/0322-unknown-tool-cause-no-producer.md,
  which cites this file only for an unrelated line-citation-drift
  reconciliation note ("Comment/citation-only line-drift … caused by the src
  insertions"), not a witness-list pin on this function. This finding
  proposes no merge, rename, or deletion of the file or any `it()`/
  `describe()` — only that one internal fixture function could be imported
  rather than redeclared — so no citation is affected.
- Overlap check against already-filed/resolved topics: PTQ-0301 ("b0295
  redeclares the SEAM_NOOP/span/RecordedHop scaffold that
  tests/helpers/invoke-seam-scaffold.ts already exports") is the closest
  prior finding on this same file and is confirmed/fixed — re-reading its
  Evidence and `locations` (verified during this review) shows it is
  confined to the `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR`/
  `span`/`RecordedHop` bundle at lines 122-154, all now imported from
  `tests/helpers/invoke-seam-scaffold.ts` per the file's current header
  (confirmed present). Neither that finding nor any other listed PTQ or
  rejection names `parseDeps` in this file; the two fixtures serve unrelated
  seams (the invoke-cancellation wrap seam versus the parser's inert
  construction deps) and sit in different, non-overlapping parts of the
  file (lines 122-154 versus 483-491).
- Coverage check: the claim is about a repeated fixture-function DEFINITION,
  not a missing test path; the function is exercised by cell (G)'s passing
  test in its own file (confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — both excerpts and all line ranges verified verbatim (b0295:483-491, e2e-s1.ts:26-39, ParseThetaDocumentDeps at theta-document.ts:1023-1029), the two fixtures are field-for-field/value-for-value identical, b0295 imports nothing from e2e-s1 while PTQ-0301's SEAM_NOOP migration is confirmed already landed in this same file, docs/bugs/0295 is fixed with 7/7 green and no coverage-matrix/witness-list citation, and no existing PTQ dedupes it (PTQ-0214 is a different file, PTQ-0301 is a different fixture); the cited sibling-importer count is overstated (35 files import parseDeps from ./helpers/e2e-s1 today, not 39) but this is a peripheral tally, not the anchor, and does not change the confirmed duplication (triage: claude-opus-5)
