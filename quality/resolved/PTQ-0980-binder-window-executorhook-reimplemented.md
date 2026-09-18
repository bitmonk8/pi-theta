---
id: PTQ-0980
title: active-invocation-binder-window.test.ts reimplements the executorHook statement-executor double instead of importing the canonical tests/helpers/parked-statement-executor
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/active-invocation-binder-window.test.ts:32-47
  - tests/helpers/parked-statement-executor.ts:1-28
  - tests/active-invocation-wiring.test.ts:30-30
sites: 1
fix_scope: localized
wave: qw20260918155535
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# active-invocation-binder-window.test.ts reimplements the executorHook statement-executor double instead of importing the canonical tests/helpers/parked-statement-executor

## Observation
`tests/active-invocation-binder-window.test.ts` declares its own top-level
`const executorHook = vi.hoisted(...)` object and its own
`vi.mock("../src/runtime/statement-executor", ...)` call that replaces
`executeBody` with a hook-dispatching stub, then resets the hook's counter in
its own `afterEach`. Its sibling file in this same review scope,
`tests/active-invocation-wiring.test.ts`, imports this identical
`vi.hoisted`/`vi.mock` shape from `tests/helpers/parked-statement-executor.ts`
(`executorHook`, `mockStatementExecutor`, `resetExecutorHook`) rather than
declaring it locally. The canonical helper module exists and is proven live
by the sibling file's import; `active-invocation-binder-window.test.ts` does
not import it.

## Evidence
`tests/active-invocation-binder-window.test.ts:29-47` (re-read immediately
before filing):
```ts
// The DRIVE seam's body call is the "did the theta run?" observable; parking it
// is not needed here (the binder is the parked step), but it must be observable
// and must not require a live session.
const executorHook = vi.hoisted(() => ({
  calls: 0,
}));
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/runtime/statement-executor")>();
  return {
    ...actual,
    executeBody: (): Promise<unknown> => {
      executorHook.calls += 1;
      // A `fail` outcome routes the prompt surface down the branch that never
      // reads `sessionManager`, keeping the harness session-free.
      return Promise.resolve({ outcome: "fail", error: null });
    },
  };
});
```

`tests/helpers/parked-statement-executor.ts:1-28` (re-read immediately before
filing — the canonical hoisting/mocking module the sibling file imports):
```ts
// Strict executeBody hook shared by DRIVE-seam tests. Each test file keeps a
// top-level vi.mock and dynamically imports mockStatementExecutor from that
// factory: Vitest hoists vi.mock before static imports initialise. The same
// cached helper supplies the hook the test scripts; reset it after each test.

export const executorHook = {
  impl: undefined as
    | ((...args: readonly unknown[]) => Promise<unknown>)
    | undefined,
};

export async function mockStatementExecutor(
  importOriginal: () => Promise<typeof import("../../src/runtime/statement-executor")>,
) {
  const actual = await importOriginal();
  return {
    ...actual,
    executeBody: (...args: readonly unknown[]): Promise<unknown> => {
      if (executorHook.impl === undefined) {
        throw new Error("executorHook.impl not set by the test");
      }
      return executorHook.impl(...args);
    },
  };
}

export function resetExecutorHook(): void {
  executorHook.impl = undefined;
}
```

