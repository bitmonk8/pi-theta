---
id: PTQ-0045
title: "The `SubagentChildProcess` type import in production-theta-producer.ts is referenced nowhere in the module"
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:35
sites: 1
fix_scope: localized
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The `SubagentChildProcess` type import in production-theta-producer.ts is referenced nowhere in the module

## Observation

Line 35 imports the `SubagentChildProcess` type from
`../runtime/subagent-launcher`. No declaration, annotation, or expression in
the module references it; the child handle returned by `launchSubagentChild` is
consumed via inference (`launch.child`) and passed to `attachSubagentCancellation`
/ `runSubagentChildTeardown` without an explicit annotation.

## Evidence

src/extension/production-theta-producer.ts:35:

```ts
import type { SubagentChildProcess } from "../runtime/subagent-launcher";
```

`grep -n "SubagentChildProcess" src/extension/production-theta-producer.ts`
yields exactly 1 hit — the import line itself.

`tsc --noEmit --noUnusedLocals --noUnusedParameters` confirms:

```
src/extension/production-theta-producer.ts(35,1): error TS6133: 'SubagentChildProcess' is declared but its value is never read.
```

Commit `4866d4d2` ("feat: child-process theta execution (RFC 0006) — v0.9.0")
deleted the last two annotations in this file that used the type:

```
-  readonly child: SubagentChildProcess;
-  readonly #child: SubagentChildProcess;
```

## Why this is a problem

Dead code, proven dead: an import statement whose imported name has zero uses
in the module. The project's tsconfig does not enable `noUnusedLocals` and
eslint.config.js enables only the three `theta-local` rules, so nothing flags
it in CI; it survives as leftover scaffolding from the RFC-0006 rework that
removed the annotated fields, and it falsely suggests to a reader that this
module handles the raw child-process type directly.

## Suggested direction (non-binding, optional)

Remove the import line. The type stays alive at its real consumers
(`src/extension/production-subagent-host.ts`, `src/runtime/subagent-isolation.ts`,
`src/runtime/subagent-launcher.ts`).

## False-positive check

- `grep -n "SubagentChildProcess" src/extension/production-theta-producer.ts`:
  only line 35 (the import). A type import admits no string-keyed or dynamic
  access; nothing re-exports it from this module.
- Repo-wide grep: the type is used in src/runtime/subagent-isolation.ts,
  src/extension/production-subagent-host.ts, and its declaring module — only
  the local import in this file is claimed unused.
- Tests: no test imports `SubagentChildProcess` through this module.
- Git intent: `git log -S "SubagentChildProcess" -- src/extension/production-theta-producer.ts`
  shows commit 4866d4d2 removed the `child` / `#child` field annotations that
  were the import's last users; no later commit reintroduced a use.
- Compiler confirmation: TS6133 at 35,1 under `--noUnusedLocals` (flag not part
  of the repo build, which is why it survives).

## Triage
verdict: confirmed — line 35 import verified verbatim; my own grep finds exactly 1 hit (the import) in the module, tsc --noUnusedLocals reproduces TS6133 at (35,1), and 4866d4d2 shows the two `SubagentChildProcess` field annotations removed while the import survived as context (triage: claude-opus-5)

