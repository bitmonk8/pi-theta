---
id: PTQ-0706
title: subagent-fn.test.ts's makeDeps/parse pair reimplements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-fn.test.ts:169-185
  - tests/helpers/e2e-s1.ts:27-42
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-fn.test.ts's makeDeps/parse pair reimplements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them

## Observation
`tests/subagent-fn.test.ts` declares module-local `makeDeps()` and `parse(src, path)` functions that wire an inert system-note channel plus an always-resolving `model:` matcher and drive `parseThetaDocument` with them. `tests/helpers/e2e-s1.ts` already exports `parseDeps()` and `parseDoc(src, path)` performing the identical wiring and the identical parse call, and is imported elsewhere in this file's own sibling test suite for exactly this purpose. `subagent-fn.test.ts` does not import `parseDeps`/`parseDoc` and instead retypes an equivalent pair under different names.

## Evidence

`tests/subagent-fn.test.ts:169-185`:
```ts
/** A trivially-wired diagnostic sink + resolving `model:` matcher for the parse. */
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

/** Parse a UTF-8 `.theta` (or `.thetalib`) source string through the production parser. */
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}
```

`tests/helpers/e2e-s1.ts:27-42` — the canonical pair, same inert system-note shape, same always-resolving matcher, same parse call:
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

Both pairs build the same `{ systemNote, modelMatcher }` shape (an inert `pi.sendMessage`/`ui.notify`/`emitDiagnostic` no-op trio plus a `resolve: () => "resolved"` matcher) and feed it to `parseThetaDocument` with a `(src, path = "test.theta")` signature returning a `ThetaDocument`.

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s exported `parseDeps`/`parseDoc` already perform the identical wiring `subagent-fn.test.ts`'s local `makeDeps`/`parse` perform, under a different name pair, in the same file that also separately reimplements `fakeThetaLibFs` (see the sibling finding in this wave) rather than importing the corresponding helper — a second instance of the same "own copy instead of the existing shared parse harness" pattern inside one file.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `parseDeps`/`parseDoc` already cover this shape; importing them (and keeping the file's own `codesOf` wrapper, which composes on top rather than duplicating parse-dependency wiring) is the direction the existing shared module points toward. This finding does not propose merging, renaming, or deleting any test in `tests/subagent-fn.test.ts` — only relocating the two duplicated harness functions.

## False-positive check
- Gate-pin check: `tests/subagent-fn.test.ts` does not match `*gate*.test.ts` or any named kin; not applicable.
- Recording-double check: `makeDeps`/`parse` build stub dependency wiring, not a recording double asserting a never-called invariant; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-fn.test.ts" docs/bugs/*.md` returns citations of other line ranges in this file (fixture shapes at `:1581-1614`, `:308-323`, `:404-421`); none cites lines 169-185 or names `makeDeps`/`parse` as a witness artefact.
- coverage-matrix citation search: `grep -n "subagent-fn.test.ts" docs/reference/coverage-matrix.md` → 0 hits.
- Coverage drift check: this finding does not claim a missing test or an untested path; it identifies a duplicated harness-wiring pair, leaving the file's tests and assertions untouched.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both excerpts match verbatim at tests/subagent-fn.test.ts:169-185 and tests/helpers/e2e-s1.ts:27-42, the two pairs are field-for-field/value-for-value identical (inert pi.sendMessage/ui.notify/emitDiagnostic trio, resolve → "resolved", (src, path = "test.theta") → parseThetaDocument) differing only in names, the test file imports nothing from ./helpers/e2e-s1 (grep exit 1) while 264 sibling tests import parseDoc/parseDeps from it, e2e-s1.ts (first committed 2026-07-13, d23c22be) predates subagent-fn.test.ts (2026-07-21, 9a9933f8) so the helper was available at authoring, the exported parseDeps() also covers the two direct `parseDeps: makeDeps()` uses at :1681/:1708, and no carve-out applies (not a *gate* test, inert stub not a recording double, file green 45/45 at HEAD, docs/bugs cite only :308-323/:404-421/:1581-1614 not the harness, coverage-matrix 0 hits); same confirmed-and-fixed D7 copy-paste-fixture class as resolved PTQ-0214/0239/0314/0386/0405 at a new file (per-file-pair convention → not duplicate; same-wave d7-01-blockexpr only mentions this file in passing, cites other locations; no quality/ record names makeDeps in subagent-fn); the stray `d4_class: clone` field on a D7 filing is a template-hygiene nit that does not block evaluation (triage: claude-fable-5-1)
