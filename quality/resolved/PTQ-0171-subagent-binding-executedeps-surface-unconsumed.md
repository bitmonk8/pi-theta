---
id: PTQ-0171
title: spawnSubagentConversation builds a full in-process EffectfulStatementHost and ExecuteBodyDeps and a surface projection for a binding whose two consumers both take the unconditionally-present drive() first, so executeDeps and surface on the subagent binding are constructed and never read
lens: D2
status: fixed
verdict: confirmed
locations:
  - src/extension/production-theta-producer.ts:2452-2455
  - src/extension/production-theta-producer.ts:2482-2515
  - src/extension/production-theta-producer.ts:2517-2540
  - src/extension/production-theta-producer.ts:2750-2769
  - src/extension/production-theta-producer.ts:4485-4491
  - src/extension/theta-composition-producer.ts:254-255
  - src/extension/theta-composition-producer.ts:571-575
sites: 6
fix_scope: cross-module
wave: qw20260910054544
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-10
---

# spawnSubagentConversation builds a full in-process EffectfulStatementHost and ExecuteBodyDeps and a surface projection for a binding whose two consumers both take the unconditionally-present drive() first, so executeDeps and surface on the subagent binding are constructed and never read

## Observation
`spawnSubagentConversation` (the RFC-0006 parent-side subagent binding)
constructs an eight-resolver `EffectfulStatementHostDeps` object, wraps it with
`createEffectfulStatementHost`, builds a bound `LexicalEnvironment` with
`buildBoundEnvironment`, assembles an `ExecuteBodyDeps`, and returns it as
`executeDeps` alongside a `surface` projection. The same return carries `drive`
unconditionally. Every consumer of a `ConversationBinding` — `composeThetaFixture.run`
and `#driveCallee` — tests `binding.drive !== undefined` first and calls
`drive()`; `executeBody(…, binding.executeDeps)` and `binding.surface(…)` run
only on the `drive === undefined` arm, which the subagent binding never takes.
The block header names its purpose as "backing `executeDeps.host`"; the return's
member comments describe "the in-process `subagent fn` path" as the consumer,
but `#spawnSubagentFnSession` builds its own `hostDeps` and does not call
`spawnSubagentConversation`.

## Evidence
src/extension/production-theta-producer.ts:2452-2455 — the block header:

```ts
    // ---- IN-PROCESS host backing `executeDeps.host` ----
    // Queries resolve via `#resolvePromptQuery(..., userVisible: false)` — a
    // private `complete()` conversation, never the caller's. The file-callee
    // path (below) uses `drive()` and never runs the body in-process.
