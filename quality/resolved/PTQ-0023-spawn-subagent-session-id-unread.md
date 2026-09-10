---
id: PTQ-0023
title: spawnSubagentSession fabricates a session-id return string that no caller in the repository ever reads
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/effectful-statement-host.ts:632-648
  - src/runtime/statement-executor.ts:173
  - src/runtime/statement-executor.ts:612
sites: 3                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# spawnSubagentSession fabricates a session-id return string that no caller in the repository ever reads

## Observation
`StatementEvalHost.spawnSubagentSession` is typed to return a session id
(`string | Promise<string>`), and the production implementation in
`createEffectfulStatementHost` fabricates one (`subagent-fn-${sessions.length}`)
after pushing the session onto its internal stack. The only production call
site awaits the method and discards the result. No map, registry, log, or
teardown path stores or looks up the id — `exitSubagentSession` takes no
argument and pops the stack LIFO. The test fakes that implement the method also
return ids, but every test observation goes through the fakes' own recorded
state, never through the returned value.

## Evidence
src/runtime/effectful-statement-host.ts:632, 644-648 — the id is minted for
nobody:
```ts
      async spawnSubagentSession(config: SubagentSessionConfig, chain?: InvokeChain): Promise<string> {
        ...
        const seam = active().spawnSubagentFnSession ?? baseDeps.spawnSubagentFnSession!;
        const session = await seam(config, chain);
        sessions.push(session);
        return `subagent-fn-${sessions.length}`;
      },
```

src/runtime/statement-executor.ts:173 — the interface pins the string return
(and :174 shows the paired exit takes no id):
```ts
  spawnSubagentSession?(config: SubagentSessionConfig, chain?: InvokeChain): string | Promise<string>;
  exitSubagentSession?(): void | Promise<void>;
```

src/runtime/statement-executor.ts:612 — the sole production call site discards
the value:
```ts
    await deps.host.spawnSubagentSession?.(fn.sessionConfig ?? {}, deps.invokeChain);
```

Search evidence: `grep -rn spawnSubagentSession` over the whole repository
returns exactly: the interface (statement-executor.ts:173), the production call
(statement-executor.ts:612), the production implementation
(effectful-statement-host.ts:632), comments, and test sites —
tests/subagent-fn.test.ts:809 (fake implementation that records the id in its
own `spawnedSessions` array before returning it), tests/subagent-fn.test.ts:1528-1543
(`await spawn({})` in a loop, result discarded), and
tests/b0295-child-internal-cancel-wrap-arm.test.ts:540-543 (fake returning a
fixed `"subagent-fn-1"`, test asserts on its own `spawned` counter). No site in
src/, extensions/, tools/, or tests/ binds the returned value.

## Why this is a problem
Vestigial return value: the id contract is dead on both ends. The producer
(effectful-statement-host.ts:647) computes a synthetic string no data structure
retains, and the sole consumer (statement-executor.ts:612) throws it away; even
the doc comment's stated purpose ("returning its id",
statement-executor.ts:165) has no mechanism behind it — session teardown is
positional (`exitSubagentSession()` pops LIFO, statement-executor.ts:174,
effectful-statement-host.ts:649-653), so an id can never be used to address a
session. Every implementer of the interface (one production, two test fakes) is
forced to invent a string to satisfy a return type nothing observes.

## Suggested direction (non-binding, optional)
Narrow the interface's return to `void | Promise<void>` and drop the fabricated
string in `createEffectfulStatementHost` (test fakes keep recording their own
ids internally, which is all the tests read today) — or, if per-session
addressing is genuinely planned, land the consumer with it.

## False-positive check
- Reference search: `grep -rn spawnSubagentSession` across src/, extensions/,
  tools/, tests/ — all 10 hits enumerated above; none assigns or reads the
  return value (`grep -rn "= await .*spawnSubagentSession\|= .*spawnSubagentSession"`
  — 0 hits).
- Dynamic access: `grep -rn "\"spawnSubagentSession\"\|\['spawnSubagentSession'\]"`
  — 0 hits.
- Test-only-caller check: the method itself is production-reachable
  (statement-executor.ts:612); the claim is confined to the unread return
  value, not the method. Tests that appear to consume ids
  (tests/subagent-fn.test.ts asserting `spawnedSessions[].id`) read the fake's
  own recorded array, not the value returned across the interface — verified by
  reading tests/subagent-fn.test.ts:780-830 and :1528-1543.
- Intent check: the RFC 0001 hook comment (statement-executor.ts:163-172) and
  the tests' documented obligation (tests/subagent-fn.test.ts:732-735) describe
  "returning its id" with no consumer described or implemented anywhere;
  `exitSubagentSession` never took an id.

## Triage
verdict: confirmed — re-verified: excerpts match at effectful-statement-host.ts:632/644-648 and statement-executor.ts:173/612; my own grep (15 hits in src/tests, 0 in extensions/tools) finds no site binding the return, no string-keyed/dynamic access, `SubagentFnSession` carries no id and teardown is positional LIFO, and `git log -S` shows the string has had no consumer since the RFC 0001 impl commit — a genuinely vestigial production return value (candidate's "10 hits" count is the only inaccuracy, immaterial) (triage: claude-opus-5)
