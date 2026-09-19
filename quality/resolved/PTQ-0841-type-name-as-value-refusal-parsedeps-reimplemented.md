---
id: PTQ-0841
title: type-name-as-value-refusal.test.ts redeclares parseDeps/parseOnly instead of importing e2e-s1's parseDeps/parseDoc it already imports from
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/type-name-as-value-refusal.test.ts:30
  - tests/type-name-as-value-refusal.test.ts:1204-1219
  - tests/type-name-as-value-refusal.test.ts:1470
  - tests/helpers/e2e-s1.ts:30-44
sites: 1
fix_scope: localized
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# type-name-as-value-refusal.test.ts redeclares parseDeps/parseOnly instead of importing e2e-s1's parseDeps/parseDoc it already imports from

## Observation
`tests/type-name-as-value-refusal.test.ts` imports `parseDoc` from `./helpers/e2e-s1` at line 30 and uses it for its main `parse()` wrapper (line 330). Later in the same file, inside the group-(e) "shared parse + production-executor harness" section, the file declares its own module-scope `parseDeps(): ParseThetaDocumentDeps` and a `parseOnly(path, src): ThetaDocument` wrapper that together reconstruct exactly what `tests/helpers/e2e-s1.ts` already exports as `parseDeps()` and `parseDoc(src, path)` — the same module the file already imports from two lines earlier in its own import block.

## Evidence
`tests/type-name-as-value-refusal.test.ts:30` — the existing import of the canonical helper module:
```ts
import { parseDoc, isLoadParseError } from "./helpers/e2e-s1";
```

`tests/type-name-as-value-refusal.test.ts:1204-1219` — the local reimplementation, field-for-field and call-for-call identical to the helper's exports:
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

`tests/type-name-as-value-refusal.test.ts:1470` — a second call site consuming the local `parseDeps()` (the GOV-15 corpus sweep):
```ts
      const doc = parseThetaDocument({ path: rel, bytes }, parseDeps());
```

`tests/helpers/e2e-s1.ts:30-44` — the canonical, already-exported equivalents, same field values (`sendMessage`/`notify`/`emitDiagnostic` no-ops, `resolve` always `"resolved"`) and the same `ThetaSource`-then-`parseThetaDocument` call shape:
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

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: the file's own `parseDeps()` at line 1204 builds the identical `{ systemNote, modelMatcher }` shape `tests/helpers/e2e-s1.ts` already exports under the same name, and its `parseOnly(path, src)` at line 1216 performs the same `ThetaSource` + `parseThetaDocument(source, parseDeps())` call `e2e-s1.ts`'s exported `parseDoc(src, path)` already performs (with the two positional arguments swapped). The canonical helper is not a hypothetical extraction target: the file already imports from that exact module two lines above the point where it starts reconstructing the piece it didn't import. Prior wave finding PTQ-0214 confirmed the identical shape of this reimplementation in a sibling file and reported (via `grep -rl "^function parseDeps()" tests`) 76 test files locally redefining a same-named `parseDeps()` against the one canonical export.

## Suggested direction (non-binding, optional)
Importing `parseDeps` alongside the already-imported `parseDoc` from `./helpers/e2e-s1`, and calling `parseDoc(src, path)` in place of the local `parseOnly(path, src)` (swapping the two call sites' argument order), is the path the file's own existing import already points at.

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file and the cited lines are harness plumbing, not a pinned count/inventory assertion; carve-out does not apply.
- Recording-double check: `parseDeps()`/`parseOnly()` are inert parse-time doubles, not recording doubles asserting a call was never made; carve-out does not apply.
- docs/bugs/ signature search: `grep -n "type-name-as-value-refusal" docs/bugs/*.md` returns many hits, all citing specific test CELLS by id (e.g. "a8", "g9", `:1733`) as witnesses for bugs 0115/0118/0141/0177/0221/0223/0224 — none cites the harness lines 1204-1219 or 1470, and this finding proposes no merge, rename or deletion of any cited cell, only that two already-duplicated local helpers could import their canonical counterparts.
- coverage-matrix.md citation search: `grep -n "type-name-as-value-refusal" docs/reference/coverage-matrix.md` → no hits.
- Documented-red check: the file is green at HEAD for its harness/import machinery (only specific behavioural cells are pinned RED by design, e.g. group (a)/(c)/(d)/(e) rows, unrelated to this parsing-harness duplication); not a skipped or disabled test.
- Reference/callers check: `tests/helpers/e2e-s1.ts`'s `parseDeps`/`parseDoc` exports are live and already imported directly by this same file (`parseDoc` at line 30) and by numerous sibling files, so they are not dead exports being proposed as a target.
- Prior-finding check: searched quality/intake, quality/issues, quality/resolved for "type-name-as-value-refusal" — the four hits found (PTQ-0727, a d7-02 stranded-registrymessageof finding, a PTQ-0226 corpus-discovery reference, and this wave's own shard list) cover different subjects (`registers()` reimplementing `isLoadParseError`, a `registryMessageOf` throw, and the corpus-discovery helper's citation) — none covers this `parseDeps`/`parseOnly` reimplementation.

## Triage
<!-- pending -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim (tests/type-name-as-value-refusal.test.ts:30 imports `parseDoc` from ./helpers/e2e-s1; :1204-1214 local `parseDeps()` builds the same no-op `pi.sendMessage`/`ui.notify`/`emitDiagnostic` + `resolve: () => "resolved"` deps as the exported e2e-s1.ts:30-42 `parseDeps()`; :1216-1219 `parseOnly(path, src)` is e2e-s1.ts:43-46 `parseDoc(src, path)` with arguments transposed), both local helpers are live (`parseOnly` called at :1281, local `parseDeps` at :1218 and :1470) and the canonical exports are live (imported by this very file at :30); both locations under tests/, D7 copy-paste-fixture class, not a `*gate*` file, no recording-double/red-test carve-out, stated searches reproduce (docs/bugs cite only cells by id, none the harness lines 1204-1219/1470; coverage-matrix → 0 hits); the filing's quoted "76 files" is PTQ-0214's historical count (today `grep -rl "^function parseDeps()" tests` → 40) but is attributed as such and immaterial; not a duplicate — no open/resolved PTQ lists this file for parseDeps/parseOnly (PTQ-0226/0727/0753 cover corpus-discovery, `registers()`/isLoadParseError), PTQ-0214 is fixed against array-sink-unresolvable-deferral.test.ts, and the same-wave sibling qw20260918050411-d7-01-b0403-parsedeps-reimplements-e2e-s1.md targets b0403 and was confirmed per the per-file precedent naming this file as a distinct sibling; fix is a mechanical import swap (triage: claude-fable-5-1)
