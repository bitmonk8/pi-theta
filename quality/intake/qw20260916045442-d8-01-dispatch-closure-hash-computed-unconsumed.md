---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: parseCalleeTheta's runtime invoke() dispatch gate unconditionally hashes the callee's whole transitive closure even for the one cross-mode cell that never reads it
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:2604-2618
  - src/extension/production-composition.ts:2805-2815
  - src/extension/production-composition.ts:4179-4184
  - src/extension/production-theta-producer.ts:4838-4841
  - src/extension/production-theta-producer.ts:4918-4924
  - src/extension/production-theta-producer.ts:2536-2541
sites: 6                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-composition.ts#parseCalleeTheta # D8 only: the exemption key
wave: qw20260916045442
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# parseCalleeTheta's runtime invoke() dispatch gate unconditionally hashes the callee's whole transitive closure even for the one cross-mode cell that never reads it

## Observation
`parseCalleeTheta` (production-composition.ts:4066-4199) is the dispatch gate the runtime `invoke(...)` executor calls once per actual `invoke()`/`.theta`-callable-call evaluation (not once per load). It calls `resolveThetaToolsAtLoad`, which — before even looking at the callee's `tools:` list — unconditionally calls `captureRootClosureHash`, a full read-plus-SHA-256 hash of the callee's entire transitive `.thetalib` closure. That computed `rootClosureHash` is, by the function's own doc comment, read only inside `spawnSubagentConversation` — one of two branches the caller can take after parsing the callee. The other branch (`callerMode === "prompt"` invoking a `mode: "prompt"` callee) attaches the callee in-process and returns without ever calling `spawnSubagentConversation`, so for that cross-mode cell the hash just computed is discarded unread.

## Evidence
`resolveThetaToolsAtLoad` computes the hash before the `tools:` early-return, unconditionally on every call:

`src/extension/production-composition.ts:2604-2618`
```ts
): Promise<ThetaToolsResolution> {
  // Captured BEFORE the no-`tools:` early return: bug 0328's defect is that a
  // `tools:`-less subagent theta cleared the whole hash carrier, so its own
  // launched bytes were never validated against anything. The root's own
  // closure hash is independent of whether it declares `tools:`.
  const rootClosureHash = await captureRootClosureHash(parsed, fs, ctx, parseDeps);
  const rootClosureSpread =
    rootClosureHash !== undefined ? { rootClosureHash } : {};

  const toolsList = parsed.frontmatter.tools;
  if (
    toolsList === undefined ||
    toolsList.length === 0 ||
    parsed.sourcePath === undefined
  ) {
```

`captureRootClosureHash`'s own doc comment names its one consumer:

`src/extension/production-composition.ts:2805-2815`
```ts
 * The hash is captured for EVERY theta with a readable on-disk source, because
 * ANY theta can be launched as a child root: a subagent-mode theta whenever it
 * is dispatched by slash or `invoke(...)`, and a prompt-mode theta when a
 * SUBAGENT-mode caller invokes it (the caller runs the prompt callee inside a
 * spawned child `pi` process, not in-process — see the producer's
 * `#driveCallee` and invocation.md). Gating capture on `mode: subagent` here
 * would leave that spawned prompt callee's root unhashed, so the child could
 * execute a diverged root undetected. The captured value is marshalled ONLY on
 * the subagent-launch path (`spawnSubagentConversation` reads
 * `theta.rootClosureHash`); a prompt-mode theta dispatched normally, in-process
 * by slash or prompt, never marshals it, so in-process dispatch is unaffected.
```

`parseCalleeTheta`'s own dispatch-time call, with no mode gate before it:

`src/extension/production-composition.ts:4179-4184`
```ts
  const dispatchDeps: PassClosureDeps = {
    ...deps,
    closureSourcesCache: new Map<string, readonly ClosureSource[]>(),
    closureHashCache: new Map<string, string>(),
  };
  const toolResult = await resolveThetaToolsAtLoad(input, fs, ctx, dispatchDeps, getAllTools);
```

The runtime caller, `#driveCallee` (production-theta-producer.ts), calls `parseCalleeTheta` (via the injected `parseCallee` seam) once per live `invoke()` evaluation, before it knows which cross-mode cell this call will resolve to:

