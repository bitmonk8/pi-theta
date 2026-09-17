---
id: PTQ-0676
title: query-schema-resolve.test.ts redeclares the makeDeps/parse parse-layer harness instead of importing tests/helpers/e2e-s1.ts's parseDeps/parseDoc
lens: D7
status: open
verdict: confirmed
locations:
  - tests/query-schema-resolve.test.ts:35-50
  - tests/helpers/e2e-s1.ts:27-45
  - tests/shadowed-callable-call.test.ts:96-111
  - tests/empty-query-annotation.test.ts:206-222
sites: 3
fix_scope: cross-module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# query-schema-resolve.test.ts redeclares the makeDeps/parse parse-layer harness instead of importing tests/helpers/e2e-s1.ts's parseDeps/parseDoc

## Observation
`tests/query-schema-resolve.test.ts` declares its own module-scope
`makeDeps(): ParseThetaDocumentDeps` (an inert `systemNote`/`modelMatcher`
stub pair) and `parse(src, path)` wrapping `parseThetaDocument`. The
identical two-function shape — same field names, same inert `sendMessage`/
`notify`/`emitDiagnostic` no-ops, same `resolve: () => "resolved"` matcher, same
`parseThetaDocument(source, makeDeps())` call — is independently redeclared in
`tests/shadowed-callable-call.test.ts` (as `makeDeps`/`parseSource`) and in
`tests/empty-query-annotation.test.ts` (also `makeDeps`/`parseSource`, whose
own in-file comment names it "the tests/shadowed-callable-call.test.ts
makeDeps pattern"). `tests/helpers/e2e-s1.ts` already exports the same two
functions under the names `parseDeps()` and `parseDoc(src, path)`, with an
identical body modulo factoring `inertSystemNote()`/`resolvingMatcher` into
named locals.

## Evidence

tests/query-schema-resolve.test.ts:35-50 (re-read immediately before filing):
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

function parse(src: string, path = "resolve.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

tests/helpers/e2e-s1.ts:27-45 (the canonical, already-exported equivalent):
```ts
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

tests/shadowed-callable-call.test.ts:96-111 (byte-identical `makeDeps`, only
`parseSource`'s path arg differs — a module constant instead of a parameter):
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

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
```

tests/empty-query-annotation.test.ts:206-222 (byte-identical `makeDeps`, its
own preceding comment names the pattern's origin as
`tests/shadowed-callable-call.test.ts`):
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

function parseSource(src: string): ThetaDocument {
  const source: ThetaSource = { path: FILE, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

Search performed: `grep -rln "function makeDeps(): ParseThetaDocumentDeps" tests/*.test.ts` → 25 files carry a `makeDeps` of this shape; the three cited here (the in-scope file plus its two closest byte-identical counterparts, one of which names the pattern's origin in its own comment) are cited as the duplication instances for this finding.

## Why this is a problem
The in-scope file retypes the same inert `ParseThetaDocumentDeps` stub and the
same `parseThetaDocument`-wrapping call three times over (once here, twice in
the two cited counterparts) rather than importing the equivalent pair
`tests/helpers/e2e-s1.ts` already exports for exactly this purpose
(`parseDeps()`/`parseDoc()`). One of the counterparts even names the
duplication's informal lineage in its own comment ("the tests/shadowed-
callable-call.test.ts makeDeps pattern"), confirming the copy is a known,
repeated hand-transcription rather than three independently-arrived-at
designs.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s `parseDeps()`/`parseDoc()` already occupies the
natural shared home these three files' `makeDeps()`/`parse()`/`parseSource()`
each independently retype.

## False-positive check
- Gate-pin check: none of the three cited test files matches `*gate*.test.ts`
  or a listed gate kin; the cited lines are harness scaffolding, not a pinned
  count or inventory.
- Recording-double check: none of the three functions is a recording double
  backing a MUST-NOT witness — `makeDeps`/`parse` are inert stub-construction
  and parse-invocation helpers, not observers of calls.
- docs/bugs/ signature search: `grep -rln "query-schema-resolve\|shadowed-callable-call" docs/bugs/*.md` → 0 hits; neither file is cited as a documented correct-reason red for this harness.
- coverage-matrix/bug-doc citation search: `grep -n "query-schema-resolve.test.ts\|shadowed-callable-call.test.ts\|empty-query-annotation.test.ts" docs/reference/coverage-matrix.md` → 0 hits for the first two; `empty-query-annotation.test.ts` is separately covered by an already-filed finding in this wave (qw20260917154546-d7-02-empty-query-annotation-scripted-session-not-migrated.md) about a DIFFERENT scaffold family (the scripted-live-session-harness pieces, not the `makeDeps`/`parseSource` pair) — no overlap in the specific lines cited there and here.
- Overlap check: `grep -rl "shadowed-callable-call" quality/intake/*.md quality/resolved/*.md` (excluding this file) → 0 hits; this specific clone group is not already filed.
- This claim is about existing duplicated harness code across three files that already exist and already pass; it makes no claim that any behaviour or path is untested.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines, the three makeDeps bodies are byte-identical and parse/parseSource differ from tests/helpers/e2e-s1.ts parseDoc only in the default-path literal, none of the three files imports anything from helpers/e2e-s1 (grep 0 hits), the 25-file makeDeps signature count reproduces, coverage-matrix has 0 hits, bugs 0014/0016 are fixed and the three files are green 79/79, no *gate*/recording-double carve-out applies, and no PTQ cites query-schema-resolve or shadowed-callable-call (PTQ-0214/0239/0314/0386/0405 are the same confirmed class at other files → per-file-pair convention, new instance); two peripheral inaccuracies for the fixer that do not touch the anchor: the "no overlap" claim is false — same-wave sibling d7-02-empty-query-annotation-scripted-session-not-migrated (confirmed) already cites empty-query-annotation.test.ts:207-221 makeDeps against scripted-live-session-harness, so only the query-schema-resolve and shadowed-callable-call sites are net-new here, and query-schema-resolve.test.ts (2026-07-12) predates e2e-s1.ts (2026-07-13) by one day, so "instead of importing" is a present-day rather than at-creation framing (triage: claude-fable-5-1)
