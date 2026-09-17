---
id: PTQ-0681
title: prompt-mode-extension-tool-reach-e2e.test.ts's FakeParentHost class is a near-byte-identical copy of subagent-fn-extension-tool-dispatch-e2e.test.ts's FakeParentHost
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/prompt-mode-extension-tool-reach-e2e.test.ts:83-195
  - tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:87-199
sites: 2
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# prompt-mode-extension-tool-reach-e2e.test.ts's FakeParentHost class is a near-byte-identical copy of subagent-fn-extension-tool-dispatch-e2e.test.ts's FakeParentHost

## Observation
`tests/prompt-mode-extension-tool-reach-e2e.test.ts` declares a ~113-line `class FakeParentHost` wrapping the shared `FakeHostLoopHost` (from `tests/helpers/fake-host-loop-host.ts`) with `pi`/`ctx`/`runCtx()` extension-surface getters. `tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` declares a class of the same name with the same members, same getter bodies, and the same `pi`/`ctx`/`runCtx()` shape. The two classes differ only in: (a) `prompt-mode-extension-tool-reach-e2e.test.ts` adds a `getAllToolsCalls` counter field and increments it inside `getAllTools()` (to witness the load-time-only-resolution invariant its own suite asserts), and (b) a doc-comment line. `tests/helpers/fake-host-loop-host.ts` centralises the fabricated-turn core (`FakeHostLoopHost`) both classes wrap, but the wrapping `FakeParentHost` adapter itself is typed twice.

## Evidence

`tests/prompt-mode-extension-tool-reach-e2e.test.ts:83-100`:
```ts
class FakeParentHost {
  /** The shared fabricated-turn simulation (providers, model, active set, transcript). */
  readonly loop: FakeHostLoopHost;
  readonly notifications: string[] = [];
  readonly notes: string[] = [];
  getAllToolsCalls = 0;

  constructor(readonly cwd: string) {
    this.loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
  }

  get executorCalls(): readonly { name: string; args: unknown }[] {
    return this.loop.executorCalls;
  }
```

`tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:87-99` (the counterpart — identical constructor and executorCalls getter, minus the `getAllToolsCalls` counter):
```ts
class FakeParentHost {
  readonly loop: FakeHostLoopHost;
  readonly notifications: string[] = [];
  readonly notes: string[] = [];

  constructor(readonly cwd: string) {
    this.loop = new FakeHostLoopHost((name, args) => ({
      content: [{ type: "text", text: `RAN:${name}:${JSON.stringify(args)}` }],
      isError: false,
    }));
  }

  get executorCalls(): readonly { name: string; args: unknown }[] {
    return this.loop.executorCalls;
  }
```

`tests/prompt-mode-extension-tool-reach-e2e.test.ts:117-166` (`ctx`/`runCtx()` getters, byte-identical to the counterpart below except the load-time counting inside `getAllTools`):
```ts
  get ctx(): ExtensionContext {
    const host = this;
    const loop = this.loop;
    return {
      cwd: this.cwd,
      hasUI: true,
      get model(): Model<Api> {
        return loop.currentModel;
      },
      isIdle: (): boolean => loop.isIdle(),
      modelRegistry: {
        getAvailable: (): readonly unknown[] => [],
        find: (provider: string, id: string): Model<Api> | undefined =>
          loop.findRegisteredModel(provider, id),
      },
      sessionManager: {
        getEntries: (): readonly { type: string; message?: Record<string, unknown> }[] =>
          [...loop.entries],
        getLeafId: (): undefined => undefined,
      },
      ui: {
        notify: (message: string): void => {
          host.notifications.push(message);
        },
      },
    } as unknown as ExtensionContext;
  }
```

`tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:143-171` carries the byte-identical `ctx`/`runCtx()` block (verified by direct diff below).

Verification performed during this review: `sed -n '83,195p' tests/prompt-mode-extension-tool-reach-e2e.test.ts` diffed against `sed -n '87,199p' tests/subagent-fn-extension-tool-dispatch-e2e.test.ts` reports exactly two content diffs across the whole class body — the added doc-comment line, and the `getAllToolsCalls` counter/increment (a one-line field plus wrapping the `getAllTools` array literal in a counting closure) — every other line (the `pi` getter's dozen members, the `ctx` getter, and `runCtx()`) is byte-identical.

## Why this is a problem
A ~110-line adapter class — the `pi`/`ctx`/`runCtx()` extension-surface wiring around the shared `FakeHostLoopHost` fabricated-turn core — is typed twice across two e2e files that both drive the same production compose helper (`discoverAndComposeFixtures`) over the same parent-leg load pass. `tests/helpers/fake-host-loop-host.ts` already centralises the turn-simulation core both files wrap; the wrapping adapter that turns that core into an `ExtensionAPI`/`ExtensionContext` pair is not centralised, so a change to that adapter shape (e.g. a new `pi` member the production load pass starts reading) must be made in both files identically to keep them in sync.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module exporting a `FakeParentHost`-shaped adapter around `FakeHostLoopHost` (parameterised by the tool name/schema each file's `getAllTools()` returns) would sit beside `tests/helpers/fake-host-loop-host.ts`, which the two files already import in common.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin; the cited lines are a fake-host adapter class, not a pinned count or inventory assertion.
- Recording-double check: `FakeParentHost`'s `notifications`/`notes`/`executorCalls` arrays are positive read-back recorders (both files assert on what WAS notified/executed/dispatched), not "never called" witnesses; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "prompt-mode-extension-tool-reach-e2e\|subagent-fn-extension-tool-dispatch-e2e" docs/bugs/` finds each file's own subject bug (0001/PIC-64 for the former), no doc marking the duplicated adapter class itself as a documented correct-reason red; both files pass at HEAD.
- coverage-matrix/bug-doc citation search: `grep -n "prompt-mode-extension-tool-reach-e2e\|subagent-fn-extension-tool-dispatch-e2e" docs/reference/coverage-matrix.md` → 0 hits pinning this shared class by name. This finding proposes no merge, rename or deletion of any `it()`/`describe()`.
- Coverage check: the claim is about a duplicated fixture/double DEFINITION; each file's own suite exercises its own copy of the class, so this is not a coverage-gap claim.

## Triage
verdict: confirmed — independently re-verified: sed-extracted 113-line class bodies (tests/prompt-mode-extension-tool-reach-e2e.test.ts:83-195 vs tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:87-193; the second range overshoots the class by 6 suite-prelude lines) diff to exactly the doc-comment line, the `getAllToolsCalls = 0` field and the counting wrapper around the same `getAllTools` literal — constructor, `pi` (12 members), `ctx`, `runCtx()` byte-identical; `FakeParentHost` greps to only these two files, the second's own section header says "mirrors prompt-mode-extension-tool-reach-e2e", both suites pass at HEAD (6/6), neither is a gate file, coverage-matrix has 0 hits, the docs/bugs hits (0183/0207/0215) cite header comments not the class, and no quality/issues or resolved PTQ tracks this pair (wave sibling d7-02 is the distinct resolvingHost double) — D7 copy-paste fixture/double, tests/-only, mechanical dedupe (triage: claude-fable-5-1)
