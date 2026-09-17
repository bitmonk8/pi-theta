---
id: PTQ-0403
title: Dispatch-side scaffolding (checkpoint double, root/pi/theta/ctx builders, tick) is redeclared near-identically in two sibling test files
lens: D7
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/active-invocation-binder-window.test.ts:77-104
  - tests/active-invocation-binder-window.test.ts:107-114
  - tests/active-invocation-wiring.test.ts:100-120
  - tests/active-invocation-wiring.test.ts:134-145
sites: 2
fix_scope: localized
wave: qw20260917095931
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# Dispatch-side scaffolding (checkpoint double, root/pi/theta/ctx builders, tick) is redeclared near-identically in two sibling test files

## Observation
`tests/active-invocation-binder-window.test.ts` and `tests/active-invocation-wiring.test.ts` each hand-roll the same six-piece dispatch harness needed to drive `composeThetaFixture(...).run(...)` over a real `ProductionThetaProducer`: a no-op `Checkpoint` class, a `RuntimeRoot` builder (`rootWith`), a no-op `ExtensionAPI` builder (`noopPi`), a minimal prompt-mode `ThetaCompositionInput` builder (`promptTheta`), a dispatch-ctx builder (`driveCtx`), and a microtask/macrotask-flushing `tick()`. Both files even label the block with a comment naming the other as the source it mirrors ("mirrors active-invocation-wiring" / "mirrors production-cancellation-wiring").

## Evidence
`tests/active-invocation-binder-window.test.ts:77-104` (the `Checkpoint`, `rootWith`, `noopPi`, `promptTheta` block):
```ts
class PassthroughCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWith(checkpoint: Checkpoint): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: { statements: [], tail: null } as unknown as ThetaBody,
  };
}
```

