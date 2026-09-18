---
id: PTQ-0431
title: b0281 and b0284 each redeclare the RegistryRow/msg/line/LoadRow/registered/expectCaptured harness that tests/helpers/load-row-harness.ts already exports
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:118-330
  - tests/b0284-non-identifier-applied-generic-head.test.ts:229-322
  - tests/helpers/load-row-harness.ts:33-191
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# b0281 and b0284 each redeclare the RegistryRow/msg/line/LoadRow/registered/expectCaptured harness that tests/helpers/load-row-harness.ts already exports

## Observation
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts and
tests/b0284-non-identifier-applied-generic-head.test.ts each declare, at
module scope, their own `RegistryRow` interface, `REGISTRY`/`REGISTRY_PATH`
constants (loaded via `parseRegistry(readFileSync(...))` over the same parse
registry page), a `msg`/`line` registry-message renderer, a `LoadRow`
interface, a `FRONTMATTER` constant, `row`/`theta`/`paramsTheta` fixture
builders, a `registered` predicate, a `startPositions` projector, and an
`expectCaptured`/`expectRows` assertion pair — the same bundle
`tests/helpers/load-row-harness.ts` already exports for this exact purpose.
Neither file imports anything from that module; both instead import
`parseRegistry`/`registryMessage` directly from `tools/code-registry/index.js`
and `parseDoc` from `tests/helpers/e2e-s1.ts`, then rebuild the rest locally.
A third file in the same bug-report family,
tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts,
imports the whole bundle from `tests/helpers/load-row-harness.ts` (confirmed
by reading its current import block) rather than redeclaring it, showing the
migration already happened for that sibling.

## Evidence

tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts:118-128
— the local `RegistryRow` interface and registry load:
```ts
interface RegistryRow {
  readonly code: string;
  readonly severity: string;
  readonly phase: string;
  readonly message: string;
}

const REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

const REGISTRY = parseRegistry(
  readFileSync(fileURLToPath(new URL(`../${REGISTRY_PATH}`, import.meta.url)), "utf8"),
) as RegistryRow[];
```

tests/helpers/load-row-harness.ts:33-45 — the exported counterpart, same
shape and same registry path, wrapped as exported bindings:
```ts
export interface RegistryRow {
  readonly code: string;
  readonly message: string;
}

export interface ParseCodeRegistryRow extends RegistryRow {
  readonly severity: string;
  readonly phase: string;
}

export const PARSE_REGISTRY_PATH = "docs/spec_topics/diagnostics/code-registry-parse.md";

export const PARSE_REGISTRY: readonly ParseCodeRegistryRow[] = parseRegistry(
```

tests/b0281-...:153-170 — the local `msg`/`line` renderer:
```ts
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
  for (const [placeholder, value] of fills) {
    expect(
      out,
      `DIAG-4: the ${code} Message template must carry the ${placeholder} placeholder; template=${JSON.stringify(template)}`,
    ).toContain(placeholder);
    out = out.replace(placeholder, value);
  }
  return out;
}
```
tests/helpers/load-row-harness.ts:56-70 — the exported `registryMessageOf`,
same body once the registry/path are threaded as parameters instead of
closed-over module constants:
```ts
export function registryMessageOf(
  registry: readonly RegistryRow[],
  registryPath: string,
  code: string,
  fills: ReadonlyArray<readonly [string, string]> = [],
): string {
  const template = registryMessage(registry, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${registryPath} must carry the Message row for ${code}`,
  ).toBeDefined();
  let out = template as string;
