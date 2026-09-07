---
id: pending
title: The module header says the producer composes three injected collaborators and spawns an isolated AgentSession for subagent mode, while ThetaProducerDeps has nine members and the subagent bind launches a child pi process
lens: D2
status: intake
verdict: pending
locations:
  - src/extension/production-theta-producer.ts:1-15
  - src/extension/production-theta-producer.ts:29-32
  - src/extension/production-theta-producer.ts:2241-2249
  - src/extension/theta-composition-producer.ts:318-400
sites: 2
fix_scope: localized
wave: qw20260907202646
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# The module header says the producer composes three injected collaborators and spawns an isolated AgentSession for subagent mode, while ThetaProducerDeps has nine members and the subagent bind launches a child pi process

## Observation
The file's opening header is the orientation text for an 8471-line module. It
makes two structural claims: that `composeThetaFixture` composes "three
injected collaborators", which it then lists; and that
`spawnSubagentConversation` "spawn[s] an isolated `AgentSession` (`V9i`) and
bind[s] the executor to that private session for subagent-mode thetas". The
interface this file implements, `ThetaProducerDeps`, declares nine members, and
`composeThetaFixture` calls seven of them beyond the three listed. The RFC-0006
rework replaced the in-process `AgentSession` subagent spawn with a child `pi`
process — a retirement the same file records twenty lines later and again on
`spawnSubagentConversation` itself.

## Evidence
src/extension/production-theta-producer.ts:1-15 — the header:

```ts
// H8a — the production `ThetaProducerDeps` for the shipped composition root.
//
// The `V19e` composition producer (`composeThetaFixture`) maps a parsed `.theta`
// to a runnable `ThetaFixture` by composing three injected collaborators:
//
//   - `runBinder` — the `V11a` frontmatter binder over the slash arguments,
//     run before the theta interpreter; a non-binding envelope short-circuits;
//   - `bindPromptConversation` — bind `V19d`'s effectful executor to the shared
//     user session (`V12a`/`V9c`) so `@`-queries drive real user-visible turns;
//   - `spawnSubagentConversation` — spawn an isolated `AgentSession` (`V9i`) and
//     bind the executor to that private session for subagent-mode thetas.
//
// This module assembles those collaborators against the live host `pi` surface
// and the runtime root's seams, so the shipped extension drives real
// prompt-mode / typed / subagent turns.
```

src/extension/theta-composition-producer.ts:318-400 — `ThetaProducerDeps`
declares nine members: `runBinder`, `beginInvocation?`,
`bindPromptConversation`, `spawnSubagentConversation`, `isSubagentRootFor?`,
`driveSubagentRootRegime?`, `emitTopLevelErrNote`, `emitPanicNote`,
`schemaValidator?`. `grep -n "deps\.\(runBinder\|beginInvocation\|
bindPromptConversation\|spawnSubagentConversation\|isSubagentRootFor\|
driveSubagentRootRegime\|emitTopLevelErrNote\|emitPanicNote\|schemaValidator\)"
src/extension/theta-composition-producer.ts` returns ten call sites covering
all nine members (457 `beginInvocation`, 482/483/486 `driveSubagentRootRegime`
+ `isSubagentRootFor`, 514 `runBinder`, 527 `schemaValidator`, 538/539
`spawnSubagentConversation` + `bindPromptConversation`, 581
`emitTopLevelErrNote`, 649/672 `emitPanicNote`). `ProductionThetaProducer`
implements all nine (`runBinder` 900, `beginInvocation` 1982,
`bindPromptConversation` 2035, `spawnSubagentConversation` 2257,
`isSubagentRootFor` 2796, `driveSubagentRootRegime` 2815, `emitTopLevelErrNote`
1706, `emitPanicNote` 1777, `schemaValidator` 896).

src/extension/production-theta-producer.ts:29-32 — the same file, seventeen
lines below the header, records the retirement the third bullet still asserts:

