---
id: PTQ-1548
title: spawnSubagentConversation's params marshal step throws out after the registry ticket opens without the finishInvocation/internal-error routing its sibling launch-failure arms perform
lens: D6
status: open
verdict: confirmed
locations:
  - src/extension/subagent-spawn-regime.ts:402-408
  - src/extension/subagent-spawn-regime.ts:761-776
  - src/extension/subagent-spawn-regime.ts:266-313
  - src/extension/subagent-spawn-regime.ts:480-488
  - src/extension/subagent-spawn-regime.ts:497-510
  - src/extension/subagent-spawn-regime.ts:566-583
  - src/extension/production-subagent-host.ts:317-324
  - src/extension/invoke-machinery.ts:504-519
sites: 8
fix_scope: module
d6_class: posture-divergence
d6_anchor: "subagent.md#subagent-session-log-derivation-failure (PIC-65 launch-failure routing: params channel cleaned up, registry entry finished, theta/runtime/internal-error diagnostic)"
wave: qw20260928060032
reported_by: lens-d6-errorposture (anthropic/claude-opus-5-5)
date: 2026-09-28
---

# spawnSubagentConversation's params marshal step throws out after the registry ticket opens without the finishInvocation/internal-error routing its sibling launch-failure arms perform

## Observation
`spawnSubagentConversation` opens the invocation's ActiveInvocationRegistry ticket (line 268-269), publishes `invocationBound` (line 287), and builds `finishInvocation` (line 298) before it launches the child. After that point there are four launch-prologue failure exits. Three of them are in `#launchSubagentChild`: seam unavailable, session-log derivation failure, and spawn failure. Each calls `paramsCleanup()` and `finishInvocation()` before it throws `SubagentSpawnFailedError`, and the last two also call `routeSubagentSpawnFailure`, which emits the `theta/runtime/internal-error` diagnostic. The fourth is the PIC-60 params marshal step in `#buildControlPlaneEnv`. Either the adapter throws `SubagentSpawnFailedError` because the fs seam is missing, or the production `writeTempFile` throws a raw fs error from `mkdtempSync`/`writeFileSync`. That throw leaves the bind without calling `finishInvocation()` and without routing a diagnostic. On the `invoke` / `.theta`-callable / `subagent fn` paths the caller's `try/finally` that would finish the binding only starts after `spawnSubagentConversation` resolves.

## Evidence
**Divergent side: params marshal failure.** The call is not wrapped (src/extension/subagent-spawn-regime.ts:402-408):
```ts
        // See `defineRecordField`'s doc-comment: a bound param name is
        // author-controlled and must not be assigned.
        defineRecordField(paramValues, name, value);
      }
    }
    const marshalled = marshalParams(paramValues, this.#paramsMarshalDeps());
    const paramsCleanup = marshalled.cleanup;
```
The adapter throws the same carrier the sibling arms throw, with no cleanup (src/extension/subagent-spawn-regime.ts:761-776):
```ts
  #paramsMarshalDeps(): ParamsMarshalDeps {
    const fs = this.#input.subagentParamsFs;
    return {
      writeTempFile: (contents: string): string => {
        if (fs === undefined) {
          throw new SubagentSpawnFailedError(
            "subagent params temp-file channel unavailable: no params-fs seam wired",
          );
        }
        return fs.writeTempFile(contents);
      },
```
The production seam is real filesystem I/O with no catch (src/extension/production-subagent-host.ts:317-324):
```ts
    writeTempFile: (contents: string): string => {
      ...
      const dir = mkdtempSync(join(tmpdir(), "pi-theta-params-")); // allow-sync: ...
      const path = join(dir, "params.json");
      writeFileSync(path, contents, { mode: SUBAGENT_PARAMS_TEMP_FILE_MODE }); // allow-sync: ...
      return path;
    },
```
Ordering in the bind: the ticket opens before the marshal (src/extension/subagent-spawn-regime.ts:266-313, excerpted):
```ts
    const ticket =
      bindInput.invocationTicket ?? this.#deps.openInvocationTicket(theta.slashName, thetaAbort);
    ...
    statusBus?.invocationBound(ticket.invocationId, {
    ...
    const finishInvocation = makeInvocationFinisher(
      this.#deps.trackForwardingSources,
      forwardingSources,
      ticket,
    );
    ...
    const { paramsCleanup, parentEnv, controlPlaneEnv } = this.#buildControlPlaneEnv(
```

