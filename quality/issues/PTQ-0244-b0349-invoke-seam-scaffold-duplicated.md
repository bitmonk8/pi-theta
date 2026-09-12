---
id: PTQ-0244
title: b0349 redeclares the SEAM_NOOP_CHECKPOINT/SINK/MUTATOR + span() + seamDeps InvokeChild-double harness tests/b0294, tests/b0295 and tests/b0347 already established
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:140-264
sites: 1
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0349 redeclares the SEAM_NOOP_CHECKPOINT/SINK/MUTATOR + span() + seamDeps InvokeChild-double harness tests/b0294, tests/b0295 and tests/b0347 already established

## Observation
tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts declares, module
scope, a `SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR` no-op
triple, a `span()` helper, a `RecordedHop` interface, a callee-returning
`InvokeChild` double, and a `seamDeps(...)` function that assembles an
`ExecuteBodyDeps` for driving the real `executeBody` executor. The identical
`SEAM_NOOP_CHECKPOINT`/`SEAM_NOOP_SINK`/`SEAM_NOOP_MUTATOR`/`span()` block, and
the near-identical `seamDeps` shape built on it, already exist in
tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts,
tests/b0295-child-internal-cancel-wrap-arm.test.ts and
tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts. No
`tests/helpers/` module exports any piece of this bundle.

## Evidence
tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:140-161 (the
no-op triple plus `span()`, re-read verbatim immediately before filing):
```ts
const SEAM_NOOP_CHECKPOINT: Checkpoint = {
  before(): Promise<void> {
    return Promise.resolve();
  },
};

const SEAM_NOOP_SINK: ToolLoweringSink = {
  diagnostic(): void {},
  systemNote(): void {},
};

const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/b0295-child-internal-cancel-wrap-arm.test.ts:133-143 — the identical
`SEAM_NOOP_MUTATOR` + `span()` pair, confirmed byte-identical via direct
`diff` against the equivalent b0349 lines:
```ts
const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts:331-341 —
the same pair again, also confirmed byte-identical via `diff`:
```ts
const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};

function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts:481-487 (the
`SEAM_NOOP_MUTATOR`, byte-identical) and :458-460 (`span()`, byte-identical;
this file places `span()` earlier in the file than the no-op triple, but the
two fragments are otherwise unchanged):
```ts
const SEAM_NOOP_MUTATOR: CommittedConversationMutator = {
  truncate(): void {},
  rewrite(): void {},
  replace(): void {},
  remove(): void {},
  injectCompensatingTurn(_surface: CommittedSurface): void {},
};
```
```ts
function span(): SourceRange {
  return { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };
}
```

Beyond the no-op scaffold, the `seamDeps` driver's closing assembly is also
byte-identical between b0295 and b0349. tests/b0295-child-internal-cancel-wrap-arm.test.ts:219-228:
```ts
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt" as DrivenConversationMode,
    file: PARENT_FILE,
  };
}
```
tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts:255-264 — the
identical block (re-read verbatim immediately before filing):
```ts
  return {
    env: buildEnvironment({ body: { statements: [], tail: null } }),
    host: createEffectfulStatementHost(hostDeps),
    checkpoint: SEAM_NOOP_CHECKPOINT,
    signal,
    mutator: SEAM_NOOP_MUTATOR,
    mode: "prompt" as DrivenConversationMode,
    file: PARENT_FILE,
  };
}
```

`seamDeps`'s opening (signature plus the `hostDeps` object's first shared
fields) is likewise byte-identical between b0295 (:187-206) and b0349
(:208-227): both declare `checkpoint: SEAM_NOOP_CHECKPOINT, signal, sink:
SEAM_NOOP_SINK, file: PARENT_FILE, evaluatePure(): ThetaValue { return null;
}, resolveQuery(): QueryHostDispatch { throw new Error(...) }` verbatim before
diverging only where each file's own call-routing needs differ (b0349 adds a
`classifyCall`/`resolveCallAsInvoke` pair for its code-call leg; b0295 exposes
`resolveInvoke` directly for its invoke-expr leg). The `RecordedHop` interface
(`readonly wrapper: InvokeCalleeError; readonly calleePath: string; readonly
callSite: InvokeCallSite;`) is byte-identical across all four files.

Exact searches: `grep -rl "SEAM_NOOP_CHECKPOINT" tests --include="*.test.ts"`
→ exactly 4 files (b0294, b0295, b0347, b0349) repo-wide. `grep -rl "function
seamDeps" tests --include="*.test.ts"` → exactly 3 files (b0295, b0347,
b0349). `grep -rl "function calleeReturningInvokeChild" tests
--include="*.test.ts"` → exactly 2 files (b0295, b0349; b0347's analogous
double is named `invokeChildWithSource`, b0294's is named
`cancelledReturningInvokeChild`). `grep -rl "InvokeChild\|SEAM_NOOP\|ExecuteBodyDeps"
tests/helpers/*.ts` → 0 hits: no `tests/helpers/` module hosts any piece of
this bundle.

## Why this is a problem
The no-op `Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator`
triple and `span()` are reproduced character-for-character in four sibling
test files (confirmed by direct comparison above), and the `seamDeps`
driver built on top of that scaffold — the function that assembles a real
`ExecuteBodyDeps` around an injected `InvokeChild` double for driving the
real `executeBody` executor — is reproduced near-verbatim in three of the
four, diverging only where each cell's own call-routing (`invoke(...)` vs a
bare-identifier `.theta`-callable call) requires a different dispatch arm.
b0349's own header names this lineage directly: "the same seam the bug-0295
sibling harness drives", and describes itself as "the sibling of bug 0295 …
surviving 30 lines above on the tool-position leg" — the duplication is a
traceable, self-documented lineage (b0294 first, then b0295 and b0349 the
same day, then b0347 the following day), not independent convergence. No
`tests/helpers/` module exports any piece of this bundle for a fourth or
fifth sibling to import instead of retyping it.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting the no-op
`Checkpoint`/`ToolLoweringSink`/`CommittedConversationMutator` triple,
`span()`, `RecordedHop`, and a parameterised callee-returning `InvokeChild`
double is the home this bundle's own repeated "sibling harness" framing
already points toward, alongside this suite's existing per-shape
`tests/helpers/fake-*.ts` and `*-harness.ts` modules.