`src/extension/production-theta-producer.ts:4838-4841`
```ts
    const parsed = await this.#input.parseCallee?.(theta.sourcePath, calleePath);
    if (parsed === undefined || parsed.kind !== "ok") {
      const cause: InvokeInfraCause = parsed?.kind === "unparseable" ? "parse_failure" : "load_failure";
      const message =
```

The one cross-mode cell that never reaches `spawnSubagentConversation` — it returns from inside this branch:

`src/extension/production-theta-producer.ts:4918-4924`
```ts
    // ambient snapshot is restored on every settle path — success, returned
    // `Err`, cancel, or throw — with the inner failure surfaced unmasked. CANCEL-5: the child binding derives its `thetaAbort` from
    // `parentSignal` (downward-only). Every other cell (a subagent-mode callee,
    // or a subagent-mode caller) spawns fresh below.
    if (callerMode === "prompt" && callee.frontmatter.mode === "prompt") {
      const childBinding = this.bindPromptConversation({
        theta: callee,
```

The sole read site of `rootClosureHash` anywhere in `src/`, inside `spawnSubagentConversation` — unreached by the branch above:

`src/extension/production-theta-producer.ts:2536-2541`
```ts
    // `__proto__` lands as an own row instead of silently no-oping through the
    // inherited `Object.prototype` setter (bug 0343) — the `Object.hasOwn`
    // read above is unaffected, only the write below changes.
    const rootClosureHash = theta.rootClosureHash;
    if (rootClosureHash !== undefined && !Object.hasOwn(callableHashes, rootClosureHash.name)) {
      defineRecordField(callableHashes, rootClosureHash.name, rootClosureHash.hash);
    }
```

Data-size/call-frequency citation: `invoke(...)` is spec-legal inside a `par for` loop body (docs/spec_topics/control-flow.md CTRL-4, "the body ... may run `invoke(...)`"), whose own worked example invokes the same callee once per iterand element (`par for f in findings max 8 { invoke<Review>("./lens.theta", f) }`, control-flow.md:64), and CTRL-2 documents a 64-in-flight width throttle per loop — so repeated dispatch of the identical callee within one turn is a normal, spec-illustrated shape, not an edge case.

## Why this is a problem
`captureRootClosureHash`'s per-call cost is `collectCallableClosureSources`'s full closure walk (one `fs.readBytes` + `TextDecoder.decode` per transitive `.thetalib` member) plus one SHA-256 pass over the concatenated content (`hashCallableClosure`). At the LOAD-time call site (once per discovered theta) this cost is proportionate — any registered theta might later be launched as a child root, so every theta needs one captured hash per pass. At the DISPATCH-time call site inside `parseCalleeTheta`, the same unconditional call runs once per runtime `invoke()`/`.theta`-callable-call evaluation, and `parseCalleeTheta` has no `callerMode` parameter and no visibility into which cross-mode cell the caller will resolve to before or after the call. For the `prompt`-caller-invokes-`prompt`-callee cell, the caller's own code (4923) never calls `spawnSubagentConversation`, so the hash `parseCalleeTheta` just computed for that exact dispatch is provably never read by anything in `src/` (the grep for `.rootClosureHash` reads has exactly one hit, inside the function this cell never reaches). The per-dispatch closure caches (`closureSourcesCache`/`closureHashCache` at 4181-4182) are deliberately fresh per call (PTQ-0348's ratified design, for the closure hash's own freshness requirement), so this is not merely a cache-miss on an otherwise-avoidable read: for this cross-mode cell the whole read-plus-hash is dead work by construction, repeated on every such `invoke()` evaluation a running theta performs.

## Suggested direction (non-binding, optional)
One unproven hypothesis, chosen to avoid disturbing the freshness guarantee PTQ-0348 established for the cells that do spawn: thread the callee's already-parsed `frontmatter.mode` (known the moment `parseCalleeTheta` finishes parsing, before `resolveThetaToolsAtLoad` runs) together with the caller's own `callerMode` (already a parameter one frame up, at `#driveCallee`) so `resolveThetaToolsAtLoad`'s closure-hash step can be skipped specifically for the `prompt`-into-`prompt` cell. This changes only when the hash is computed within one dispatch, not whether it is cached across dispatches, so it does not reopen the staleness question PTQ-0348's dispatch-scoped caches were designed to avoid.

