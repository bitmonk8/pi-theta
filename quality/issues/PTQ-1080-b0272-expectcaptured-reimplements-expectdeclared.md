---
id: PTQ-1080
title: b0272-enclosing-annotation-refusal-nested-head.test.ts inlines expectDeclared's filter/map/expect body inside its own expectCaptured instead of importing the exported function its sibling b0279 already uses
lens: D7
status: open
verdict: confirmed
locations:
  - tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:1-11
  - tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:214-230
  - tests/helpers/load-row-harness.ts:178-187
  - tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts:3-11
sites: 1
fix_scope: localized
wave: qw20260918220713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# b0272-enclosing-annotation-refusal-nested-head.test.ts inlines expectDeclared's filter/map/expect body inside its own expectCaptured instead of importing the exported function its sibling b0279 already uses

## Observation
`tests/helpers/load-row-harness.ts` exports `expectDeclared(rows, names, message?)`, a three-line filter/map/`expect(...).toEqual([])` precondition check with a default failure message that a caller may override with its own `message` argument. `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts` already imports six other names from that same module (`loadRowFromBody`, `registered`, `registryLineOf`, `registryMessageOf`, `LoadRow`, `PARSE_REGISTRY_PATH`) but does not import `expectDeclared`; instead its own local `expectCaptured` retypes `expectDeclared`'s exact filter/map/expect body inline. Its sibling in the same bug family, `tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts`, imports `expectDeclared` directly from the same module and calls it (passing its own custom message string through the parameter the function already exposes) rather than reimplementing it.

## Evidence

`tests/helpers/load-row-harness.ts:178-187` (the exported function, re-read immediately before filing):
```ts
export function expectDeclared(
  rows: readonly LoadRow[],
  names: readonly string[],
  message = `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
): void {
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(mismatched, message).toEqual([]);
}
```

`tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:1-11` (the existing import from the module that exports `expectDeclared`, `expectDeclared` itself absent from the list):
```ts
import { readRegistry } from "./helpers/registry-oracle";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  loadRowFromBody,
  registered,
  registryLineOf,
  registryMessageOf,
  type LoadRow,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
} from "./helpers/load-row-harness";
```

`tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:214-230` (the local `expectCaptured`, whose second half re-derives `expectDeclared`'s body verbatim — filter, map, `expect(...).toEqual([])` — instead of calling it with a custom message):
```ts
function expectCaptured(
  rows: readonly LoadRow[],
  statements: number,
  names: readonly string[],
): void {
  expect(
    rows.map((r) => [r.label, r.statements]),
    `precondition: every fixture must parse to ${statements} body statement(s); a row listed here lost part of its body upstream of the type walk, so its diagnostic list says nothing about this bug`,
  ).toEqual(rows.map((r) => [r.label, statements]));
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}; \`Gone\` is declared in no fixture, so the head is unresolvable by construction`,
  ).toEqual([]);
}
```

`tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts:3-11` (the sibling file's import, `expectDeclared` present, and its own `expectCaptured` at :227-240 calling it with a custom message instead of inlining the filter/map/expect):
```ts
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../src/diagnostics/diagnostic";
import {
  expectDeclared,
  expectRows as expectDiagnosticRows,
  loadRowFromBody,
  PARSE_REGISTRY as REGISTRY,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
  registered,
  registryLineOf,
  type LoadRow,
} from "./helpers/load-row-harness";
```

## Why this is a problem
The exported `expectDeclared` already accepts a caller-supplied `message` precisely so a per-bug custom failure sentence (like `` `Gone` is declared in no fixture, so the head is unresolvable by construction ``) does not require re-deriving the filter/map/expect body — `b0279`, in the same review family, demonstrates the working call shape one file over. `b0272` re-derives that same three-line body byte-for-byte inside its own `expectCaptured` despite already importing six other symbols from the identical module, so a change to the mismatch-detection logic in `expectDeclared` would need a second, independent edit in `b0272` with nothing to signal the copy left behind.

## Suggested direction (non-binding, optional)
Adding `expectDeclared` to `b0272`'s existing `load-row-harness` import and replacing the inlined filter/map/expect block with a call `expectDeclared(rows, names, "...`Gone` is declared...")` is the natural fold the sibling file `b0279` already demonstrates for the identical function.

## False-positive check
- Gate-pin check: `b0272-enclosing-annotation-refusal-nested-head.test.ts` does not match `*gate*.test.ts` or the named gate kin; the cited lines are a precondition assertion helper, not a pinned count or inventory.
- Recording-double check: `expectCaptured`/`expectDeclared` assert against parsed `LoadRow` values, not a recording double; they back no MUST-NOT witness — the carve-out does not apply.
- docs/bugs/ signature search: `docs/bugs/0272-enclosing-annotation-refusal-swallows-nested-unresolved-head.md` reports `Status: fixed`; it does not document this duplication as a correct-reason red.
- coverage-matrix citation search: `grep -n "b0272-enclosing-annotation-refusal-nested-head" docs/reference/coverage-matrix.md` → 0 hits; this finding proposes no merge, rename, or deletion of the file or any `it()` block.
- Duplicate/overlap check: `quality/resolved/PTQ-0429-b0272-b0273-registry-constant-redeclared.md` (fixed) covers this same file's separate `RegistryRow`/`REGISTRY_PATH`/`parseRegistry(readFileSync(...))` redeclaration and its own triage note explicitly states "PTQ-0228 covers b0273's `startPositions`/`expectCaptured`/`expectRows` residual only" and that "no same-wave sibling intake... cites b0272" for any residual beyond the registry constant — confirming this file's own `expectCaptured`/`expectDeclared` gap is untracked. `quality/resolved/PTQ-0228-loadrow-harness-residual-b0273.md` is scoped to `b0273` alone (confirmed by reading its `locations:` field, which cites only `b0273`, not `b0272`). No open or resolved ticket's `locations` field cites `tests/b0272-enclosing-annotation-refusal-nested-head.test.ts:214-230`.
- Coverage-drift check: this finding is about a duplicated assertion-helper body existing today alongside a proven-working import path (`b0279`'s own use of the same function); it makes no claim about any untested path.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: all four excerpts reproduce verbatim at the cited lines (load-row-harness.ts:178-187 `export function expectDeclared` with overridable `message`; b0272:4-11 imports six names from that module without `expectDeclared`; b0272:222-229 inlines the identical `.filter(JSON.stringify(r.declared) !== JSON.stringify(names)).map([r.label, r.declared])` + `expect(mismatched, msg).toEqual([])` body; b0279:4 imports it and :236-240 calls it with a custom message from an `expectCaptured` of the same `(rows, statements, names)` arity), so b0272's header claim that its `expectCaptured` "diverges (a different precondition arity) and stays local" (:184-185) justifies the wrapper, not the byte-identical inner declared-check that b0279 already delegates; coverage-matrix grep → 0, docs/bugs/0272 Status fixed, not a gate file, not a recording double, vitest 8/8 green; not a duplicate — `expectDeclared` was only exported in commit 8bad24ba (PTQ-0409's fix, 2026-09-17), after PTQ-0207/0228 were resolved, PTQ-0228's locations cite b0273 only and its "b0272 stays local" reasoning predates the exported sub-piece, PTQ-0429 covers only b0272:144-155's registry constant, and no open row cites b0272:214-230; accounting note: `grep -rln "JSON.stringify(r.declared) !== JSON.stringify(names)" tests/` also hits tests/b0262-unresolved-named-type-reference-positions.test.ts:265, which does not import load-row-harness at all — a distinct not-migrated site, uncounted here and immaterial to this file's confirmed copy (triage: claude-fable-5-1)
