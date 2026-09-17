---
id: PTQ-0405
title: absent-member-presence-gate.test.ts re-implements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them
lens: D7
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/absent-member-presence-gate.test.ts:217-231
  - tests/helpers/e2e-s1.ts:26-40
  - tests/alias-sink-array-element-check.test.ts:7
sites: 1
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# absent-member-presence-gate.test.ts re-implements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them

## Observation
`tests/helpers/e2e-s1.ts` exports `parseDeps()` (inert, offline `ParseThetaDocumentDeps` — a no-op system-note channel plus a trivially-resolving model matcher) and `parseDoc(src, path = "test.theta")` (wraps `parseThetaDocument` with those deps). `tests/absent-member-presence-gate.test.ts` declares its own file-local `parseDeps()` and `parseOnly(path, src)` that construct the identical `ParseThetaDocumentDeps` shape and call the identical `parseThetaDocument(source, parseDeps())` line, rather than importing the exported `parseDeps`/`parseDoc`. Within this same six-file review scope, `tests/alias-sink-array-element-check.test.ts` already imports `parseDoc` from `tests/helpers/e2e-s1.ts` for the same production parse harness, so the canonical helper is in active use one file over.

## Evidence
`tests/helpers/e2e-s1.ts:26-40` (the canonical exports):
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

`tests/absent-member-presence-gate.test.ts:217-231` (the local re-implementation — same fields, same call shape, args reversed):
```ts
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

function parseOnly(path: string, src: string): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

`tests/alias-sink-array-element-check.test.ts:7` (the canonical helper already imported one file over in this same scope):
```ts
import { findCode, parseDoc } from "./helpers/e2e-s1";
```

`tests/absent-member-presence-gate.test.ts` itself already imports a different `tests/helpers/` module (`import { noopPi, rootDouble } from "./helpers/call-with-clause-harness"`, line 35), so the file is not otherwise avoiding `tests/helpers/` imports in general — only this particular parse-deps/parse-doc pair is re-implemented locally.

## Why this is a problem
`parseDeps`/`parseDoc` in `tests/helpers/e2e-s1.ts` and `parseDeps`/`parseOnly` in `tests/absent-member-presence-gate.test.ts` construct the same `SystemNoteChannelDeps` (a no-op `sendMessage`, a no-op `ui.notify`, a no-op `emitDiagnostic`), the same trivially-resolving `ModelReferenceMatcher`, and call `parseThetaDocument(source, parseDeps())` with the same `ThetaSource` shape — differing only in argument order (`parseOnly(path, src)` vs `parseDoc(src, path)`) and in the default path value. A file in this same review scope (`tests/alias-sink-array-element-check.test.ts`) already imports the canonical version for the identical purpose, which is direct in-scope evidence that the helper is a working substitute rather than a coincidentally-similar one.

## Suggested direction (non-binding, optional)
`tests/absent-member-presence-gate.test.ts` could import `parseDeps`/`parseDoc` from `tests/helpers/e2e-s1.ts` (matching `tests/alias-sink-array-element-check.test.ts`'s own usage) in place of its local `parseDeps`/`parseOnly`, keeping its own `parseTheta` fail-loud wrapper local since that error-message behavior is specific to this file.

## False-positive check
- Gate-pin check: not applicable — no pinned census or inventory is involved in this construct.
- Recording-double check: not applicable — `parseDeps`/`parseOnly`/`parseDoc` are inert stub builders, not recording doubles asserting a MUST-NOT-call witness.
- docs/bugs/ signature search: `grep -rln "parseOnly\|e2e-s1" docs/bugs/` returned no hits; this is not a documented correct-reason red.
- coverage-matrix citation search: `grep -n "absent-member-presence-gate.test.ts" docs/reference/coverage-matrix.md` returned no hits, so no citation constrains renaming (and this finding proposes none — only an import substitution for two local helper functions).
- Coverage drift check: this finding does not claim any path or behaviour is untested; it is limited to the file's own re-implementation of an existing parse-harness helper already in use one file over in this same scope.

## Triage
verdict: confirmed — both excerpts verified verbatim at e2e-s1.ts:26-40 and absent-member-presence-gate.test.ts:217-231 (field-for-field identical deps, parseOnly differs from parseDoc only in arg order; 3 local call sites at :243/:815/:850), e2e-s1.ts (2026-07-13) predates the test file (2026-07-31), alias-sink-array-element-check.test.ts:7 imports parseDoc, bug 0032 is fixed and the file is 34/34 green at HEAD (bug 0150's "red" rows are a projected route outcome, not a current red), coverage-matrix has 0 hits, and no PTQ dedupes it (PTQ-0214/0239/0314/0386 are the same class at other files, PTQ-0209 cites this file for the unrelated rootDouble/producer block at :255-278); the candidate's "docs/bugs/ returned no hits" claim is inaccurate (e2e-s1 is mentioned in many bug docs) but that peripheral check does not affect the anchor (triage: claude-fable-5-1)
verdict: confirmed — re-verified independently: excerpts match verbatim at e2e-s1.ts:26-40 and absent-member-presence-gate.test.ts:217-231 (identical deps, parseOnly = parseDoc with args swapped; callers :243/:815/:850), alias-sink-array-element-check.test.ts:7 imports parseDoc, helper commit 2026-07-13 predates test 2026-07-31, *gate* carve-out is about pinned counts not fixture clones, bug 0032 fixed and file 34/34 green (bug 0150 "red" row is a projected route-1 table), coverage-matrix 0 hits, no PTQ covers this block (PTQ-0209 cites :255-278 only; 0214/0239/0314/0386 are other files); candidate's docs/bugs/ no-hits claim is false (163 files mention e2e-s1) but does not touch the anchor (triage: claude-fable-5-1)