## False-positive check
Grepped `src/` for every occurrence of `.rootClosureHash` (the field read, not the type declaration): the only read site is production-theta-producer.ts:2538, inside `spawnSubagentConversation`; every other hit is either the field's declaration (production-composition.ts:2518, reload-wiring.ts:109) or a write/build site (production-composition.ts:1618-1620, 4194-4196). Traced `#driveCallee`'s control flow from the `parseCallee` call (4838) to the mode branch (4923) and confirmed the `if (callerMode === "prompt" && callee.frontmatter.mode === "prompt")` branch's `try`/`finally` returns (via `runPromptSuspendInvoke`) without falling through to the `spawnSubagentConversation` call that follows the branch (production-theta-producer.ts:4999) — confirmed by reading the full branch body, not merely its opening lines. Checked this is not PTQ-0348 (closure-hash-recomputed-per-caller, fixed): that finding is about the LOAD-time `resolveThetaToolsAtLoad` calls (`captureRootClosureHash` once per discovered theta, `attachLoadTimeClosureHashes` once per `tools:` entry) sharing no cache across DIFFERENT discovered thetas within one pass — already fixed via `closureSourcesCache`/`closureHashCache`, confirmed present and consulted in the current source (production-composition.ts:4230-4239, 4270-4274). This finding's claim is different in kind: it is that the DISPATCH-time call (`parseCalleeTheta`, reached from the runtime `invoke()` executor, not from the per-theta load loop) computes a value one whole cross-mode cell never consumes at all, independent of any cache. Checked `quality/issues/`, `quality/resolved/`, and the wave's rejected-list for "rootClosureHash", "captureRootClosureHash", "spawnSubagentConversation", "driveCallee": no existing filing makes this claim. Not a dead-code claim: `captureRootClosureHash` and `rootClosureHash` are live, load-bearing on the three cross-mode cells that do spawn (RFC-0005's `#subagent-theta-callable-hash`); the claim is that ONE specific, identifiable call pattern (dispatch-time, prompt-into-prompt) performs the computation without ever consuming its result, not that the mechanism itself is unreachable. This finding straddles into `src/extension/production-theta-producer.ts`, outside this review's briefed shard (production-composition.ts / production-result-channel.ts / production-subagent-host.ts); its lines are read and verified, not guessed, and are cited only as the consumption-site evidence for an accounting whose `d8_host` is the in-shard `parseCalleeTheta`.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — accounting verified: all 6 excerpts reproduce at the cited lines; `parseCalleeTheta` is 4066-4199 (134 LOC, size-scan confirmed) and unconditionally calls `resolveThetaToolsAtLoad`→`captureRootClosureHash` (full closure read + SHA-256, fresh `closureSourcesCache`/`closureHashCache` per dispatch per PTQ-0348's ratified per-dispatch scoping, so no cross-dispatch reuse offsets the cost); grep for `rootClosureHash` across src/ confirms the sole read is production-theta-producer.ts:2538 inside `spawnSubagentConversation`, and the `callerMode==="prompt" && callee.frontmatter.mode==="prompt"` branch (4918-4998) returns (via `runPromptSuspendInvoke`'s try/finally) before ever reaching the `spawnSubagentConversation` call at 4999 — confirmed by reading the whole branch body. subagent.md `#subagent-theta-callable-hash` scopes the hash to the child-process marshalling boundary, so skipping it for the in-process attach cell drops no spec-required behaviour (no `challenges_spec` needed). Not PTQ-0348 (that fixed cross-caller reuse within one load pass; this is dispatch-time computation unconsumed by one branch, independent of any cache) nor the wave's sibling d8-02 (different host, `parseCalleeForTools`'s uncached readdir/realpath probes). Per the D8 protocol an accurate heavier-than-scale accounting rests at questionable, never confirmed — whether to thread `callerMode`/callee mode through to skip the hash is a human design call. (triage: claude-opus-5)
