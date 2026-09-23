---
id: PTQ-1373
title: fake-json-child.ts declares three near-identical always-resolving ExecutableHost factories
lens: D7
status: open
verdict: confirmed
locations:
  - tests/helpers/fake-json-child.ts:38-45
  - tests/helpers/fake-json-child.ts:54-62
  - tests/helpers/fake-json-child.ts:330-337
sites: 3
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# fake-json-child.ts declares three near-identical always-resolving ExecutableHost factories

## Observation
`tests/helpers/fake-json-child.ts` exports three functions that each build an `ExecutableHost` fixture whose resolution ladder always resolves: `fakeExecutableHost()` (38-45), `overridableExecutableHost()` called with no overrides (54-62), and `resolvingHost()` (330-337). All three return the same four-field shape (`argv1`, `execPath: "/usr/bin/node"`, `fileExists: () => true`, `isGenericRuntime: () => false`/a matching regex that is false for `/usr/bin/node`), differing only in the literal `argv1` path string and, for `overridableExecutableHost`, an `isGenericRuntime` regex plus a spread-overrides tail. `resolvingHost()`'s body (330-337) is byte-identical to `overridableExecutableHost()` invoked with no arguments (54-62) except for its own docstring and the absence of the overrides parameter. Both `fakeExecutableHost` and `resolvingHost` are used, at different call sites across the suite, as the `subagentExecutableHost` fixture for the same purpose — a resolving host double — as shown by 20+ call sites across both names in `tests/*.test.ts`.

## Evidence
tests/helpers/fake-json-child.ts:38-45
```
export function fakeExecutableHost(): ExecutableHost {
  return {
    argv1: "/theta/entry.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

tests/helpers/fake-json-child.ts:54-62
```
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

tests/helpers/fake-json-child.ts:330-337
```
export function resolvingHost(): ExecutableHost {
  return {
    argv1: "/app/pi/dist/index.js",
    execPath: "/usr/bin/node",
    fileExists: (): boolean => true,
    isGenericRuntime: (): boolean => false,
  };
}
```

Search: `grep -rn "resolvingHost()\|fakeExecutableHost()\|overridableExecutableHost(" tests --include=*.ts` — 34 total hits; the three definitions above plus 31 call sites, including `fakeExecutableHost()` at (among others) `b0388-crossfile-fnbody-effect-undercount.test.ts:184`, `call-with-clause-threading.test.ts:161/182/206/240`, `helpers/parent-producer-harness.ts:97`, and `resolvingHost()` at `extension-tool-unreachable-load-refusal-e2e.test.ts:272`, `production-result-channel.test.ts:376/405/424/438`, `subagent-visible-regime.test.ts:430/469` — every call site supplies the same `subagentExecutableHost:` field with no distinguishing configuration, i.e. the two names are used interchangeably for the same fixture role.

## Why this is a problem
Three functions in one file build the same fixture shape (an `ExecutableHost` whose resolution ladder resolves at rung 1), with `resolvingHost()` and a no-overrides call to `overridableExecutableHost()` producing observably identical objects. A reader choosing which factory to call for a new test has three candidates whose only substantive difference is an unused-by-callers `argv1` literal, and the two literal-only variants (`fakeExecutableHost` / `resolvingHost`) are already used interchangeably across the suite for the same role, which is the duplication this file's own doc comment on `overridableExecutableHost` (49-52, "Distinct from `fakeExecutableHost()`... whose fixed shape only needs to resolve successfully") does not resolve, since `resolvingHost()` is that exact same fixed shape under a third name.

## Suggested direction (non-binding, optional)
The natural home for a single "always-resolving `ExecutableHost`" fixture is one factory in this file; naming it is an observation, not a design.

## False-positive check
Gate-pin check: not applicable — `fake-json-child.ts` is a helper module, not a `*gate*.test.ts` census file. Recording-double check: none of the three functions is a recording/negative-witness double; each is a plain value fixture. docs/bugs/ signature search: `grep -rl "fakeExecutableHost\|resolvingHost\|overridableExecutableHost" docs/bugs/` returned no hits, so no documented correct-reason red applies. coverage-matrix/bug-doc citation search: `grep -rn "fakeExecutableHost\|resolvingHost\|overridableExecutableHost" docs/reference/coverage-matrix.md docs/bugs/*.md` returned no hits — none of the three names is cited by name in a pinning document, so no merge/rename/delete disclosure is owed. All three functions are confirmed live via the call-site counts above, so this is duplication among existing, used code, not a coverage gap.

## Triage
verdict: confirmed — all three excerpts reproduce verbatim at tests/helpers/fake-json-child.ts:38-45, 54-62, 330-337; the search reproduces (34 hits = 3 declarations + 31 call sites across 21 files, all passing the result as `subagentExecutableHost`), no test outside the helper asserts either `argv1` literal (`grep "theta/entry.js\|app/pi/dist/index.js" tests` → only local `host({...})` overrides in subagent-child-launch/-probe/b0323), and `resolveSubagentExecutable` (src/runtime/subagent-launcher.ts:192-193) returns at rung 1 before consulting `isGenericRuntime`, so `fakeExecutableHost()`, `resolvingHost()` and a no-arg `overridableExecutableHost()` are observably interchangeable in the resolving role — the candidate's "byte-identical" wording is loose (the `isGenericRuntime` bodies differ) but the observable-equivalence claim holds; `resolvingHost` was hoisted into this helper by cc0a8fe7 (the PTQ-0570 fix) alongside the pre-existing `fakeExecutableHost` without merging, so this is the residue of that fix, not a duplicate of PTQ-0570 (eight per-file copies) nor of PTQ-0465 (fake-rpc-child copies) / PTQ-0685 (bothRungsFailHost); D7 copy-paste-fixture class, all locations under tests/, no gate/recording-double carve-out; correction for the record: docs/bugs/0452:117 does mention `fakeExecutableHost()` (the FP-check's "0 hits" is wrong) but only inside a repro-call description, not a witness-list pin, and no test rename/merge/delete is proposed; note for the fixer: `overridableExecutableHost` is the parameterised base with its own ladder-variation callers — the mechanical dedupe is the fixed pair (`fakeExecutableHost`/`resolvingHost`), optionally expressed as no-arg calls of the base (triage: claude-fable-5-1)
