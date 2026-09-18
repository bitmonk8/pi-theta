---
id: PTQ-0482
title: subagent-root-drive-wiring.test.ts redeclares subagent-visible-regime.test.ts's noopPi/subagentTheta/childCtx/rootDouble harness quartet
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-root-drive-wiring.test.ts:47-58
  - tests/subagent-root-drive-wiring.test.ts:60-62
  - tests/subagent-root-drive-wiring.test.ts:64-72
  - tests/subagent-root-drive-wiring.test.ts:74-82
  - tests/subagent-visible-regime.test.ts:57-69
  - tests/subagent-visible-regime.test.ts:71-73
  - tests/subagent-visible-regime.test.ts:100-108
  - tests/subagent-visible-regime.test.ts:110-118
sites: 2                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# subagent-root-drive-wiring.test.ts redeclares subagent-visible-regime.test.ts's noopPi/subagentTheta/childCtx/rootDouble harness quartet

## Observation
`tests/subagent-root-drive-wiring.test.ts` declares, module scope, four
functions for driving `driveSubagentRootRegime` in-process: `rootDouble()`, a
`RuntimeRoot` double; `noopPi()`, a no-op `ExtensionAPI`; `subagentTheta(tail)`,
a `ThetaCompositionInput` builder over `parseExpressionSource(tail)`; and
`childCtx()`, an `ExtensionCommandContext` builder. The same four functions,
under the same names, are independently declared in
`tests/subagent-visible-regime.test.ts`. `noopPi` and `subagentTheta` are
byte-identical between the two files; `childCtx` shares the same three core
fields (`model`, `cwd`, `sessionManager`) and differs only in
`subagent-visible-regime.test.ts` taking a `shutdown` parameter it spreads in;
`rootDouble` shares the same `idSource` and `clock.setTimeout`/`clearTimeout`
shape and differs only in the checkpoint wiring (a fixed
`new RecordingCheckpoint()` vs. an optional `checkpoint?: Checkpoint`
parameter defaulting to `new NoopCheckpoint()`) and one extra `now: () => 0`
clock field in the visible-regime file.

## Evidence

`tests/subagent-root-drive-wiring.test.ts:47-58` (re-read immediately before
filing):
```ts
function rootDouble(): RuntimeRoot {
  return {
    checkpoint: new RecordingCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

`tests/subagent-root-drive-wiring.test.ts:64-82`:
```ts
function subagentTheta(tail: string): ThetaCompositionInput {
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: { statements: [], tail: parseExpressionSource(tail) },
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function childCtx(): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    // The child's own (empty) host session — the regime drives against it.
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
  } as unknown as ExtensionCommandContext;
}
```

`tests/subagent-visible-regime.test.ts:57-73` — `rootDouble` and `noopPi`,
sharing `idSource`/`clock.setTimeout`/`clearTimeout`/`schemaValidator` shapes
and `noopPi` byte-identical:
```ts
function rootDouble(checkpoint?: Checkpoint): RuntimeRoot {
  return {
    checkpoint: checkpoint ?? new NoopCheckpoint(),
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
    clock: {
      now: () => 0,
      wallNow: () => 0,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    },
    schemaValidator: { compile: () => ({ validate: () => ({ ok: true as const }) }) },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {}, getAllTools: () => [] } as unknown as ExtensionAPI;
}
```

`tests/subagent-visible-regime.test.ts:100-118` — `subagentTheta`
byte-identical to the reviewed file's, `childCtx` sharing the same three core
fields plus a `shutdown` parameter:
```ts
function subagentTheta(tail: string): ThetaCompositionInput {
  return {
    slashName: "worker",
    sourcePath: "/theta/worker.theta",
    frontmatter: { mode: "subagent" } as unknown as ParsedFrontmatter,
    body: { statements: [], tail: parseExpressionSource(tail) },
    callableSet: { entries: new Map() },
  } as unknown as ThetaCompositionInput;
}