`tests/active-invocation-wiring.test.ts:30` and `:46` (re-read immediately
before filing — the sibling file importing the canonical module instead of
redeclaring it):
```ts
import { executorHook, resetExecutorHook } from "./helpers/parked-statement-executor";
```
```ts
vi.mock("../src/runtime/statement-executor", async (importOriginal) => {
  const { mockStatementExecutor } = await import("./helpers/parked-statement-executor");
  return mockStatementExecutor(importOriginal);
});
```
`active-invocation-binder-window.test.ts`'s counting need (`executorHook.calls
+= 1`) is reachable through the canonical `impl` slot without a second
`vi.mock` declaration: `executorHook.impl = async () => { calls += 1; return
{ outcome: "fail", error: null }; }` sets a local counter through the same
hook the sibling file already imports; the file instead re-declares its own
`vi.hoisted` object and its own `vi.mock` call with a different field name
(`calls` vs `impl`).

## Why this is a problem
The same "park `executeBody` behind a `vi.hoisted` object, mock the module
once at the top of the file" double is authored a second, independent way in
this file rather than built on the one `tests/helpers/parked-statement-executor.ts`
already exports and the sibling test in this same review already imports. A
future change to the mock's throw-on-unset guard, its import-original
forwarding, or its module path would need to be applied in this file's local
copy by hand, since it has no import relationship to the shared module at
all.

## Suggested direction (non-binding, optional)
Setting `executorHook.impl` (imported from
`tests/helpers/parked-statement-executor.ts`, as the sibling file already
does) to a closure that increments a locally-scoped counter reaches the same
"did the theta body run?" observable this file needs, without a second
`vi.hoisted`/`vi.mock` declaration.

## False-positive check
- Gate-pin check: `active-invocation-binder-window.test.ts` does not match
  `*gate*.test.ts` or the named gate kin; not applicable.
- Recording-double check: `executorHook.calls` counts invocations of a
  parked stub for a positive "did the body run" assertion
  (`expect(dispatch.bodyCalls(), ...).toBe(0)`), not a MUST-NOT-called
  witness backed by a canonical recording double; the negative-witness
  carve-out does not shield this — the claim is about the mock-declaration
  block being redeclared, not about the validity of any count assertion
  built on it.
- docs/bugs/ signature search: `grep -rln "active-invocation-binder-window"
  docs/bugs/` → `docs/bugs/0074-registry-insertion-after-binder-await.md`
  cites the file NAME as its own new witness (bug 0074 §Fix constraint 6);
  it does not document this `executorHook`/`vi.mock` block as a correct-
  reason red, and no skip or disabled-test claim is made here.
- coverage-matrix citation search: `grep -n
  "active-invocation-binder-window.test.ts" docs/reference/coverage-matrix.md`
  → 0 hits. This finding proposes no merge, rename, or deletion of the file
  or any `it()`/`describe()` inside it — only that the mock-hoisting block
  could import the existing shared module instead of being redeclared.
- Coverage-drift check: this finding is about a repeated mock-declaration
  shape in test code that exists and passes today; it makes no claim that
  any behaviour or path is untested.
- Duplicate/prior-finding check: `quality/resolved/PTQ-0595-executorhook-statement-executor-mock-duplicated.md`
  (fixed) filed the byte-identical `vi.hoisted`/`vi.mock` block across four
  OTHER files (`cancelled-by-session-shutdown-note.test.ts`,
  `forwarding-detach-wiring.test.ts`, `post-deadline-dual-surface.test.ts`,
  `subagent-drive-teardown.test.ts`) and its own Observation explicitly named
  `active-invocation-binder-window.test.ts`'s `calls`-counter variant (and
  `b0476-panic-site-and-frames.test.ts`'s `impl ?? actual.executeBody`
  variant) as near-variants NOT included in that filing's four cited sites —
  its own text: "the other three... and the two near-variant sites are cited
  as instances of the same repeated shape... not as separate findings
  against out-of-scope files." That fix produced
  `tests/helpers/parked-statement-executor.ts` (confirmed live and imported
  by `active-invocation-wiring.test.ts` today) but did not migrate
  `active-invocation-binder-window.test.ts`, which remains unmigrated at
  HEAD — this filing is the first to name that specific, still-unaddressed
  site now that the canonical helper it should import exists and has a live
  in-scope importer to point at.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: the local `executorHook = vi.hoisted` + `vi.mock("../src/runtime/statement-executor")` block reproduces at tests/active-invocation-binder-window.test.ts:32-47 with the `afterEach` reset at :157-159, tests/helpers/parked-statement-executor.ts:1-28 exists and is live with FIVE importers (active-invocation-wiring, cancelled-by-session-shutdown-note, forwarding-detach-wiring, post-deadline-dual-surface, subagent-drive-teardown — every other PTQ-0595 site migrated), leaving this file as one of only two remaining local declarations (`grep -rn "executorHook = vi.hoisted" tests/` → 2; the other, b0476:105-118, is a passthrough-to-actual default variant the filing correctly excludes, so `sites: 1` is accurate); the helper's own header documents exactly the proposed shape (per-file top-level `vi.mock` dynamically importing `mockStatementExecutor`) and the `fail`-outcome + call count is reachable by setting `executorHook.impl` inside `dispatchParkedInBinder` before the drive, so the fold is mechanical; not a duplicate — resolved PTQ-0595:34-36,126-127,167 explicitly named this `calls`-counter variant as a near-variant NOT among its four cited sites and its fix did not touch this file; D7 copy-paste double in tests/ only, no carve-out applies (not a gate test; docs/bugs/0074 names the file as witness but no merge/rename/delete is proposed; coverage-matrix grep → 0 reproduces; both files green 7/7) (triage: claude-fable-5-1)
