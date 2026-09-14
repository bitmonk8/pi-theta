---
id: PTQ-0214
title: array-sink-unresolvable-deferral.test.ts reimplements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/array-sink-unresolvable-deferral.test.ts:253-263
  - tests/array-sink-unresolvable-deferral.test.ts:271-277
  - tests/helpers/e2e-s1.ts:23-40
  - tests/array-ternary-common-type-union.test.ts:10
  - tests/b0046-by-clause-undecided-inputs.test.ts:9
sites: 5
fix_scope: localized
wave: qw20260911104855
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-11
---

# array-sink-unresolvable-deferral.test.ts reimplements tests/helpers/e2e-s1.ts's parseDeps/parseDoc instead of importing them

## Observation
tests/array-sink-unresolvable-deferral.test.ts defines its own module-scope `parseDeps()` — an inert `SystemNoteChannelDeps` plus a trivially-resolving `ModelReferenceMatcher` — and its own `parse(body)` wrapper that builds a `ThetaSource` and calls `parseThetaDocument(source, parseDeps())`. `tests/helpers/e2e-s1.ts` already exports a `parseDeps()` of the identical shape and a `parseDoc(src, path)` that performs the same call. Two of the other three files in this same review batch, tests/array-ternary-common-type-union.test.ts and tests/b0046-by-clause-undecided-inputs.test.ts, import `parseDoc` from that helper directly rather than re-deriving it.

## Evidence
tests/array-sink-unresolvable-deferral.test.ts:253-263 — the reimplemented double:
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
```

tests/array-sink-unresolvable-deferral.test.ts:271-277 — the reimplemented wrapper:
```ts
function parse(body: string): ThetaDocument {
  const source: ThetaSource = {
    path: "bug0179.theta",
    bytes: new TextEncoder().encode(FM + body),
  };
  return parseThetaDocument(source, parseDeps());
}
```

tests/helpers/e2e-s1.ts:23-40 — the canonical helper already exporting both, with the same field values (`sendMessage`/`notify`/`emitDiagnostic` no-ops, `resolve` always `"resolved"`):
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
```

tests/array-ternary-common-type-union.test.ts:10 and :250-252 — a file in this same review batch importing and calling the canonical helper directly:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```
```ts
function parse(src: string): ThetaDocument {
  return parseDoc(FM + src, "bug0081.theta");
}
```

tests/b0046-by-clause-undecided-inputs.test.ts:9 and :213-215 — the same, in the second sibling file:
```ts
import { parseDoc } from "./helpers/e2e-s1";
```
```ts
function theta(label: string, decls: string): LoadRow {
  return rowOf(label, parseDoc(`---\nmode: prompt\n---\n${decls}\nlet a = 1\na\n`, "b0046.theta"));
}
```

Exact search: `grep -rl "^function parseDeps()" tests --include="*.test.ts" | wc -l` → 76 test files locally redefine a same-named `parseDeps()`, against exactly one canonical `export function parseDeps()` (`tests/helpers/e2e-s1.ts`).

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: array-sink-unresolvable-deferral.test.ts's `parseDeps()` re-implements, field for field and value for value, the `ParseThetaDocumentDeps` double `tests/helpers/e2e-s1.ts` already exports under the identical name, and its `parse(body)` re-implements that same helper's `parseDoc(src, path)` — both build a `ThetaSource` from UTF-8-encoded bytes and hand it to `parseThetaDocument` with the deps double. The canonical helper is not a hypothetical extraction target: it is already the import two other files in this same review batch use for the identical purpose, so the reimplementation in the file under review is neither required by anything specific to bug 0179's fixtures nor an isolated local choice made in the absence of an alternative.

## Suggested direction (non-binding, optional)
Importing `parseDoc` (overriding its default `path` parameter, as the sibling files already do) from `tests/helpers/e2e-s1.ts` is the path already adopted beside this file in the same batch; naming it here is an observation about where the two sibling files already point, not a design for the change.

## False-positive check
- Gate-pin carve-out: not a `*gate*.test.ts` census/inventory test; not applicable.
- Recording-double carve-out: `parseDeps()` is an inert parse-time double, not a recording double asserting a call was never made; not applicable.
- docs/bugs/ signature search: `docs/bugs/0179-array-sink-refuses-unresolvable-value-type.md` Status is "fixed (0.104.0)"; `npx vitest run tests/array-sink-unresolvable-deferral.test.ts` passes (21/21) at HEAD, so this is not a documented correct-reason red.
- coverage-matrix / bug-doc citation search: `grep -n "array-sink-unresolvable-deferral\|helpers/e2e-s1" docs/reference/coverage-matrix.md` returns no hits. This finding does not propose merging, renaming or deleting any file — only that the existing helper import could replace the local reimplementation — so the citation carve-out does not bind.
- Reference/callers check: `tests/helpers/e2e-s1.ts`'s `parseDeps`/`parseDoc` exports are live, in-use exports (imported directly by tests/array-ternary-common-type-union.test.ts, tests/b0046-by-clause-undecided-inputs.test.ts and others), not dead code being proposed as a target.

## Triage
verdict: confirmed — every excerpt and line range verified verbatim, the field-for-field/value-for-value duplicate is real, e2e-s1.ts (2026-07-13) predates this file (2026-08-17) so the helper was available to import, both sibling files in the batch already import parseDoc for the identical purpose, no false-positive carve-out applies, and no existing PTQ duplicates it (triage: claude-opus-5)
