---
id: PTQ-0453
title: "T-CMD B60's test name promises verbosity stays 'off' but the body never reads bus.verbosity()"
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/execution-status-command.test.ts:111-121
sites: 1
fix_scope: localized
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# T-CMD B60's test name promises verbosity stays 'off' but the body never reads bus.verbosity()

## Observation
The `describe`/`it` pair for B60 names two distinct claims: the view shape
reaches `'tree'` and verbosity "stays 'off' (no widening)". The body drives
`bus.setVerbosity("off")`, dispatches `"tree"` through the command handler,
and asserts only `bus.viewShape()).toBe("tree")`. `ExecutionStatusBus`
exposes a `verbosity()` getter (`src/extension/execution-status/bus.ts:336-338`,
returning `this.#verbosity`), and it is used elsewhere in the sibling
`tests/execution-status-bus.test.ts` file, but this test never calls it.

## Evidence
tests/execution-status-command.test.ts:111-121
```ts
describe("T-CMD — B60: /theta-status tree under verbosity off still renders nothing", () => {
  it("view shape reaches 'tree' but verbosity stays 'off' (no widening)", async () => {
    const bus: ExecutionStatusBus = createExecutionStatusBus({ clock: new FakeClock(), sinks: [] });
    bus.setVerbosity("off");
    const deps: RegisterThetaStatusCommandDeps = { current: () => bus };
    const { pi, getHandler } = fakePi();
    registerThetaStatusCommand(pi, deps);
    const { ctx } = recordingNotify();
    await getHandler()("tree", ctx);
    expect(bus.viewShape()).toBe("tree");
  });
});
```

`bus.verbosity()` exists and is never invoked in this file — exact search and
hit count:
```
$ grep -n "verbosity()" tests/execution-status-command.test.ts
(no output — 0 hits)
```

The getter it would have needed to call, `src/extension/execution-status/bus.ts:336-338`:
```ts
  verbosity(): ProgressVerbosity {
    return this.#verbosity;
  }
```

## Why this is a problem
A reader following the `it` title "view shape reaches 'tree' but verbosity
stays 'off' (no widening)" would conclude this test pins the no-widening
ceiling behaviour the surrounding `describe` block names ("B60 — verbosity
off ceiling: the command never widens it", `tests/execution-status-command.test.ts:105-108`
comment). Mechanically, the only assertion in the body is
`expect(bus.viewShape()).toBe("tree")`; nothing reads `bus.verbosity()` or
otherwise observes whether verbosity was left at `"off"` or was changed. A
future implementation that widened verbosity as a side effect of the `tree`
dispatch would pass this test unchanged, because the half of the title's
claim that would catch that regression is never checked.

## Suggested direction (non-binding, optional)
The test could add `expect(bus.verbosity()).toBe("off")` alongside the
existing `viewShape` assertion, since the getter it needs already exists on
`ExecutionStatusBus` and is exercised elsewhere in the same test family.

## False-positive check
- Gate-pin carve-out: filename is `execution-status-command.test.ts`, does not match `*gate*.test.ts` or any listed gate kin — not applicable.
- Recording-double carve-out: no recording double is involved in the assertion gap; the missing check is a direct getter call, not a negative witness.
- docs/bugs/ signature search: `grep -rn "B60" docs/bugs/` and `grep -rn "theta-status" docs/bugs/` found no report naming this test's failure signature as a documented correct-reason red; the suite runs green at HEAD (`npx vitest run tests/execution-status-command.test.ts` — 9 passed).
- coverage-matrix/bug-doc citation search: `grep -rn "execution-status-command.test.ts" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — this test is not pinned by name in either location.
- Coverage drift check: this finding does not claim a behaviour is untested elsewhere; it is scoped to this one test's own name-vs-body mismatch, which is a D7 misleading-name claim, not a coverage gap.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: excerpt at tests/execution-status-command.test.ts:111-121 reproduces verbatim; the `it` title asserts two propositions (view shape reaches 'tree' AND verbosity stays 'off') but the body's sole `expect` is `bus.viewShape()).toBe("tree")`; `grep "verbosity()"` in the file → 0 hits (reproduced); the getter exists on the ExecutionStatusBus interface (types.ts:199, bus.ts:336-338) so the second clause is checkable and unchecked — D7 misleading-name; no gate/recording-double/bug-doc/coverage-matrix carve-out applies (suite green, 9 passed; `theta-status` hit in docs/bugs/0472 is unrelated); not tracked by any existing PTQ. Peripheral inaccuracy noted, not load-bearing: the getter is NOT used in tests/execution-status-bus.test.ts as claimed — its only caller is src/extension/execution-status/progress-tool.ts:236 (triage: claude-fable-5-1)