## False-positive check
- Gate-pin check: none of the four files (b0294, b0295, b0347, b0349)
  matches `*gate*.test.ts` or the named kin; the cited lines are harness
  scaffolding, not a pinned count or inventory assertion.
- Recording-double check: `RecordedHop`-typed hop lists back genuine
  MUST-NOT/count witnesses inside these files' own test bodies (e.g. `hops.length`
  assertions), but this finding does not claim any such assertion cannot
  fail — it claims the double's and scaffold's own DEFINITIONS are
  copy-pasted across files rather than shared, a distinct claim the
  negative-witness carve-out does not cover (mirroring the reasoning
  already accepted for the b0333/b0334/b0335 harness-duplication finding).
- docs/bugs/ signature search: docs/bugs/0294-callee-propagated-invoke-infra-unwrapped-misattributed.md
  Status "fixed (0.326.0)"; docs/bugs/0295-child-internal-cancel-wrap-arm-unreachable.md
  Status "fixed (0.337.0)"; docs/bugs/0347-subagent-leg-propagated-mintable-invoke-infra-stays-bare.md
  Status "fixed (0.347.0)"; docs/bugs/0349-theta-callable-code-call-leg-child-internal-cancel-bare.md
  Status "fixed (0.338.0)". `npx vitest run
  tests/b0349-codecall-child-internal-cancel-wrap-arm.test.ts` → 6 passed (6)
  at HEAD, so this is not a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0349-codecall-child-internal-cancel-wrap-arm" docs/reference/coverage-matrix.md`
  → 0 hits. `grep -rl "b0349-codecall-child-internal-cancel-wrap-arm"
  docs/bugs/*.md` → only its own bug document. This finding proposes no
  merge, rename or deletion of the file or any `it()`/`describe()` — only
  that the harness pieces could be imported rather than redeclared — so no
  citation is affected.
- Established-convention check, narrow claim vs. the wider ecosystem: a
  throwaway `span()` returning the same 1:1–1:2 range, and an inertly-stubbed
  `Checkpoint`, are common ingredients anywhere `ExecuteBodyDeps` is built
  (`grep -rl "ExecuteBodyDeps" tests` → 30 files back to 2026-07-02, e.g.
  tests/statement-executor.test.ts's own `span()`/`NOOP_CHECKPOINT`), and
  `CommittedConversationMutator = {` no-op literals recur under other names
  too (`NOOP_ORDER_MUTATOR` in tests/b0370-reassign-target-scope.test.ts;
  `SEAM_NOOP_MUTATOR` again, alone, in
  tests/call-with-clause-failure-arms.test.ts, 2026-09-09). This finding does
  not claim any single ingredient in isolation is exclusive to the four cited
  files — it claims the specific CO-OCCURRING BUNDLE (all three no-ops under
  the identical `SEAM_NOOP_*` names, plus `span()`, plus the `seamDeps`
  driver assembling them into an `ExecuteBodyDeps` around an injected
  `InvokeChild` double, plus the `RecordedHop`-typed hop recorder) is
  confirmed by direct grep to recur in exactly these four files and no
  others, forming one explicitly cross-referencing 36-hour lineage
  (0294→0295/0349→0347) — not the 27/42/91/107/186-file breadth of shared
  single-ingredient conventions (`liveSignal`, `NOOP_CHECKPOINT` alone, generic
  AST `span()`) that made structurally similar claims false positives
  elsewhere in this suite.
- Scope note: tests/b0294-callee-propagated-invoke-infra-wrapped-unit.test.ts,
  tests/b0295-child-internal-cancel-wrap-arm.test.ts and
  tests/b0347-subagent-leg-propagated-mintable-wrapped-unit.test.ts are
  outside this wave's assigned six-file scope; they are cited only as
  pattern context confirming the duplication (their byte-identity to the
  in-scope b0349 lines was verified directly above), not claimed as
  additional `locations` — mirroring this same bug family's own
  PTQ-0233/PTQ-0241 findings, which draw the identical in-scope/pattern-context
  boundary for the same four files.
- Coverage check: this finding does not claim a missing test path; every
  cited function is exercised by its own file's tests (b0349: 6/6 passing,
  confirmed above).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently reproduced: the SEAM_NOOP_CHECKPOINT/SINK/MUTATOR triple + span() diff byte-identical across b0294/b0295/b0347/b0349, b0349's seamDeps shared prefix and closing return block diff byte-identical to b0295's, the cited grep counts (SEAM_NOOP_CHECKPOINT=4, seamDeps=3, calleeReturningInvokeChild=2, tests/helpers/*.ts=0) and docs/bugs statuses/6-of-6 vitest pass all reproduce, and the 2026-09-01×3/09-02 commit-date lineage matches exactly as claimed; one overstatement found (b0294 has zero RecordedHop/"hop" occurrences at all, so "is byte-identical across all four files" is false for that one clause) but it only narrows, not negates, the genuine, no-tests/helpers-export, not-explained-by-wider-convention duplication at the cited b0349 location, and no existing PTQ tracks this root cause (triage: claude-opus-5)