```

src/extension/production-theta-producer.ts:2482-2489 (the 34-line `hostDeps`
literal opens; its eight resolver closures run through :2515):

```ts
    const hostDeps: EffectfulStatementHostDeps = {
      checkpoint,
      signal,
      sink: noopSink(),
      file: theta.slashName,
      evaluatePure: (expr, env, overrideChain) => evaluatePureExpression(expr, env, overrideChain ?? chain),
      // Bug 0388: `overrideChain` (present only for a dispatch nested inside a
      // cross-file `.thetalib` fn body) takes priority over the bind-level
```

src/extension/production-theta-producer.ts:2517-2528 — the `ExecuteBodyDeps`
assembly that consumes `hostDeps`:

```ts
    const executeDeps: ExecuteBodyDeps = {
      env: buildBoundEnvironment(
        theta.body,
        bindInput.paramBindings,
        theta.imports,
        presentedCallableNames(theta),
        theta.sourcePath,
      ),
      host: createEffectfulStatementHost(hostDeps),
      checkpoint,
      signal,
      mutator: new NoopConversationMutator(),
```

src/extension/production-theta-producer.ts:2750-2769 — the return: `drive` is
unconditional; `executeDeps` and `surface` ride beside it, with comments naming
"the in-process `subagent fn` path" as their consumer:

```ts
    return {
      drivenAgainst: "subagent-private-session",
      executeDeps,
      drive,
      // Bug 0342 §Fix: hands the subagent leg's per-position declaring-enum
      // tags (captured by `drive()`, above) to `#validateInvokeReturn`'s
      // invoke-return retag. Undefined on the in-process `subagent fn` path,
      // which never calls `drive()`.
      forwardedEnumTags: (): readonly EnumTagEntry[] | undefined => forwardedEnumTagsHolder,
```

```ts
      // FN-5: on the in-process `subagent fn` path the caller's executor runs the
      // inline body against the spawned session's own host deps, then surfaces the
      // body's terminal final value the same way the file-callee `drive()` maps
      // its envelope.
      surface: (execution: BodyExecution): ResultValue =>
        surfaceCalleeFinalValue(execution),
```

Consumer 1 — src/extension/production-theta-producer.ts:4485-4491 (`#driveCallee`,
immediately after `const binding = await this.spawnSubagentConversation({…})` at
:4449):

```ts
      if (binding.drive !== undefined) {
        result = await binding.drive();
        bodySource = binding.driveSource?.() ?? "callee-returned";
      } else {
        result = binding.surface(await executeBody(callee.body, binding.executeDeps));
        bodySource = "callee-returned";
      }
```

Consumer 2 — src/extension/theta-composition-producer.ts:571-575
(`composeThetaFixture.run`, where `binding` is
`theta.frontmatter.mode === "subagent" ? await deps.spawnSubagentConversation(bindInput) : deps.bindPromptConversation(bindInput)`):

```ts
            if (binding.drive !== undefined) {
              return binding.drive();
            }
            execution = await executeBody(theta.body, binding.executeDeps);
            return binding.surface(execution);
```

The interface that forces the construction — src/extension/theta-composition-producer.ts:254-255:

```ts
  readonly executeDeps: ExecuteBodyDeps;
  surface(execution: BodyExecution): ResultValue;
```

Call-site census. `grep -n "this.spawnSubagentConversation(\|this.bindPromptConversation("
src/extension/production-theta-producer.ts` → 3 hits: :2965 and :4373 are
`bindPromptConversation`; :4449 is the sole in-file `spawnSubagentConversation`
call (consumer 1 above). `grep -rn "spawnSubagentConversation" src/` outside
this file: theta-composition-producer.ts (interface + consumer 2), and
comment-only mentions in production-composition.ts:2418,
effectful-statement-host.ts:655, subagent-isolation.ts:95. `#spawnSubagentFnSession`
(:3072-3232) builds its own `hostDeps` at :3175 and returns `{ deps: hostDeps,
dispose }`; it contains no `spawnSubagentConversation` call.

## Why this is a problem
Dead construction. The subagent binding's `executeDeps` (a bound environment, a
statement host over eight resolver closures, a `NoopConversationMutator`, the
`statusLanes` adapter) and its `surface` are built on every parent-side
subagent bind and every nested subagent `invoke`, and no code path reads
either: both consumers of a `ConversationBinding` branch on `drive !== undefined`
first, and this binding's `drive` is a plain unconditional member (:2753). The
retained block is the residue of two removals. Commit 4866d4d2 (RFC 0006) made
`drive` unconditional and rewrote `#spawnSubagentFnSession` to stop calling
`spawnSubagentConversation` (its diff removes `const binding = await
this.spawnSubagentConversation({ theta: overriddenTheta, …` from that method),
leaving the in-process host behind under the header "IN-PROCESS host for the
RFC-0001 `subagent fn` inline-body path … `#spawnSubagentFnSession` consumes
this `effectHostDeps`". Commit 4f2db584 (the PTQ-0108 fix) then removed the
unread `effectHostDeps` field and rewrote that header to the current "IN-PROCESS
host backing `executeDeps.host`" — re-justifying the block against a field that
is itself unread on this binding. The two member comments at :2754-2757 and
:2764-2767 still narrate "the in-process `subagent fn` path" as this binding's
consumer, a path that has not touched this binding since 4866d4d2. The
`ConversationBinding` interface's required `executeDeps` / `surface` (:254-255)
is what compels the construction on a binding that, by the same interface's own
`drive` doc (:256-266), "resolves the invocation's `Result` WITHOUT the drive
seam running `executeBody` against `executeDeps`".

## Suggested direction (non-binding, optional)
The seam already has a shape for "self-contained drive" versus "body-executing"
bindings (`drive?`); making `executeDeps`/`surface` conditional on the absence of
`drive` (or splitting the binding type along that line) would let the subagent
bind stop constructing an in-process host it never runs, and the two member
comments could then describe the members that remain. The fix stage owns the
shape.

## False-positive check
- Consumers of the subagent binding: the only production reads of
  `.executeDeps` / `.surface(` on a binding are theta-composition-producer.ts:574-575
  and production-theta-producer.ts:4489 (plus :2967 `executeBody(theta.body,
  binding.executeDeps)` in `driveSubagentRootRegime`, whose `binding` is
  `this.bindPromptConversation(rootBindInput)` at :2965 — a prompt binding, not
  this one). Both subagent-binding reads sit on the `drive === undefined` arm.
- Tests as callers: `grep -rn "spawnSubagentConversation(" tests/` → 30 direct
  calls across b0328, b0343, b0422, call-with-clause-threading,
  production-subagent-query-model, subagent-model-theta-tool; each reads
  `drive` / `teardown` / `finishInvocation` or asserts launch inputs. The three
  test files that do call `executeBody(..., binding.executeDeps)`
  (b0409-omitted-defaulted-binds-default.test.ts:260,
  helpers/call-with-clause-harness.ts:269, inbound-union-arm-dispatch.test.ts:1021)
  each obtain `binding` from `deps.bindPromptConversation(...)` (lines 259 /
  268 / 1010 respectively). No test reads `executeDeps` or `surface` off a
  `spawnSubagentConversation` result.
- Monkey-patching: `grep -rn "spawnSubagentConversation\s*=\|spyOn(.*spawnSubagentConversation"
  tests/ src/` → 0 hits, so `#driveCallee`'s `this.spawnSubagentConversation`
  always resolves to the class method that returns `drive`.
- `createEffectfulStatementHost` (effectful-statement-host.ts:570) only closes
  over `baseDeps`; it performs no eager registration, so the unread host has no
  side effect that could count as a use.
- Not a duplicate of PTQ-0108 (resolved): that finding was the unread
  `effectHostDeps` field; this finding is the `executeDeps`/`surface` pair the
  PTQ-0108 fix commit (4f2db584) re-labelled the same block as backing.
- Spec-mandated fail-closed branch? No — the `drive === undefined` arm at
  :4488-4491 is documented in-place as "the harness fallback", and the
  monkey-patch search above shows no harness reaches it.

## Triage
verdict: confirmed — re-verified independently: all seven excerpts byte-match at the cited lines; `drive` is an unconditional member of the subagent return (:2753) and both `ConversationBinding` consumers branch on `binding.drive !== undefined` first (:4485, :571), so the only `.executeDeps`/`.surface(` reads in src/ that could see this binding (:4489, :574-575) sit on the unreachable arm — the other two src reads (:2967, :4411) are `bindPromptConversation` bindings; within `spawnSubagentConversation` the `hostDeps` literal feeds only `createEffectfulStatementHost(hostDeps)` and the `checkpoint`/`statusLanes`/`signal` locals feed only `hostDeps`/`executeDeps`; the construction is inert (`buildEnvironment` is a bare `new LexicalEnvironment`, `defineParamsFieldLocal`/`decorateCheckpoint`/`createEffectfulStatementHost` have no throws or eager registration); `#spawnSubagentFnSession` (:3078) builds its own `hostDeps` (:3175) and returns `deps: hostDeps` (:3211) with no `spawnSubagentConversation` call, so the :2754-2757/:2764-2767 comments name a consumer that has not touched this binding since 4866d4d2; 29 direct test calls of `spawnSubagentConversation(` and every test `.executeDeps` read that shares a file with one (b0409:259, call-with-clause-harness:268, inbound-union-arm-dispatch:1010) obtains its binding from `bindPromptConversation`, the remaining test hits are stub `ConversationBinding` literals, and there is no string-keyed access, spy, reassignment, or subclass in src/tests/extensions/tools; git confirms the mechanism — at 4866d4d2^ neither the interface nor the subagent return had `drive` (the members were live), 4866d4d2 added `drive,` unconditionally and deleted the `#spawnSubagentFnSession` → `spawnSubagentConversation` call and its `binding.effectHostDeps` reads, and 4f2db584 (PTQ-0108 fix) removed `effectHostDeps: hostDeps` and rewrote the header to "backing `executeDeps.host`"; not a duplicate — PTQ-0108 is the `effectHostDeps` member, qw20260907202646-d2-01-executebodydeps-mutator-mode-discarded is `ExecuteBodyDeps.mutator/.mode` inside the deps object across both constructors, PTQ-0011/PTQ-0023 are `clock`/`sessionId`; `sites: 6` under-counts the seven cited locations by one, immaterial (triage: claude-opus-5)