```

tests/b0281-...:199-206 and tests/b0284-...:200-207 — the local `LoadRow`
interface, byte-identical to each other and to the exported version:
```ts
interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}
```
tests/helpers/load-row-harness.ts:99-106:
```ts
export interface LoadRow {
  readonly label: string;
  readonly codes: readonly string[];
  readonly lines: readonly string[];
  readonly declared: readonly string[];
  readonly statements: number;
  readonly doc: ThetaDocument;
}
```

tests/b0281-...:253-255 and tests/b0284-...:266-268 — `registered`,
byte-identical to each other (parameter named `r`):
```ts
function registered(r: LoadRow): boolean {
  return !r.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```
tests/helpers/load-row-harness.ts:140-142 — same logic, parameter named
`row`:
```ts
export function registered(row: LoadRow): boolean {
  return !row.doc.diagnostics.some((d: Diagnostic) => d.severity === "error");
}
```

tests/b0281-...:264-268 and tests/b0284-...:277-281 — `startPositions`,
byte-identical to each other:
```ts
function startPositions(r: LoadRow): string[] {
  return r.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}
```
tests/helpers/load-row-harness.ts:146-150 — same logic, parameter named
`row`:
```ts
export function startPositions(row: LoadRow): string[] {
  return row.doc.diagnostics.map((d: Diagnostic) =>
    d.range === undefined ? "unlocated" : `${d.range.start.line}:${d.range.start.column}`,
  );
}
```

tests/b0281-...:276-289 and tests/b0284-...:289-301 — `expectCaptured`,
byte-identical to each other including both literal precondition strings:
```ts
function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  const mismatched = rows
    .filter((r) => JSON.stringify(r.declared) !== JSON.stringify(names))
    .map((r) => [r.label, r.declared]);
  expect(
    mismatched,
    `precondition: every fixture must capture exactly the declarations ${JSON.stringify(names)}`,
  ).toEqual([]);
}
```
tests/helpers/load-row-harness.ts:158-165 — the exported version, logically
identical (delegates the second half to an exported `expectDeclared` the two
files do not use, but asserts the same two conditions with the same two
messages):
```ts
export function expectCaptured(rows: readonly LoadRow[], names: readonly string[]): void {
  const empty = rows.filter((r) => r.statements === 0).map((r) => r.label);
  expect(
    empty,
    "precondition: every fixture must parse to at least one body statement; a row listed here lost its body upstream of the type walk, so its diagnostic list says nothing about this bug",
  ).toEqual([]);
  expectDeclared(rows, names);
}
```

tests/b0281-...:238-243 and tests/b0284-...:239-244 — `paramsTheta`,
byte-identical to each other, built on each file's own local `row`:
```ts
function paramsTheta(label: string, typeText: string): LoadRow {
  return row(
    label,
    `---\ndescription: d\nmode: prompt\nparams:\n  p: '${typeText}'\n---\n\nlet z = 1\n"ok"\n`,
  );
}
```

tests/b0282-unknown-applied-generic-head-gate-at-nine-positions.test.ts:2-14 —
the sibling file in the identical bug-report family, importing the bundle
instead of redeclaring it:
```ts
import {
  expectCaptured,
  expectRows,
  loadRow,
  LOAD_ROW_FRONTMATTER,
  PARSE_REGISTRY as REGISTRY,
  PARSE_REGISTRY_PATH as REGISTRY_PATH,
  registered,
  registryLineOf,
  registryMessageOf,
  startPositions,
  type LoadRow,
} from "./helpers/load-row-harness";
```

Exact search: `grep -rl "^function expectCaptured(rows: readonly LoadRow\[\],
names: readonly string\[\]): void {" tests --include="*.test.ts"` →
tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts and
tests/b0284-non-identifier-applied-generic-head.test.ts are 2 of the 3 hits
(the third, tests/b0262-unresolved-named-type-reference-positions.test.ts, is
outside this wave's briefed scope and not claimed here).

## Why this is a problem
This is the "Boilerplate duplication" / "Copy-paste fixtures/doubles" class:
`tests/helpers/load-row-harness.ts` centralises exactly this bundle — its own
header comment states it was created because "several `b02xx` files
independently redeclared the same `LoadRow` shape … row builder … registration
mirror … message renderer" — and a third file in the same bug-report family
already imports it in place of an identical local copy. The two files in this
review's scope carry the identical bundle (`RegistryRow`/`REGISTRY`, `msg`/
`line`, `LoadRow`, `registered`, `startPositions`, `expectCaptured` all
byte-identical to each other and logically identical to the exported
versions; `paramsTheta` byte-identical between the two) without importing it
and without any comment naming a reason to diverge.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts is the demonstrated home for this bundle — a
third file in the same bug-report family (b0282) already imports it in place
of the identical local declarations these two files still carry.

## False-positive check
- Gate-pin: tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts
  matches `*gate*.test.ts` by filename; tests/b0284-non-identifier-applied-generic-head.test.ts
  does not. Neither cited function or constant is a pinned count or inventory
  assertion — `RegistryRow`/`REGISTRY`/`msg`/`line`/`LoadRow`/`registered`/
  `startPositions`/`expectCaptured`/`paramsTheta` are plain helper functions
  and constants parameterised by caller-supplied values, not `expect` calls
  over a fixed corpus size — so the census/pin carve-out does not apply to the
  claim being made.
- Recording-double: none of the cited functions records a call to assert
  something was never invoked; each reads fields off an already-returned
  `LoadRow` (itself built from a synchronous `parseDoc` call) or a
  synchronously-loaded registry array. Not applicable.
- docs/bugs/ signature search: docs/bugs/0281-applied-ok-err-generic-application-silent-at-every-capture.md
  Status "fixed (0.277.0)"; docs/bugs/0284-non-identifier-applied-generic-head-silent-at-five-captures.md
  Status "fixed (0.281.0)". `npx vitest run
  tests/b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts
  tests/b0284-non-identifier-applied-generic-head.test.ts` → 31 passed (14 +
  17) at HEAD; neither is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0281-applied-reserved-generic-head-gate-at-nine-positions\|b0284-non-identifier-applied-generic-head"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl
  "b0281-applied-reserved-generic-head-gate-at-nine-positions" docs/bugs/` →
  docs/bugs/0282-unknown-applied-generic-head-silent-at-every-position.md,
  whose witness list (lines 650–652) cites three `it()` blocks inside
  tests/b0281-...test.ts BY NAME as measured controls bug 0282's own fix must
  not move. This finding does not propose merging, renaming, or deleting the
  file, any `describe`/`it` block, or any assertion cited there — it proposes
  only that the internal harness constants and functions (`RegistryRow`,
  `REGISTRY`, `msg`, `line`, `LoadRow`, `registered`, `startPositions`,
  `expectCaptured`, `paramsTheta`) could be imported rather than redeclared,
  which changes no test name or assertion — so the citation is unaffected.
  `grep -rl "b0284-non-identifier-applied-generic-head" docs/bugs/` → only the
  bug's own document (0284), which is not a cross-citation.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every function and constant cited is exercised by
  the tests in its own file (31/31 passing).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: LoadRow/registered/startPositions/expectCaptured/expectRows/paramsTheta are byte-identical between b0281 (~199-330) and b0284 (~208-322) and match tests/helpers/load-row-harness.ts:99-191 modulo `export`/param name/expectDeclared delegation; `row` differs from `loadRow` only in the fixture-path literal the helper parameterises, b0281's `msg` is `registryMessageOf` with REGISTRY/REGISTRY_PATH closed over, and b0284's two-page `msg` is exactly the per-file registry/path case the harness header says its arguments exist for; neither file imports the harness (6 importers: b0046/b0272/b0273/b0274/b0277/b0282); the expectCaptured grep returns 4 files not 3 (b0278 also unclaimed) but that does not touch the claim; 31/31 pass, coverage-matrix 0 hits, bug 0282's witness cites `it()` blocks by name and no test is merged/renamed/deleted, both bug docs fixed; not a duplicate — PTQ-0206/0219/0228/0409 name b0281/b0284 only in pattern-wide searches and fixed b0274/b0277, b0282, b0273, b0046 respectively, leaving these two unmigrated (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
