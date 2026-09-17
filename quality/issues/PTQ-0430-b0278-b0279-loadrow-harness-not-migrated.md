---
id: PTQ-0430
title: b0278 and b0279 redefine the LoadRow/msg/line/registered/expectCaptured/expectRows harness that tests/helpers/load-row-harness.ts already centralises, and a sibling in the same review scope (b0277) already imports instead
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts:129-296
  - tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts:166-337
  - tests/helpers/load-row-harness.ts:34-193
  - tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:1-15
sites: 2
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# b0278 and b0279 redefine the LoadRow/msg/line/registered/expectCaptured/expectRows harness that tests/helpers/load-row-harness.ts already centralises, and a sibling in the same review scope (b0277) already imports instead

## Observation
tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts:129-296
and
tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts:166-337
each declare their own private copy of the same nine-piece "diagnostic-load
harness" — a `RegistryRow` interface, a `REGISTRY_PATH` constant, a
`REGISTRY = parseRegistry(readFileSync(...))` load, a `msg` message-template
renderer, a `line` renderer, a `LoadRow` interface, a `FRONTMATTER` constant, a
`theta(label, body)` row builder wrapping `parseDoc`, a `registered(row)`
composition-root-registration mirror, and a two-stage
`expectCaptured`/`expectRows` assertion pair. Every one of these nine pieces
already exists, exported, in `tests/helpers/load-row-harness.ts` under the
names `RegistryRow`/`ParseCodeRegistryRow`, `PARSE_REGISTRY_PATH`,
`PARSE_REGISTRY`, `registryMessageOf`, `registryLineOf`, `LoadRow`,
`LOAD_ROW_FRONTMATTER`, `loadRow`/`loadRowFromBody`, `registered`,
`expectCaptured`, and `expectRows`. The fourth file in this same review's
scope, tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts,
imports all of these by name from that helper module rather than redefining
them (its own header comment even states the convention: "`LoadRow`,
`registered`, `startPositions`, `expectCaptured` and `expectRows` are the
shared harness in `tests/helpers/load-row-harness.ts`").

## Evidence

tests/b0278-result-arity-mismatch-silent-at-query-response-annotation.test.ts:129-155:
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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
```

tests/b0279-same-construct-suppression-swallows-genuine-sibling-mistakes.test.ts:166-186
(same shape, same registry path, same `msg` body):
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
...
function msg(code: string, fills: ReadonlyArray<readonly [string, string]> = []): string {
  const template = registryMessage(REGISTRY, code) as string | undefined;
  expect(
    template,
    `DIAG-4 anchor: ${REGISTRY_PATH} must carry the Message row for ${code}`,
  ).toBeDefined();
```

tests/helpers/load-row-harness.ts:34-49 — the canonical exported equivalent:
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
  readFileSync(
    fileURLToPath(new URL(`../../${PARSE_REGISTRY_PATH}`, import.meta.url)),
    "utf8",
  ),
) as ParseCodeRegistryRow[];
```

The `LoadRow` interface, `FRONTMATTER`/`LOAD_ROW_FRONTMATTER` constant, `theta`
row builder, `registered` predicate, and `expectCaptured`/`expectRows`
assertion pair are correspondingly identical in logic between all three
files (b0278:197-296, b0279:234-337, load-row-harness.ts:99-193); b0278's
`theta` differs from the helper's `loadRowFromBody` only by an added
`ALL_ROWS.push(row)` side effect line, and b0279's `expectCaptured`/
`expectRows` differ from the helper's exports only by adding a `statements`
count parameter and an `extents` (start+end) projector alongside the helper's
`startPositions` (start only) — additions layered on top of the same
duplicated base rather than routed through the shared functions with a local
wrapper.

tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts:5-15 — the
sibling in the same review scope that imports the same nine pieces instead of
redefining them:
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

## Why this is a problem
This is the "Boilerplate duplication" class: a nine-piece setup/assertion
harness (registry load, message renderer, row builder, registration mirror,
precondition-and-assertion pair) recurs as one unit across two files rather
than being imported. tests/helpers/load-row-harness.ts's own header states its
reason for existing: "Several `b02xx` files independently redeclared the same
`LoadRow` shape, the same `parseDoc`-wrapping row builder, the same
composition-root registration mirror, and the same registry-message renderer
… This module centralises the parts that are byte-for-byte identical across
those files." A file in this same review's four-file scope
(tests/b0277-unapplied-generic-head-at-five-filtered-captures.test.ts) already
draws on exactly that centralisation; the other two files in the same scope do
not, and instead retype the harness the helper module exists to replace.

## Suggested direction (non-binding, optional)
tests/helpers/load-row-harness.ts already exports every piece both files
redefine, under the same names both files already use locally; b0278's
`ALL_ROWS` bookkeeping and b0279's `statements`-count/`extents` variants read
as file-local extensions of the shared shape rather than reasons the shape
itself needed re-deriving.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate); this finding
  makes no claim about a pinned count or inventory, so the carve-out does not
  apply.
- Recording-double: none of the nine pieces records a call to assert something
  was never invoked; `registered`/`expectCaptured`/`expectRows` all read
  fields off an already-returned `LoadRow` built from `parseDoc`'s return
  value. Not applicable.
- docs/bugs/ signature search: docs/bugs/0278-result-arity-mismatch-silent-at-query-response-annotation.md
  and docs/bugs/0279-same-construct-suppression-swallows-genuine-sibling-mistakes.md
  are both `Status: fixed`; `npx vitest run` over all four files in this
  review's scope passes 40/40 tests. Neither file is a documented
  correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0278-result-arity-mismatch-silent-at-query-response-annotation\|b0279-same-construct-suppression-swallows-genuine-sibling-mistakes"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no merge,
  rename or deletion of either test file or any `it()`/`describe()` — only
  that the internal harness functions could be imported rather than retyped —
  so the citation carve-out does not bind.
- Coverage check: the claim is entirely about a repeated harness DEFINITION,
  not a missing test path; every function cited is exercised by the tests in
  its own file, and the finding takes no position on whether more tests are
  needed anywhere.

## Triage
verdict: confirmed — independently re-verified: every excerpt matches at the cited lines (b0278:129-155/197-296, b0279:166-186/234-337, load-row-harness.ts:34-193); RegistryRow/REGISTRY_PATH/REGISTRY/msg/line/LoadRow/FRONTMATTER/registered are logic-identical to the helper's exports, b0278's theta = loadRowFromBody + ALL_ROWS.push (and its startPositions is byte-identical too), b0279's expectCaptured/expectRows are the helper's base plus an exact statements count, an extents stage and a registered===false stage (the helper already exports expectDeclared for such wrapping); neither file imports ./helpers/load-row-harness while 6 siblings do; vitest 35/35 green across b0277/b0278/b0279, coverage-matrix grep 0 hits, no gate/recording-double carve-out; not a duplicate — PTQ-0206 listed b0278 only in its pattern grep and cited b0274/b0277 as targets, b0279 was never listed, and PTQ-0219/0228/0409 ratify per-file residual filings (triage: claude-fable-5-1)