**Sibling side: the other launch-prologue failure arms of the same bind.**
Seam unavailable (src/extension/subagent-spawn-regime.ts:480-488):
```ts
    if (placementResolver === undefined || executableHost === undefined) {
      paramsCleanup();
      finishInvocation();
      throw new SubagentSpawnFailedError(
        "subagent child launch is unavailable: no placement seam / executable host wired",
      );
    }
```
Session-log derivation failure (src/extension/subagent-spawn-regime.ts:497-510):
```ts
    try {
      childSessionPath = this.#input.subagentChildSessionPath?.(input.label);
    } catch (policyThrow: unknown) { // allow-broad-catch: session-log-derivation-failure — pi-integration-contract/subagent.md#subagent-session-log-derivation-failure (any policy failure is a loud launch failure: params cleaned, registry entry finished, PIC-65 internal-error routing; never a silently unlogged child)
      paramsCleanup();
      finishInvocation();
      const reason = `subagent child session-log path derivation failed: ${...}`;
      ...
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
      throw new SubagentSpawnFailedError(reason);
    }
```
Spawn failure (src/extension/subagent-spawn-regime.ts:566-583, excerpted):
```ts
    if (!launch.ok) {
      ...
      placementLease.release();
      paramsCleanup();
      finishInvocation();
      ...
      routeSubagentSpawnFailure(new Error(reason), theta.sourcePath ?? theta.slashName, {
        emitDiagnostic,
      });
      throw new SubagentSpawnFailedError(reason);
    }
```
**Caller: nothing finishes a ticket for a bind that throws** (src/extension/invoke-machinery.ts:504-519, excerpted). The `try` whose `finally` calls `binding.finishInvocation?.()` opens after the await:
```ts
    const binding = await this.#deps.spawnSubagentConversation({
      ...
    });
    // Decision 6 / Increment B1: the spawn bind registered an
    // ActiveInvocationRegistry entry; the `finally` calls its `finishInvocation`
    ...
    try {
```
`#driveSubagentFnChild` (subagent-spawn-regime.ts:1557 → `#driveAndValidateFnChild`'s try/finally) has the same shape. The invoke boundary catch (`src/runtime/invoke-cancellation.ts:151-175`) turns the throw into `Err(invoke_infra{cause:"internal_error"})` and emits no diagnostic.

**Why these are siblings.** All four exits are the same failure class. Each is a launch-prologue failure inside the same `spawnSubagentConversation` call, after the ticket opens and before a child exists. Two of them are the same kind of I/O: the session-log arm fails on an "un-creatable nest directory" (`mkdirSync`), and the params arm fails on `mkdtempSync`/`writeFileSync` in tmpdir. The params arm's own seam-missing throw uses the same `SubagentSpawnFailedError` carrier the sibling arms use.

**Anchor (quoted verbatim, docs/spec_topics/pi-integration-contract/subagent.md:58):** "A derivation FAILURE — a throwing parent-session read, a nest directory that cannot be created — fails the launch loudly BEFORE placement: no child is placed, the params channel is cleaned up, the registry entry is finished, and the failure routes through the PIC-65 unanticipated-SDK-reject arm (`theta/runtime/internal-error` diagnostic), surfacing `Err(InvokeInfraError{cause:"internal_error"})` to an invoke parent". The PIC-65 spawn-failure clause (subagent.md, PIC-65 **Spawn failure** paragraph) says the same: "routes as an unanticipated SDK reject does: `theta/runtime/internal-error` ... The registry entry from **`ActiveInvocationRegistry`** is removed by the same `finally`." Bug 0489 (docs/bugs/0489-subagent-children-leave-no-session-logs.md:84-87) ratified that posture for the session-log arm: "a loud `SubagentSpawnFailedError` with params cleaned, the registry entry finished, and the PIC-65 internal-error diagnostic routed".

Searches run in this session:
- `grep -n "throw new SubagentSpawnFailedError" src/extension/subagent-spawn-regime.ts | wc -l` → 4 (lines 485, 509, 582, 766). Three are preceded by `paramsCleanup(); finishInvocation();`. Line 766 is not.
- `grep -rn "instanceof SubagentSpawnFailedError" src tests | wc -l` → 0. No caller special-cases the carrier to finish the ticket.
- `grep -rln "temp-file channel unavailable" tests src` → 1 file (src/extension/subagent-spawn-regime.ts only). No test drives this arm.

## Why this is a problem
On the fail-closed side, a launch-prologue failure finishes the registry ticket and emits `theta/runtime/internal-error`. On the outlier side, a params-channel write failure raised in the same prologue does neither. For invoke-reached subagent callees and `subagent fn` calls, the ActiveInvocationRegistry entry stays in the registry, its `disposeBarrier` never settles, and `invocationEnded` is never published (`production-theta-producer.ts:636-645`: `finish` is what calls `activeInvocations?.remove(entry)` and `statusBus?.invocationEnded`). The failure then reaches the parent only as a diagnostic-less boundary-minted `Err`. The anchor states the intended posture for exactly this class: a pre-placement launch failure that is not a spawn.

## Suggested direction (non-binding, optional)
Route a params marshal failure through the same arm the session-log derivation failure uses: finish the invocation, route the internal-error diagnostic, and throw the typed carrier. Alternatively, move the marshal step inside the region that already performs that routing.

## False-positive check
- EXST-9 / PIC-73 class check: this is not a sink or producer-hook throw at the execution-status bus boundary. `invocationBound` succeeds, and the throw comes later from the params channel. It is not a degrade-silent optional capability either, because PIC-60's file channel is required at ≥ threshold and its absence is documented as "fail-loud at the boundary rather than silent narrowing" (subagent-spawn-regime.ts:757-760). Neither pre-exemption applies.
- allow-broad-catch token check: the divergent side has no catch at all. The sibling catch at :499 carries `session-log-derivation-failure — pi-integration-contract/subagent.md#subagent-session-log-derivation-failure`, and that clause is the anchor quoted above.
- Stated-rationale check: the `#paramsMarshalDeps` doc (757-760) says only "fail-loud at the boundary". It says nothing about skipping `finishInvocation` or the diagnostic. The `#buildControlPlaneEnv` doc (383-390) and the bind comment at 304-308 say nothing about failure handling. `SubagentSpawnFailedError`'s own doc (production-producer-deps.ts:414-419) lists "missing spawn seam" among the failures it "routes as an unanticipated SDK reject (`theta/runtime/internal-error`)". The params arm throws that carrier without that routing. Bug 0489 fixed only the session-log arm and does not mention the params channel.
- Sibling-reality check: all three sibling arms run in the same call after the same ticket open (`#launchSubagentChild` is awaited at :315, directly after `#buildControlPlaneEnv` at :309). The top-level slash path is not affected, because its dispatch `finally` (theta-composition-producer.ts:406-414) finishes the ticket and its outer catch surfaces the defect. The divergence shows on the invoke / `subagent fn` paths, where the caller's `try/finally` starts only after the bind returns (invoke-machinery.ts:504-519; subagent-spawn-regime.ts:1557-1572).
- Already-filed check: `grep -rl "paramsMarshalDeps\|writeTempFile" quality/` hits only resolved D8/D4/D9 items (PTQ-0021, 0196, 0199, 0466, 0907, 1150, 1285, 1288) and one D9 intake item. None concerns failure posture.

## Triage
verdict: confirmed — I re-checked the code and the divergence is real. `#buildControlPlaneEnv` calls `marshalParams` without a wrapper at subagent-spawn-regime.ts:407, after the ticket opens (:268-269), `invocationBound` fires (:287) and `finishInvocation` is built (:298). A `writeTempFile` throw from there calls neither `finishInvocation` nor `routeSubagentSpawnFailure`. That throw is either the adapter's `SubagentSpawnFailedError` (:766, which production never hits because production-composition.ts:1644 wires the fs seam) or a raw `mkdtempSync`/`writeFileSync` error (production-subagent-host.ts:317-324). The three sibling prologue arms (:480-486, :497-510, :566-583) do both. Both callers open their finishing `try/finally` only after the bind resolves (invoke-machinery.ts:504-519; :1557-1572). So the registry entry is never removed, its `disposeBarrier` never settles and `invocationEnded` never fires (production-theta-producer.ts:636-645). The anchor at subagent.md:58 pins this posture (params channel cleaned, registry entry finished, PIC-65 internal-error) for pre-placement launch failures. The `SubagentSpawnFailedError` doc (production-producer-deps.ts:414-419) says the adapter's own carrier routes to `theta/runtime/internal-error`. The stated searches reproduce (4 throws at 485/509/582/766, 0 `instanceof`, 1 file). No EXST-9/PIC-73 exemption or stated rationale applies, and no existing PTQ or intake item tracks this (triage: claude-opus-5-5)
