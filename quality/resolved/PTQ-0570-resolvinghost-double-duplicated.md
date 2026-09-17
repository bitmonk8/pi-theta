---
id: PTQ-0570
title: extension-tool-unreachable-load-refusal-e2e.test.ts redeclares the identical resolvingHost() ExecutableHost double duplicated across seven other files
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/extension-tool-unreachable-load-refusal-e2e.test.ts:211-218
  - tests/production-result-channel.test.ts:376-383
  - tests/subagent-executable-refusal-e2e.test.ts:51-58
  - tests/subagent-fn-extension-tool-dispatch-e2e.test.ts:235-242
  - tests/subagent-placement-load-refusal.test.ts:81-88
  - tests/subagent-result-channel-factory.test.ts:23-30
  - tests/subagent-root-registration-refusal-envelope.test.ts:184-191
  - tests/subagent-visible-regime.test.ts:454-461
  - tests/helpers/fake-json-child.ts:54-60
sites: 8                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# extension-tool-unreachable-load-refusal-e2e.test.ts redeclares the identical resolvingHost() ExecutableHost double duplicated across seven other files

## Observation
tests/extension-tool-unreachable-load-refusal-e2e.test.ts declares a
module-scope `resolvingHost(): ExecutableHost` function returning a fixed
7-line object literal (`argv1`, `execPath`, `fileExists`, `isGenericRuntime`).
The identical function — same name, same body, same field values, character
for character — is independently declared in seven other test files.
tests/helpers/fake-json-child.ts already exports an `ExecutableHost` double
family for this exact purpose: `fakeExecutableHost()` (a fixed
always-resolves shape) and `overridableExecutableHost(overrides?)`, whose
default `argv1`/`execPath`/`fileExists` values are identical to
`resolvingHost()`'s and which accepts an `isGenericRuntime` override to
reproduce `resolvingHost()`'s constant-`false` behaviour exactly.

## Evidence
tests/extension-tool-unreachable-load-refusal-e2e.test.ts:211-218
```ts
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

tests/production-result-channel.test.ts:376-383 (byte-identical):
```ts
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

tests/subagent-result-channel-factory.test.ts:23-30 (byte-identical):
```ts
function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

The existing overridable double, tests/helpers/fake-json-child.ts:54-60,
whose default field values already match the three fixed fields above and
which accepts an `isGenericRuntime` override for the fourth:
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

Pattern-wide search: `grep -rl "function resolvingHost" tests/*.test.ts` → 8
files: tests/extension-tool-unreachable-load-refusal-e2e.test.ts,
tests/production-result-channel.test.ts,
tests/subagent-executable-refusal-e2e.test.ts,
tests/subagent-fn-extension-tool-dispatch-e2e.test.ts,
tests/subagent-placement-load-refusal.test.ts,
tests/subagent-result-channel-factory.test.ts,
tests/subagent-root-registration-refusal-envelope.test.ts,
tests/subagent-visible-regime.test.ts. Each declaration's body was diffed
against the excerpt above and is character-for-character identical.

## Why this is a problem
Eight independently-authored test files, including the one in this review's
scope, each redeclare the same 7-line `ExecutableHost` double under the same
name rather than importing one. `tests/helpers/fake-json-child.ts` already
exports a double family built for exactly this need
(`fakeExecutableHost()` / `overridableExecutableHost()`), and its
`overridableExecutableHost()` default already reproduces three of
`resolvingHost()`'s four fields verbatim, taking the fourth
(`isGenericRuntime`) as a parameter precisely so call sites do not need to
redeclare the whole object to vary one field.

## Suggested direction (non-binding, optional)
tests/helpers/fake-json-child.ts's `overridableExecutableHost` (or a like
override of `fakeExecutableHost`) names the existing home for this double;
each of the eight `resolvingHost()` copies asks for the same
"rung 1 always resolves, host is not a generic runtime" shape.

## False-positive check
- Gate-pin: none of the eight files match `*gate*.test.ts` or the named kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double: `resolvingHost()` returns a static object with no call
  recording and backs no "never called" assertion, so the negative-witness
  carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "resolvingHost" docs/bugs/` → 0 hits.
  No open bug document names this duplication or gives a documented
  correct-reason for keeping a per-file copy.
- coverage-matrix/bug-doc citation search: `grep -n "resolvingHost"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name or count, only to where the shared
  double is defined.
- Coverage check: the claim is about a repeated harness DEFINITION (one
  function), not a missing test path; every copy already backs its own
  file's tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -rl "function resolvingHost"` across src/extensions/tools/tests → exactly the 8 cited test files, each body extracted at the cited line and `diff`ed against the first is byte-identical; none of the 8 imports tests/helpers/fake-json-child.ts, whose overridableExecutableHost (:54-60) matches argv1/execPath/fileExists verbatim and takes Partial<ExecutableHost> so the load-bearing `isGenericRuntime: () => false` (the helper's default regex returns true for "/usr/bin/node") is a one-field override; the helper landed 4d1c9e6a (2026-09-12) yet four copies (97e4ef27, 4ec891b9, ef706748, 2026-09-15) were authored after it, so this is live drift not pre-helper residue; all locations under tests/, D7 copy-paste-fixture class, no gate/recording-double carve-out, 0 hits in docs/bugs and coverage-matrix, and no tracked PTQ or same-wave sibling names resolvingHost (siblings cover host(overrides), bothRungsFailHost, fakeExecutableHost/enoentSpawnError — distinct doubles) (triage: claude-fable-5-1)
