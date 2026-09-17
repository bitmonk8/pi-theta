---
id: PTQ-0471
title: subagent-child-launch.test.ts's local host()/launchRequest() re-implement the canonical overridableExecutableHost/fakeSubagentLaunchRequest helpers already exported by tests/helpers/fake-json-child.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/subagent-child-launch.test.ts:61-69
  - tests/subagent-child-launch.test.ts:426-444
  - tests/subagent-executable-probe.test.ts:27-35
  - tests/helpers/fake-json-child.ts:54-62
  - tests/helpers/fake-json-child.ts:68-85
sites: 3
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# subagent-child-launch.test.ts's local host()/launchRequest() re-implement the canonical overridableExecutableHost/fakeSubagentLaunchRequest helpers already exported by tests/helpers/fake-json-child.ts

## Observation
`tests/subagent-child-launch.test.ts` declares a module-scope `host(overrides)`
function building an `ExecutableHost` and a `launchRequest(overrides)`
function building a `SubagentLaunchRequest`. `tests/helpers/fake-json-child.ts`
already exports `overridableExecutableHost(overrides?)` and
`fakeSubagentLaunchRequest(overrides?)` with byte-identical (host) or
skeleton-identical (launchRequest) bodies. Both helper exports were added by
commit `4d1c9e6a` ("quality: qw20260912112713 fix tests__p5") specifically to
let `tests/call-with-clause-failure-arms.test.ts` stop retyping this exact
pair (the prior finding, PTQ-0273, now `status: fixed`) — but
`tests/subagent-child-launch.test.ts`, the file PTQ-0273 named as the
oldest/original site of the pattern, was left untouched by that fix and still
carries its own local copies. `tests/subagent-executable-probe.test.ts`
carries a third, byte-identical copy of `host()` alone.

## Evidence
`tests/subagent-child-launch.test.ts:61-69` (local `host`):
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

`tests/helpers/fake-json-child.ts:54-62` (the canonical export, byte-identical
body):
```ts
export function overridableExecutableHost(overrides?: Partial<ExecutableHost>): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (p): boolean => /(?:^|\/)(?:node|bun)$/.test(p),
    ...overrides,
  };
}
```
`diff` of the two return-object bodies (ignoring the function signature's
`overrides` vs `overrides?` optionality) shows zero differences.

`tests/subagent-executable-probe.test.ts:27-35` — the same local `host()`
again, also byte-identical to both of the above:
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

