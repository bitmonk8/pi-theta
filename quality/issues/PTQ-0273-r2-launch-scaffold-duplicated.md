---
id: PTQ-0273
title: call-with-clause-failure-arms.test.ts's R2 host()/launchRequest() builders duplicate tests/subagent-child-launch.test.ts's byte-identical pair
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/call-with-clause-failure-arms.test.ts:407-436
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912112713
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# call-with-clause-failure-arms.test.ts's R2 host()/launchRequest() builders duplicate tests/subagent-child-launch.test.ts's byte-identical pair

## Observation
tests/call-with-clause-failure-arms.test.ts's "R2" section (added
2026-09-09, RFC 0009) declares a module-scope `host(overrides)` factory
building an `ExecutableHost` and a `launchRequest(overrides)` factory
building a `SubagentLaunchRequest`, then drives `launchSubagentChild` with
them. `host()`'s body is byte-for-byte identical to a `host()` already
defined in tests/subagent-child-launch.test.ts and
tests/subagent-executable-probe.test.ts, both added six weeks earlier
(2026-07-24, RFC 0005/0006). `launchRequest()` shares the identical field
skeleton (same keys, same order, same nesting) with
tests/subagent-child-launch.test.ts's own `launchRequest()`, differing only
in the literal `hostTools`/`noHostTools`/`cwd`/`parentEnv`/`invokeDepth`/
`host(...)` argument values each file's own scenarios need. Neither builder
is exported from any `tests/helpers/` module.

## Evidence
tests/call-with-clause-failure-arms.test.ts:407-415 (re-read verbatim
immediately before filing):
```ts
function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}
```

tests/subagent-child-launch.test.ts:61-69 — confirmed byte-identical via
`diff` against the excerpt above (zero output):
```ts
function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}
```

tests/subagent-executable-probe.test.ts:27-35 — the same pair again, also
confirmed byte-identical via `diff`:
```ts
function host(overrides: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}
```

tests/call-with-clause-failure-arms.test.ts:417-431 (`launchRequest`'s
signature and skeleton opening):
```ts
function launchRequest(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
  return {
    argv: {
      slug: "child",
      thetaDirs: ["/work/project/.pi/theta"],
      systemPrompt: "you are a subagent",
      hostTools: [],
      noHostTools: true,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    },
    cwd: "/work/project/sub/dir",
    parentEnv: { PATH: "/usr/bin" },
    parentPid: 999,
```

tests/subagent-child-launch.test.ts:426-440 — the identical skeleton (same
9 `argv` keys in the same order, same top-level key set), literal values
differing only where each file's own scenario needs them to:
```ts
function launchRequest(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
  return {
    argv: {
      slug: "child",
      thetaDirs: ["/work/project/.pi/theta"],
      systemPrompt: "you are a subagent",
      hostTools: ["read"],
      noHostTools: false,
      provider: "anthropic",
      model: "claude-sonnet",
      projectTrust: false,
    },
    cwd: "/work/project",
    parentEnv: { PATH: "/usr/bin", ANTHROPIC_API_KEY: "sk-xxx" },
    parentPid: 999,
```
(`diff` of the full 407-436 / 426-445 ranges shows only the `hostTools`,
`noHostTools`, `cwd`, `parentEnv`, `invokeDepth` and `host({…})`-argument
lines differ; the surrounding structure — keys, order, nesting, the
`...overrides` tail — is byte-identical.)

Exact searches: `grep -rl "^function host(overrides: Partial<ExecutableHost>)"
tests --include="*.test.ts"` → exactly 3 files (the three cited above).
`grep -rl "^function launchRequest(overrides" tests --include="*.test.ts"` →
exactly 2 files (tests/call-with-clause-failure-arms.test.ts and
tests/subagent-child-launch.test.ts). `grep -rn "ExecutableHost\|SubagentLaunchRequest"
tests/helpers/*.ts` → only `tests/helpers/fake-json-child.ts`'s
`fakeExecutableHost()` (lines 37-44), which returns a fixed, non-overridable
`ExecutableHost` (`isGenericRuntime: (): boolean => false` unconditionally)
and exports no `SubagentLaunchRequest` builder at all — it cannot serve
either of the two `Partial<...>`-overriding call sites cited above.

## Why this is a problem
This is the "Boilerplate duplication" class: the same `ExecutableHost`
override-capable factory is typed out identically in three files, and the
same `SubagentLaunchRequest` skeleton is typed out in two, six weeks apart,
with no `tests/helpers/` module hosting either shape for
tests/call-with-clause-failure-arms.test.ts (the newest of the three) to
import instead of retyping. `tests/helpers/fake-json-child.ts`'s
`fakeExecutableHost()` — the one export in `tests/helpers/` that is
shaped like part of this bundle — is a different, fixed-value export that
none of the three `host(overrides)` call sites could substitute, since each
relies on being able to override individual fields per test.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting the overridable `host(overrides)`
and `launchRequest(overrides)` pair is the natural home this suite's other
per-shape `tests/helpers/fake-*.ts` extractions (e.g. `fake-json-child.ts`'s
own `fakeExecutableHost()`) already model, and tests/subagent-child-launch.test.ts
— the oldest of the three sites — is where that pair already lives today.

## False-positive check
- Gate-pin check: none of the three files matches `*gate*.test.ts` or the
  named gate kin; the cited lines are harness scaffolding, not a pinned count
  or inventory assertion.
- Recording-double check: `host()`/`launchRequest()` are input builders, not
  recording doubles backing a "never called" witness; not applicable.
- docs/bugs/ signature search: `grep -rn "subagent-child-launch\.test\.ts\|subagent-executable-probe\.test\.ts"
  docs/bugs/*.md` finds several bug docs (0002, 0008, 0168, 0170, 0218, 0323)
  citing tests/subagent-child-launch.test.ts as a witness location — this
  finding proposes no change to that file, or to any of its `it()`/
  `describe()` names or assertions, only that
  tests/call-with-clause-failure-arms.test.ts could import its `host`/
  `launchRequest` shape instead of retyping it; no bug doc cites
  tests/call-with-clause-failure-arms.test.ts itself (`grep -rn
  "call-with-clause-failure-arms" docs/bugs/*.md docs/reference/coverage-matrix.md`
  → 0 hits), so the in-scope file carries no such pin either.
- coverage-matrix/bug-doc citation search: 0 hits for
  "call-with-clause-failure-arms" as shown above.
- Run check: `npx vitest run tests/call-with-clause-failure-arms.test.ts
  tests/subagent-child-launch.test.ts tests/subagent-executable-probe.test.ts`
  → 45/45 passing at HEAD; none of the three is a documented correct-reason
  red.
- Scope note: tests/subagent-child-launch.test.ts and
  tests/subagent-executable-probe.test.ts are outside this wave's assigned
  six-file scope; they are cited only as pattern context confirming the
  duplication (their byte-identity to the in-scope
  tests/call-with-clause-failure-arms.test.ts lines was verified directly
  above via `diff`), not claimed as additional `locations`.
- Coverage check: this finding does not claim a missing test path; every
  cited function is exercised by its own file's tests (45/45 passing,
  confirmed above).

## Triage
verdict: confirmed — `diff` against the exact grepped lines confirms `host(overrides)` is byte-identical across all 3 files and `launchRequest(overrides)` is skeleton-identical across the 2 named files, no tests/helpers/ module exports the overridable shape, and no carve-out or existing PTQ covers it (triage: claude-opus-5)