`tests/active-invocation-wiring.test.ts:100-120` (the same block, renamed-only, with `promptTheta`'s inline body factored into a one-line `emptyBody()`):
```ts
class RecordingCheckpoint implements Checkpoint {
  before(_kind: CheckpointKind, _site: CheckpointSite): Promise<void> {
    return Promise.resolve();
  }
}

function rootWith(checkpoint: Checkpoint): RuntimeRoot {
  return {
    checkpoint,
    idSource: { newInvocationId: () => "inv-1", newToolCallId: () => "tc-1" },
  } as unknown as RuntimeRoot;
}

function noopPi(): ExtensionAPI {
  return { sendMessage: (): void => {} } as unknown as ExtensionAPI;
}

function emptyBody(): ThetaBody {
  return { statements: [], tail: null } as unknown as ThetaBody;
}

function promptTheta(): ThetaCompositionInput {
  const frontmatter: ParsedFrontmatter = { mode: "prompt" } as ParsedFrontmatter;
  return {
    slashName: "demo",
    sourcePath: "/theta/demo.theta",
    frontmatter,
    body: emptyBody(),
  };
}
```

`tests/active-invocation-binder-window.test.ts:107-114` (`driveCtx` + `tick`):
```ts
function driveCtx(): ExtensionCommandContext {
  return { signal: undefined, cwd: "/tmp" } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so `run` reaches the parked binder await
 *  before the registry is sampled. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

`tests/active-invocation-wiring.test.ts:134-145` (the same `driveCtx` + `tick`, reformatted only):
```ts
function driveCtx(): ExtensionCommandContext {
  return {
    signal: undefined,
    cwd: "/tmp",
  } as unknown as ExtensionCommandContext;
}

/** Flush pending microtasks/macrotasks so the async run() reaches the parked
 *  `executeBody` await before the assertion samples the registry size. */
const tick = (): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, 0));
```

`rootWith`, `noopPi`, `driveCtx`, and `tick` are byte-identical (modulo whitespace) across the two files; the `Checkpoint` subclass and `promptTheta` differ only in an unused class name and in whether the empty-body literal is inlined or factored into a one-line helper. Exact search: `grep -n "function rootWith\|function noopPi\|function driveCtx\|function promptTheta\|const tick ="` over the two files returns one match of each name per file (8 matches total, 2 sites per name).

## Why this is a problem
Both files' own section comments ("mirrors active-invocation-wiring", "mirrors production-cancellation-wiring") record that the authors recognized the duplication at write time rather than extracting it. The repository already has a precedent for lifting exactly this shape of dispatch scaffolding into `tests/helpers/` (e.g. `tests/helpers/call-with-clause-harness.ts` exports `noopPi`/`rootDouble`/`driveCtx` for the same `composeThetaFixture` dispatch path), so the natural home for `rootWith`/`noopPi`/`promptTheta`/`driveCtx`/`tick` is observably `tests/helpers/`, not a fresh local copy per test file.

## Suggested direction (non-binding, optional)
A shared dispatch-scaffolding helper under `tests/helpers/` parameterised by the swappable `Checkpoint` is the natural home these two files' own comments already point at; the fix stage owns the actual extraction. This finding does not propose renaming, merging, or deleting either test file — only extracting the duplicated non-test scaffolding functions cited above.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` and neither asserts a pinned census/count — not applicable.
- Recording-double check: `PassthroughCheckpoint`/`RecordingCheckpoint` record nothing (both bodies are `return Promise.resolve()`); this is not a MUST-NOT-witness recording double, so the carve-out does not apply.
- docs/bugs/ signature search: `grep -rln "active-invocation-binder-window\|active-invocation-wiring" docs/bugs/` hit `docs/bugs/0073-cancelled-by-session-shutdown-never-emitted.md`, `docs/bugs/0074-registry-insertion-after-binder-await.md`, `docs/bugs/0208-post-deadline-dual-surface-clean-cancel-and-teardown-timeout.md`, `docs/bugs/0468-subagent-teardown-budget-shared-2000ms.md` — these cite both test files BY NAME as witnesses (e.g. bug 0074 §Fix constraint 6 names `tests/active-invocation-binder-window.test.ts` as its own new witness). None of these is a documented correct-reason-red signature for a skip; they pin the two file NAMES as witnesses, which this finding does not propose changing (see Suggested direction).
- coverage-matrix citation search: `grep -n "active-invocation-binder-window.test.ts\|active-invocation-wiring.test.ts" docs/reference/coverage-matrix.md` returned no hits.
- Coverage drift check: this finding does not propose that a test should exist or that a path is untested; it is limited to the duplicated harness functions in the test code that exists today, not the behaviour under test.

## Triage
verdict: confirmed — all four excerpts match at the cited lines; rootWith/noopPi/driveCtx/tick byte-identical modulo whitespace and the Checkpoint/promptTheta pair renamed-only across the two tests/ files; grep reproduces one declaration per name per file; tests/helpers/call-with-clause-harness.ts:158-179 confirms the exporting-helper precedent; docs/bugs 0073/0074/0208/0468 cite file names only and coverage-matrix has no hit, so no carve-out applies; not tracked by PTQ-0209 (different NOOP_CHECKPOINT/rootDouble/producer trio, zero mentions of either file) — note tests/forwarding-detach-wiring.test.ts:90-122 carries a third uncounted copy (triage: claude-fable-5-1)
verdict: confirmed — re-verified independently: all four excerpts match byte-for-byte at the cited lines, the stated grep reproduces (5 names × 2 files), rootWith/noopPi/driveCtx/tick identical modulo whitespace and Checkpoint/promptTheta renamed-only, tests/helpers/call-with-clause-harness.ts:158-179 exports the rootDouble/noopPi/driveCtx precedent, both locations in tests/ with no gate/recording-double/coverage-matrix/bug-witness carve-out (bugs 0073/0074/0208/0468 pin file names only, coverage-matrix has no hit), and no issues/resolved PTQ names either file (PTQ-0209 covered the zero-arg NOOP_CHECKPOINT/rootDouble trio, not this checkpoint-parameterised block); sites:2 undercounts — tests/forwarding-detach-wiring.test.ts:84-122 is an identical third copy and production-cancellation-wiring.test.ts:119 a fourth rootWith (triage: claude-fable-5-1)
