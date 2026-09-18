---
id: PTQ-0737
title: wire-translation-inbound-retag.test.ts redeclares makeDeps()/parse() byte-for-byte instead of importing tests/helpers/e2e-s1.ts's parseDeps()/parseDoc()
lens: D7
status: open
verdict: confirmed
locations:
  - tests/wire-translation-inbound-retag.test.ts:47-61
  - tests/helpers/e2e-s1.ts:26-40
sites: 1
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# wire-translation-inbound-retag.test.ts redeclares makeDeps()/parse() byte-for-byte instead of importing tests/helpers/e2e-s1.ts's parseDeps()/parseDoc()

## Observation
tests/wire-translation-inbound-retag.test.ts declares its own module-scope
`makeDeps(): ParseThetaDocumentDeps` (an inert no-op `SystemNoteChannelDeps`
plus an always-`"resolved"` `ModelReferenceMatcher`) and a `parse(src, path)`
wrapper around `parseThetaDocument`, the identical shape
`tests/helpers/e2e-s1.ts` already exports as `parseDeps()`/`parseDoc()`. The
file elsewhere in the same import block already imports a different helper
from the same module (`lowerQueryResponseSchema` is imported directly from
`src/`, but the file does not import `parseDeps`/`parseDoc` from
`./helpers/e2e-s1` at all, despite it being the module 205+ other test files
already import from for the same "parse a `.theta` source through inert
deps" capability).

## Evidence

tests/wire-translation-inbound-retag.test.ts:47-61 (re-read immediately
before filing):
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

function parse(src: string, path = "retag.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

tests/helpers/e2e-s1.ts:26-40 — the canonical, already-exported equivalent:
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

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

Search: `grep -rl "helpers/e2e-s1" tests/*.test.ts` → 205 files already import
this module; tests/wire-translation-inbound-retag.test.ts is not among them.
The file's own `import` block (lines 1-29) imports directly from
`src/parser/theta-document`, `src/parser/schema-lowering`,
`src/runtime/wire-translation`, `src/runtime/query-schema-lowering`,
`src/runtime/stdlib-object`, `src/seams/schema-validator`, and
`src/runtime/value`, but never from `./helpers/e2e-s1`.

## Why this is a problem
The file redeclares the identical "inert parse deps plus a parse wrapper"
fixture that tests/helpers/e2e-s1.ts already exports under the same
field/parameter shape (`parseDeps()`, `parseDoc()`, differing only in the
default `path` literal — `"retag.theta"` here vs `parseDoc`'s `"test.theta"`),
rather than importing the shared module 205 other files already import from
the same directory this file's sibling `withheld-sentinel-*` files (also in
this review's scope) do import from.

## Suggested direction (non-binding, optional)
tests/helpers/e2e-s1.ts's `parseDeps`/`parseDoc` is the home the file's own
local `makeDeps`/`parse` pair already converges on in shape; the
`"retag.theta"` default-path spelling is the only observed difference from
`parseDoc`'s own default.

## False-positive check
- Gate-pin: the file does not match `*gate*.test.ts` or a listed gate kin;
  the cited lines are a deps-builder/parse-wrapper pair, not a pinned count
  or inventory.
- Recording-double: the no-op `sendMessage`/`notify`/`emitDiagnostic` stubs
  are inert stimulus wiring for a parse call, not a recording double backing
  a MUST-NOT-called witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -n "wire-translation-inbound-retag" docs/bugs/*.md` → dozens of hits across docs/bugs/0111 through 0262, all citing the file as a reproduction/witness file or a stale-comment-count target; none discusses the `makeDeps`/`parse` DUPLICATION itself as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "wire-translation-inbound-retag" docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge, rename, or deletion of the file or any `it()`/`describe()` block — only that the local deps-builder/parse-wrapper pair could be imported rather than redeclared — so no citation is affected.
- Overlap check: `grep -rli "wire-translation-inbound-retag" quality/intake/*.md quality/resolved/*.md` (excluding this file) → no hits naming this file's `makeDeps`/`parse` duplication.
- Coverage-drift check: the claim is about a repeated fixture-builder
  definition already covered by an existing exported helper, not about a
  missing test path.

## Triage
<!-- appended by triage -->
verdict: confirmed — re-verified independently: both excerpts match verbatim (retag.test.ts:47-61, e2e-s1.ts:26-40) and the deps are field-for-field/value-for-value identical to parseDeps() with parse() equal to parseDoc() save the default path literal, which is inert (makeDeps has one caller, parse has 3 call sites :171/:212/:572 none passing a path, "retag.theta" is asserted nowhere); grep confirms 205 e2e-s1 importers with this file absent, both withheld-sentinel siblings import it, e2e-s1.ts (d23c22be 2026-07-13) predates the test file (e18b30e5 2026-08-14) so the helper was available, file is 17/17 green at HEAD, coverage-matrix 0 hits, same-wave d7-03 cites different blocks in different files, and PTQ-0214/0239/0314/0386/0405 are the same class at other files (per-file instances ruled distinct); title's "byte-for-byte" is slightly overstated (inline vs helper-factored) but does not touch the anchor (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