```ts
// RFC-0005: `buildSessionContext` remains for the prompt-mode drive; the former
// in-process subagent satellites (`createAgentSession` / `DefaultResourceLoader`
// / `SessionManager` / `getAgentDir` / `defineTool`) are retired — the subagent
// drive spawns a child `pi` process (subagent.md, RFC-0005).
```

src/extension/production-theta-producer.ts:2241-2249 — and so does the method
the bullet names:

```ts
  /**
   * RFC-0006 (PIC-58/59/60/62/63). Parent-side subagent-mode binding. Under this
   * RFC the WHOLE callee runs in a spawned child `pi --theta … --mode json -p
   * "/<slug>" --no-session` process; the parent no longer drives a remote
   * session. The returned binding's `drive()` (PIC-59) launches the child,
   * marshals params structurally (PIC-60), awaits the single `theta_result`
   * stdout envelope, and maps `ok`/`err` to `Ok`/`Err` — the parent runs no
   * per-query extraction and never executes the callee body in-process. The
   * legacy RFC-0005 RPC drive is retired (deleted, not a fallback).
```

## Why this is a problem
Historical narration at the one place a reader starts. The header states a
closed count ("three injected collaborators") that the interface it names
contradicts by six members — including the two RFC-0006 members
(`isSubagentRootFor`, `driveSubagentRootRegime`) whose whole point is that a
subagent-root child takes a different route through `composeThetaFixture`,
which is exactly the routing a reader consults the header to learn. Its third
bullet describes a mechanism (`createAgentSession`-backed in-process
`AgentSession`) that the same file twice records as deleted. `git blame` puts
the header lines at `3a8732da` (2026-07-02) and `2bc69157` (2026-07-19, the
Loom→Theta rename); RFC-0006's child-process rework is `4866d4d2`
(2026-07-24), `beginInvocation` is `d62be25e` (2026-08-20). Every contradicting
change post-dates the header text.

## Suggested direction (non-binding, optional)
Bring the header's collaborator roster and the subagent bullet into agreement
with `ThetaProducerDeps` as it stands, or replace the enumeration with a
pointer to the interface so it cannot drift again.

## False-positive check
- Counted `ThetaProducerDeps`' members by reading the interface body
  (`theta-composition-producer.ts:318-400`): nine, listed above. Confirmed the
  producer implements each by grepping this file for the member names as class
  members (all nine found at the lines cited).
- Confirmed the seven unlisted members are actually exercised by
  `composeThetaFixture`, not merely declared: the `deps.<member>` grep above
  returns a call site for each.
- Confirmed the `AgentSession` claim is retired, not merely relocated:
  `grep -rn "createAgentSession" --include=*.ts src` returns no hit in this
  file's imports (line 33 imports only `buildSessionContext`), and
  `spawnSubagentConversation`'s body launches through `launchSubagentChild`
  (2585) rather than any session-construction API.
- Checked already-filed intake for this file: the standing findings cover
  line-citation drift (qw20260907183353-d2-01-producer-line-citations-drifted),
  three detached doc comments (qw20260907130901-d2-06-detached-doc-comments),
  two "test thetas" comments (qw20260907130901-d2-07-test-theta-era-narration-
  stale), and the RFC-0005 adapter satellites
  (qw20260907130901-d2-04-rfc0005-theta-adapter-satellites-dead) — none cites
  lines 1-15.
- Not dead code: the header annotates a live module; only the narration is
  claimed stale. No behaviour claim is made.
- Git intent: `git blame -L 1,20` → `3a8732da` (2026-07-02, "H8a — Live
  production composition wiring and end-to-end acceptance") and `2bc69157`
  (2026-07-19, "Rename Loom -> Theta across the corpus"); the contradicting
  commits are `4866d4d2` (2026-07-24) and `d62be25e` (2026-08-20). Drift, not
  a deliberate scoping statement.

## Triage