`tests/subagent-child-launch.test.ts:426-444` (local `launchRequest`):
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
    invokeDepth: 3,
    host: host({ argv1: "/app/pi/dist/index.js", fileExists: (): boolean => true }),
    ...overrides,
  };
}
```

`tests/helpers/fake-json-child.ts:68-85` (the canonical export, same
`argv`/top-level key set and order, only the leaf literals and the `host`
field differing):
```ts
export function fakeSubagentLaunchRequest(overrides?: Partial<SubagentLaunchRequest>): SubagentLaunchRequest {
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
    invokeDepth: 0,
    host: overridableExecutableHost(),
    ...overrides,
  };
}
```

Exact searches: `grep -rl "^function host(overrides: Partial<ExecutableHost>)"
tests --include="*.test.ts"` → exactly the two files cited above
(`tests/subagent-child-launch.test.ts`, `tests/subagent-executable-probe.test.ts`).
`grep -rn "overridableExecutableHost\|fakeSubagentLaunchRequest"
tests/subagent-child-launch.test.ts tests/subagent-executable-probe.test.ts`
→ 0 hits in either file — neither imports the canonical helper it duplicates.
`git log -p --follow -- tests/helpers/fake-json-child.ts | grep -n
"overridableExecutableHost\|fakeSubagentLaunchRequest"` shows both exports
introduced only in commit `4d1c9e6a`, the PTQ-0273 fix commit, whose diffstat
touches `tests/call-with-clause-failure-arms.test.ts` and
`tests/helpers/fake-json-child.ts` only — neither of the two files cited here.

## Why this is a problem
The canonical, overridable versions of both fixtures already exist,
purpose-built (by the doc comments at `fake-json-child.ts:48-53` and `:64-67`)
to serve exactly this "vary a field or two off a fixed `ExecutableHost` /
`SubagentLaunchRequest` skeleton" need, and were added specifically to let a
sibling file stop typing this pair out locally. `tests/subagent-child-launch.test.ts`
and `tests/subagent-executable-probe.test.ts` keep independent, hand-typed
copies of the same shape (one exactly byte-identical, one skeleton-identical)
instead of importing the helper that already ships in `tests/helpers/`.

## Suggested direction (non-binding, optional)
`tests/subagent-child-launch.test.ts` and `tests/subagent-executable-probe.test.ts`
importing `overridableExecutableHost` (and, for the former,
`fakeSubagentLaunchRequest`) from `tests/helpers/fake-json-child.ts` instead of
retyping the same bodies would leave one copy of each fixture to keep in sync;
this is an observation about the helper module both files already sit beside
in the same test suite, not a design.

## False-positive check
- Gate-pin carve-out: neither file matches `*gate*.test.ts` or the named gate
  kin; the cited lines are harness fixture builders, not a pinned count or
  inventory assertion.
- Recording-double carve-out: `host()`/`launchRequest()` (and their canonical
  counterparts) are input-value builders, not recording doubles backing a
  "never called" witness; the carve-out does not apply.
- docs/bugs/ signature search: `grep -rn "subagent-child-launch\.test\.ts\|subagent-executable-probe\.test\.ts"
  docs/bugs/*.md` finds bug docs (0002, 0008, 0168, 0170, 0218, 0323) citing
  `tests/subagent-child-launch.test.ts` as a witness location; this finding
  proposes no change to any `it()`/`describe()` name or assertion in either
  file, only that the two local fixture builders could import the existing
  `tests/helpers/fake-json-child.ts` exports instead of retyping them — no
  cited witness is touched.
- coverage-matrix/bug-doc citation search: `grep -n "subagent-child-launch\.test\.ts\|subagent-executable-probe\.test\.ts"
  docs/reference/coverage-matrix.md` → 0 hits; no merge/rename/delete is
  proposed for either file or any test inside it.
- Duplicate-of-PTQ-0273 check: PTQ-0273 (`status: fixed`) filed the same
  three-file pattern but its `locations` field named only
  `tests/call-with-clause-failure-arms.test.ts:407-436` — its own text
  explicitly scopes `tests/subagent-child-launch.test.ts` and
  `tests/subagent-executable-probe.test.ts` out as "pattern context ... not
  claimed as additional locations" because they were outside that wave's
  assigned scope. The fix commit `4d1c9e6a` bears this out: it created the
  canonical helpers and migrated only the named file, leaving the two files
  cited here untouched — so this finding is not a re-filing of an already-
  actioned location, it is the residual half of the same root cause the prior
  fix did not reach.
- Coverage check: no claim is made that any behaviour is untested; both local
  fixture builders are exercised by their own files' passing tests
  (`npx vitest run tests/subagent-child-launch.test.ts
  tests/subagent-executable-probe.test.ts` — both pass at HEAD).

## Triage
<!-- triage appends its note here -->
verdict: confirmed — independently re-verified: all five excerpts match verbatim at the cited lines; `diff` of host() at subagent-child-launch.test.ts:61-69 and subagent-executable-probe.test.ts:27-35 against overridableExecutableHost at fake-json-child.ts:54-62 shows byte-identical bodies, and launchRequest() at :426-444 shares fakeSubagentLaunchRequest's exact key set/order; grep confirms 0 imports of either canonical helper in the two files (only call-with-clause-failure-arms.test.ts imports them) and `git log -S` pins both exports to 4d1c9e6a whose diffstat touches neither cited file; PTQ-0273 (fixed) explicitly excluded these two files as "pattern context ... not claimed as additional locations", so this is the unmigrated residual, not a re-file; no gate/recording-double/coverage-matrix carve-out applies (0 matrix hits, bug-doc witnesses untouched by a fixture-builder import); same-wave intake sibling qw20260917154546-d7-02-executable-probe-host-double-reimplemented.md overlaps on the host() half only — fold at acceptance (triage: claude-fable-5-1)
