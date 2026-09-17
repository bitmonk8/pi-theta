---
id: PTQ-0685
title: bothRungsFailHost() ExecutableHost double redeclared byte-for-byte in subagent-executable-refusal-e2e.test.ts and b0323-subagent-executable-probe-wrap.test.ts
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/subagent-executable-refusal-e2e.test.ts:41-49
  - tests/b0323-subagent-executable-probe-wrap.test.ts:70-77
  - tests/helpers/fake-json-child.ts:54-62
sites: 2
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
---

# bothRungsFailHost() ExecutableHost double redeclared byte-for-byte in subagent-executable-refusal-e2e.test.ts and b0323-subagent-executable-probe-wrap.test.ts

## Observation
`tests/subagent-executable-refusal-e2e.test.ts` declares a module-scope
`function bothRungsFailHost(): ExecutableHost` returning a fixed 6-line
object literal (`argv1: undefined`, `execPath: "/usr/bin/node"`,
`fileExists: () => false`, `isGenericRuntime: () => true`), used to drive the
"neither resolution rung yields a runnable child `pi`" refusal path. The
identical function — same name, same body, same inline comments — is
independently declared in `tests/b0323-subagent-executable-probe-wrap.test.ts`.
`tests/helpers/fake-json-child.ts` already exports an overridable
`ExecutableHost` double, `overridableExecutableHost(overrides?)`, built for
exactly this per-scenario variation.

## Evidence

tests/subagent-executable-refusal-e2e.test.ts:41-49 (re-read immediately
before filing):
```ts
/** An executable host whose BOTH resolution rungs fail (no runnable entry point). */
function bothRungsFailHost(): ExecutableHost {
  return {
    argv1: undefined, // rung 1: no entry script
    execPath: "/usr/bin/node", // rung 2: a generic runtime is not Pi itself
    fileExists: (): boolean => false,
    isGenericRuntime: (): boolean => true,
  };
}
```

tests/b0323-subagent-executable-probe-wrap.test.ts:70-77 — byte-identical:
```ts
/** A host whose BOTH resolution rungs fail cleanly (no throw, no runnable entry point). */
function bothRungsFailHost(): ExecutableHost {
  return {
    argv1: undefined, // rung 1: no entry script
    execPath: "/usr/bin/node", // rung 2: a generic runtime is not Pi itself
    fileExists: (): boolean => false,
    isGenericRuntime: (): boolean => true,
  };
}
```
The function body (the returned object literal, its inline comments included)
is character-for-character identical between the two files; only the
one-line doc comment immediately above the declaration differs
("BOTH resolution rungs fail" vs "BOTH resolution rungs fail cleanly (no
throw, ...)").

The existing overridable double, tests/helpers/fake-json-child.ts:54-62,
whose `overrides` parameter already lets a call site set exactly these four
fields without redeclaring the whole object:
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

Search performed: `grep -rn "function bothRungsFailHost" tests/*.test.ts` →
exactly these two files.

## Why this is a problem
Two independently-authored test files, one of them in this review's scope,
each redeclare the same 7-line `ExecutableHost` "both rungs fail" double
under the same name rather than importing or deriving it from the existing
overridable double in `tests/helpers/fake-json-child.ts`, which already
parameterises every field this double fixes.

## Suggested direction (non-binding, optional)
`tests/helpers/fake-json-child.ts`'s `overridableExecutableHost` (or a
sibling export named for the "no rung resolves" shape) names the existing
home this double already points toward; both `bothRungsFailHost()` copies ask
for the same four-field override.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate kin
  (closing-gate, cross-cutting-gates, rfc-*-spec-surface-gate,
  committed-fixture-parse-gate, registry-closed-set-corpus-gate).
- Recording-double check: `bothRungsFailHost()` returns a static object with
  no call recording and backs no "never called" MUST-NOT witness in either
  file; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: `grep -rl "bothRungsFailHost" docs/bugs/` → 0
  hits. No open bug document names this duplication or gives a documented
  correct-reason for a per-file copy.
- coverage-matrix/bug-doc citation search: `grep -n "bothRungsFailHost"
  docs/reference/coverage-matrix.md` → 0 hits. This finding proposes no
  change to any `it()`/`describe()` name or count, only to where the shared
  double is defined.
- Overlap check: `grep -rli "bothRungsFailHost" quality/intake/*.md
  quality/resolved/*.md` (excluding this file) → no hits; the sibling
  `resolvingHost()` duplication across these same files' neighbourhood is
  already filed separately (qw20260917154546-d7-02-resolvinghost-double-duplicated.md), which
  covers a different function with a different body — this finding is the
  distinct "both rungs fail" double, not a re-file of that one.
- Coverage check: the claim is about a repeated harness DEFINITION (one
  function), not a missing test path; both copies already back their own
  file's passing tests.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: confirmed — independently re-verified: `grep -rn "function bothRungsFailHost" tests/` → exactly the 2 cited files (refusal-e2e:41, b0323:71); both bodies extracted decl-to-brace and `diff`ed are byte-identical (8 lines, inline comments included), all three excerpts match verbatim at the cited lines, and both copies are live (callers refusal-e2e:116,127; b0323:198); neither file imports tests/helpers/fake-json-child.ts, whose overridableExecutableHost (:54-62) has zero importers outside its own helper and whose docstring names "both-rungs-fail" as its stated purpose, so the double is a four-field override of an existing helper; all locations under tests/, D7 copy-paste-double class, neither file matches a gate/live carve-out, no recording double, 0 hits in docs/bugs and coverage-matrix, no it()/describe() rename proposed, and no tracked PTQ or same-wave sibling names this double (d7-02 covers resolvingHost, shard-143's filing covers host(overrides) in subagent-executable-probe.test.ts — distinct functions) (triage: claude-fable-5-1)