function childCtx(shutdown: (() => void) | undefined): ExtensionCommandContext {
  return {
    model: { id: "claude-test", provider: "anthropic" },
    cwd: "/tmp",
    signal: undefined,
    sessionManager: { getEntries: () => [], getLeafId: () => undefined },
    ...(shutdown !== undefined ? { shutdown } : {}),
  } as unknown as ExtensionCommandContext;
}
```

Search: `grep -n "^function noopPi\|^function subagentTheta\|^function childCtx" tests/*.test.ts` hits exactly these two files for all three names (the two other `subagentTheta`/`noopPi` hits found in the wider suite — `production-subagent-query-model.test.ts`, `subagent-child-env-scrub.test.ts`, `subagent-drive-teardown.test.ts`, `subagent-fn-child-launch.test.ts`, `subagent-model-theta-tool.test.ts`, `b0362-case-variant-invoke-cycle-edge.test.ts` — build a differently-shaped `subagentTheta`/`noopPi` each, none matching this exact `parseExpressionSource(tail)`-based four-function shape). `grep -rn "noopPi\|childCtx\|parseExpressionSource(tail)" tests/helpers/*.ts` → 0 hits: no `tests/helpers/` module exports any piece of this quartet.

## Why this is a problem
Two test files independently declare the same four-function harness — a
`RuntimeRoot` double, a no-op `ExtensionAPI`, a `parseExpressionSource(tail)`-
based `ThetaCompositionInput` builder, and an `ExtensionCommandContext`
builder — for driving `driveSubagentRootRegime` in-process, with `noopPi` and
`subagentTheta` byte-identical between them and `rootDouble`/`childCtx`
differing only in one added parameter and one added clock field each. No
`tests/helpers/` module hosts any of the four pieces, so each file's reader
has no signal that its harness restates a sibling's rather than being built
fresh for that file's own scenario.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting `noopPi`, `subagentTheta`, and
parameterised `rootDouble`/`childCtx` builders (taking the optional
`checkpoint`/`shutdown` each file's own scenario already supplies) is the
natural home the two files' shared quartet already points toward.

## False-positive check
- Gate-pin: neither file matches `*gate*.test.ts` or the named gate kin; the
  cited lines are harness/double declarations, not a pinned count or
  inventory assertion.
- Recording-double: none of the four functions is a recording double backing
  a MUST-NOT-called witness; the carve-out does not apply to these harness
  declarations.
- docs/bugs/ signature search: `grep -rl "noopPi\|subagentTheta\|childCtx"
  docs/bugs/*.md` → 0 hits; no open bug document names this duplication as a
  documented correct-reason red, and both files' own suites pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n
  "subagent-root-drive-wiring\|subagent-visible-regime"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  merge, rename, or deletion of either file or any `it()`/`describe()` block
  — only that the shared quartet could be imported from a new helper — so no
  citation is affected.
- Overlap check: `grep -rl "subagent-root-drive-wiring\|subagent-visible-regime"
  quality/intake quality/resolved` shows two prior filings —
  `qw20260917154546-d7-131-02-recordingbus-emit-double-duplicated.md` (the
  `RecordingBus` channel/data recorder, a different declaration) and
  `qw20260917154546-d7-02-resolvinghost-double-duplicated.md` (the
  `resolvingHost()` `ExecutableHost` double, present in
  `subagent-visible-regime.test.ts` but not in
  `subagent-root-drive-wiring.test.ts`) — neither names the
  `noopPi`/`subagentTheta`/`childCtx`/`rootDouble` quartet cited here.
- Coverage check: the claim is about a repeated harness DEFINITION, not a
  missing test path; both copies are exercised by their own files' tests,
  which pass at HEAD.

## Triage
verdict: confirmed — independently re-verified: all eight excerpts match at the cited lines; `noopPi` (60-62 vs 71-73) and `subagentTheta` (64-72 vs 100-108) are byte-identical, `childCtx`/`rootDouble` differ only by the `shutdown` param / optional `checkpoint` + `now` field, and git lineage (root-drive-wiring added 4866d4d2 2026-07-24, visible-regime added ef706748 2026-09-15) shows a copy-paste fixture in D7's class; neither file is a gate, in docs/reference/coverage-matrix.md, or in docs/bugs/, both suites pass (29/29), and no PTQ row cites either file — the same-wave sibling qw20260917154546-d7-149-03-visible-regime-producer-deps-harness-duplicated.md names the same root cause but was filed 3 min later (20:15 vs 20:12), so this is the earlier filing; note two FP-check inaccuracies that undercount rather than refute: tests/helpers/ does declare `noopPi` in call-with-clause-harness.ts:170, fixture-dispatch-harness.ts:158, parent-producer-harness.ts:58 (all differently shaped, none with `getAllTools`), and production-subagent-query-model.test.ts:64 and subagent-fn-child-launch.test.ts:107 carry byte-identical `noopPi` copies the filing called "differently-shaped" (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
