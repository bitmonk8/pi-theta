---
id: PTQ-0172
title: SubagentChildProcess.pid is a required handle member written by every adapter and fake but read by nothing in src/, extensions/, tools/ or tests/
lens: D2                     # the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/runtime/subagent-launcher.ts:521-523
  - src/extension/production-subagent-host.ts:382-383
  - tests/helpers/fake-json-child.ts:74-88
  - tests/helpers/fake-rpc-child.ts:97-120
  - tests/subagent-isolation.test.ts:160
  - tests/subagent-isolation.test.ts:193
  - tests/subagent-json-driver.test.ts:235
sites: 7                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# SubagentChildProcess.pid is a required handle member written by every adapter and fake but read by nothing in src/, extensions/, tools/ or tests/

## Observation
`SubagentChildProcess` (src/runtime/subagent-launcher.ts) is the spawned-child
handle the subagent drive consumes. Its first member, `readonly pid: number |
undefined`, is populated by the production adapter (`adaptChild` copies the
Node child's pid onto it) and by every test fake (two helper classes assign a
counter; three inline object literals assign a constant). No consumer of the
handle — the isolation/teardown seam, the JSON driver, the execution-status
child tap, or any test — reads `.pid` off a `SubagentChildProcess`. The one
production read of a child pid (`kill`'s Windows `taskkill` path) reads the raw
Node `child.pid` captured in the adapter's closure, not the handle member.

## Evidence
src/runtime/subagent-launcher.ts:521-523 — the member:

```ts
export interface SubagentChildProcess {
  /** The OS process id, or `undefined` if the spawn has not assigned one. */
  readonly pid: number | undefined;
```

src/extension/production-subagent-host.ts:382-383 — the production adapter
writes it (and, at :403, reads the raw Node child's pid for `taskkill`, never
the handle's):

```ts
  return {
    pid: child.pid,
```

```ts
    kill: (): void => {
      const pid = child.pid;
```

tests/helpers/fake-json-child.ts:74-88 (and tests/helpers/fake-rpc-child.ts:97-120,
same shape):

```ts
export class FakeJsonChild implements SubagentChildProcess {
  readonly pid: number | undefined;
  ...
  constructor(options: FakeJsonChildOptions = {}) {
    this.pid = nextFakePid++;
```

Inline fakes: tests/subagent-isolation.test.ts:160 `pid: 9,`, :193 `pid: 11,`;
tests/subagent-json-driver.test.ts:235 `pid: 1,`.

Reader search (all `*.ts` under src/, extensions/, tools/, tests/):
- `grep -rn -E "\.pid\b" src extensions tools` → 3 hits outside the interface:
  production-subagent-host.ts:383 (write), :403 (raw Node `child.pid`, the
  `NodeChildLike` parameter at :299-300, not the handle), and :217
  `process.pid`. Zero reads of `SubagentChildProcess.pid`.
- `grep -rn -E "\.pid\b" tests | grep -v process.pid` → only the two
  `this.pid = nextFakePid++` writes above.
- Destructuring / string-keyed / dynamic: `grep -rn -E "\{[^}]*\bpid\b[^}]*\}\s*="`,
  `grep -rn -E "\"pid\"|'pid'|keyof SubagentChildProcess"` over the same
  roots → 0 hits.
- The handle's src consumers read only other members: subagent-isolation.ts:218
  `closeStdin()`, :200 `onExit`, :264 `kill()`; subagent-json-driver.ts:158/162
  `onStderrLine`/`onStdoutLine`, :284 `onExit`, :361 `kill()`;
  child-tap.ts:59 `Pick<SubagentChildProcess, "onStdoutLine">`.

## Why this is a problem
Write-only field: a required interface member that every implementer (one
production adapter, five fakes) must supply and that no reader anywhere
consumes is dead data on the seam. `git log -S "readonly pid: number |
undefined;"` shows it landed with the handle in fda23a4b (RFC 0005, v0.8.0)
and `git show fda23a4b | grep "\.pid"` shows the same three writes and zero
handle reads at introduction, so it has never had a reader. The spec does not
require it: subagent.md's pid references (:36, :92, :233, :266) are all the
`PI_THETA_SUBAGENT_PARENT_PID` env carriage, a separate mechanism already
covered by `SUBAGENT_PARENT_PID_ENV`, and neither subagent.md nor the RFC
mentions a pid on the child handle.

## Suggested direction (non-binding, optional)
Drop the member from the handle and from its six implementers; if a future
consumer (e.g. the recorded-but-unimplemented parent-PID watchdog) needs the
child pid, it can be reintroduced alongside its reader.

## False-positive check
- Identifier search across src/, extensions/, tools/, tests/ for `.pid` member
  reads (results above): zero reads of the handle member; the only pid read in
  production is the raw `NodeChildLike.pid` inside `adaptChild`'s closure.
- String-keyed / dynamic access and destructuring searches: 0 hits.
- Re-exports: `grep -rn "export \*" src extensions tools tests` → 0 hits; the
  interface is imported only by name (list above).
- Tests-only callers: none — no test reads `.pid` either, so this is not the
  protected test-only-reachable case; tests only WRITE the field to satisfy
  the interface.
- Spec check: docs/spec_topics/pi-integration-contract/subagent.md pid mentions
  (:36, :92, :233, :266) all concern the env carriage, not the handle.
- Git intent: fda23a4b introduced the field with no reader; no later commit
  added or removed a `child.pid` read (`git log -S "child.pid" -- src tests`
  → fda23a4b only).

## Triage
verdict: confirmed — every excerpt byte-matches at its cited line (interface :521-523; adapter write :383 and raw `NodeChildLike.pid` read :403, that param type declaring `pid?` at :300; FakeJsonChild :75/:88, FakeRpcChild :98/:120; inline fakes :160/:193/:235) and my own hunt over src/, extensions/, tools/, tests/ for `\.pid\b`, bare `pid`, `"pid"`/`'pid'`, `keyof`/`Pick`/indexed access, destructuring and `export *` finds zero reads of the handle member (the only type-level projection is child-tap.ts:59 `Pick<SubagentChildProcess,"onStdoutLine">`; `nextFakePid` is module-local and never read; the b0294/b0347/b0468 importers construct the two helper classes, so exactly six implementers exist); fda23a4b introduced it with zero handle reads and `git log -S "child.pid"` returns only that commit; subagent.md's pid mentions (:36/:92/:101/:233/:266) and every RFC concern only the parent-PID env carriage; tests only WRITE the field to satisfy the required member, so the test-only-caller protection does not apply; no existing PTQ covers the handle's pid (PTQ-0045 is an unused type import in another module, PTQ-0033 is stale env-carriage narration) (triage: claude-opus-5)
