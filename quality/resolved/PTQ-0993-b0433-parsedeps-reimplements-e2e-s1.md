---
id: PTQ-0993
title: b0433's local parseDeps()/parse() reimplements the canonical tests/helpers/e2e-s1.ts parseDeps/parseDoc pair field-for-field
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0433-active-set-advisory-note-no-details.test.ts:287-300
  - tests/helpers/e2e-s1.ts:41-79
sites: 1
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0433's local parseDeps()/parse() reimplements the canonical tests/helpers/e2e-s1.ts parseDeps/parseDoc pair field-for-field

## Observation
`tests/b0433-active-set-advisory-note-no-details.test.ts` declares a local
`parseDeps(): ParseThetaDocumentDeps` and a local `parse(src): ThetaDocument`
wrapper around `parseThetaDocument`, imported directly from
`../src/parser/theta-document`. `tests/helpers/e2e-s1.ts` already exports a
`parseDeps()` function and a `parseDoc(src, path?)` function whose bodies are
field-for-field identical to b0433's local versions. A sibling file in this
same wave's scope, `tests/b0417-responses-binder-toolchoice-gate.test.ts`,
imports `parseDeps` directly from `./helpers/e2e-s1` for the identical
purpose.

## Evidence
`tests/helpers/e2e-s1.ts:41-50,71-73` (the canonical export):
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
...
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}
```

`tests/b0433-active-set-advisory-note-no-details.test.ts:287-300` (the local
reimplementation, field-for-field identical shape):
```ts
function parseDeps(): ParseThetaDocumentDeps {
  return {
    systemNote: {
      pi: { sendMessage: (): void => {} },
      ui: { notify: (): void => {} },
      emitDiagnostic: (): void => {},
    },
    modelMatcher: { resolve: (): "resolved" => "resolved" } as ModelReferenceMatcher,
  };
}

function parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "probe.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
  expect(errors, "the fixture theta must parse cleanly before it is driven").toEqual([]);
```

`tests/b0417-responses-binder-toolchoice-gate.test.ts:44,85` — the sibling
in-scope file already importing the canonical function for the same purpose:
```ts
import { callInput } from "./helpers/binder-inference-fixture";
...
import { parseDeps } from "./helpers/e2e-s1";
```

`tests/helpers/e2e-s1.ts:76-79` — `parseDoc`, the canonical wrapper b0433's
local `parse()` duplicates the shape of:
```ts
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

Field-by-field: `inertSystemNote()`'s `{ pi: { sendMessage }, ui: { notify },
emitDiagnostic }` shape and `resolvingMatcher`'s `{ resolve: () => "resolved"
}` shape are reproduced verbatim (same field names, same arrow-function
bodies, same return values) inside b0433's local `parseDeps`; b0433's local
`parse()` builds the identical `ThetaSource` object and calls
`parseThetaDocument(source, parseDeps())` the same way `parseDoc` does,
differing only in the hardcoded fixture path (`"probe.theta"` vs the
canonical default `"test.theta"`, a value `parseDoc`'s own second parameter
already accepts).

## Why this is a problem
This is the copy-paste-fixture class: `tests/helpers/e2e-s1.ts` is this
suite's existing home for the inert-system-note / resolving-matcher parse
dependency bundle, and a sibling file reviewed in this same wave
(`b0417`) already imports it directly for the same purpose. b0433
reimplements the same bundle's fields locally, using a hardcoded fixture path
that the canonical `parseDoc`'s existing `path` parameter already
accommodates, rather than importing the two functions that already exist for
exactly this need.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already exports `parseDeps` and `parseDoc` in the
shape b0433 needs (the latter already accepts a caller-supplied path); it is
the existing home this file's own local pair reproduces.

## False-positive check
- Gate-pin check: `b0433-active-set-advisory-note-no-details.test.ts` does
  not match `*gate*.test.ts` or the named gate-kin patterns; the observation
  is about a fixture/dependency-builder's definition site, not a pinned
  count or inventory assertion.
- Recording-double check: neither `parseDeps` nor `parse` records calls or
  backs a "never called" witness; the negative-witness carve-out does not
  apply.
- docs/bugs/ signature search: `docs/bugs/0433-active-set-advisory-note-fabricates-event-code.md`
  Status is fixed; the bug's subject is the advisory note's `details` shape,
  unrelated to this file's parse-dependency harness, and the doc gives no
  rationale for a local reimplementation.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0433-active-set-advisory-note-no-details" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of any
  `it()`/`describe()` name, count, or assertion — only where the internal
  `parseDeps`/`parse` pair is defined.
- Prior-finding overlap check: `grep -rl "b0433" quality/resolved/` shows
  five hits, none of which concerns `parseDeps`/`parseDoc`/`ParseThetaDocumentDeps`
  (they cover belt-probe harnesses and the `FakeActiveSetPi` double). This is
  a distinct root cause from all five.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; the local pair is exercised by the file's own tests.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: both excerpts reproduce verbatim (tests/b0433-active-set-advisory-note-no-details.test.ts:287-306 local `parseDeps`/`parse`; tests/helpers/e2e-s1.ts:41-50,71-79 exported `parseDeps`/`parseDoc`), the local `parseDeps` body is field-for-field the helper's `inertSystemNote()` + `resolvingMatcher` bundle under the same `ParseThetaDocumentDeps` type, b0433 imports nothing from ./helpers/e2e-s1 (0 hits) and its `parse()` is live (1 call at :374, file green 2/2); b0417:85 `import { parseDeps } from "./helpers/e2e-s1"` reproduces as the in-scope migrated sibling; stated searches reproduce (coverage-matrix cite → 0; docs/bugs/0433 Status fixed, no parseDeps/e2e-s1 rationale; `grep -rl b0433 quality/resolved` → PTQ-0437/0445/0447/0611/0828, none citing this file's parseDeps — PTQ-0447's triage note names b0433 only as an uncounted sibling of the b0413/b0415 trio, and PTQ-0828 covers this file's `FakeActiveSetPi`), so not a duplicate; not a gate file, not a recording double, no merge/rename/delete proposed — D7 copy-paste-fixture class, same shape as the confirmed per-file parseDeps filings (PTQ-0214/0787/0788/0841/0927); one correction on record: `parse()` differs from `parseDoc` by two precondition `expect`s (clean errors, non-null frontmatter) in addition to the path, so the fold is `parseDoc(src, "probe.theta")` plus those two lines rather than a pure one-for-one swap (triage: claude-fable-5-1)
