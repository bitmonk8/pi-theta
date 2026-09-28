---
id: pending
title: production-host-loop-dispatch.ts snapshots and restores the session active set, model and thinking level inline while every other production swap of the same three session resources composes the withActiveSetGate / withModelWindow / withThinkingWindow helpers, and the two ways have already diverged in restore-failure handling
lens: D1
status: intake
verdict: pending
locations:
  - src/extension/production-host-loop-dispatch.ts:428-439
  - src/extension/production-host-loop-dispatch.ts:530-535
  - src/extension/production-host-loop-dispatch.ts:574-593
  - src/runtime/tool-registration.ts:126-138
  - src/runtime/tool-registration.ts:172-176
  - src/runtime/tool-registration.ts:312-316
  - src/runtime/tool-registration.ts:389-399
  - src/extension/live-prompt-query-driver.ts:790
  - src/runtime/invoke-prompt-suspend.ts:111
sites: 9
fix_scope: cross-module
d1_class: divergent-solutions
wave: qw20260928124659
reported_by: lens-d1-design (anthropic/claude-fable-5-1)
date: 2026-09-28
triaged_at: 7d0a52af49422fb4ce69fba3a62007fdfaf35a3e
---

# production-host-loop-dispatch.ts snapshots and restores the session active set, model and thinking level inline while every other production swap of the same three session resources composes the withActiveSetGate / withModelWindow / withThinkingWindow helpers, and the two ways have already diverged in restore-failure handling

## Observation
Three session resources — the active tool set (`pi.getActiveTools` / `pi.setActiveTools`), the session model (`pi.setModel`) and the thinking level (`pi.getThinkingLevel` / `pi.setThinkingLevel`) — are temporarily swapped and then restored in a `finally` at exactly two places in `src/`. `src/runtime/tool-registration.ts` provides one named window helper per resource (`withActiveSetGate`, `withModelWindow`, `withThinkingWindow`), each carrying the PIC-8 restore protocol (single re-attempt, `theta/runtime/*-restore-failed` diagnostic plus display note, failure swallowed so the protected outcome propagates unmasked); the prompt-mode query driver and the prompt→prompt invoke cell compose those helpers. `src/extension/production-host-loop-dispatch.ts` (the PIC-64 rung-2 bridge, which in prompt mode swaps the SAME user session) performs the same snapshot / install / restore sequence for all three resources inline in its `runHostTurn` / `restoreModel` collaborators: bare `setActiveTools(ambientTools)`, `await setModel(originalModel)` with the boolean discarded, bare `setThinkingLevel(...)`, no re-attempt, no diagnostic. `withActiveSetGate`'s docstring states that every production shipped snapshot/restore window calls it and that there is exactly one implementation of the protocol; bug 0372 (which introduced that claim) listed the bridge as "has its own protocol under subagent.md and is not assessed here".

## Evidence

### Way A — named window helpers (runtime/tool-registration.ts), composed by the two prompt-mode session-swap sites

src/runtime/tool-registration.ts:126-138 (the sole-implementation claim):

```ts
/**
 * Gate query visibility via the active-set: snapshot (step 1), swap-install the
 * `installVector` (step 2), run `body` (step 3), restore the snapshot (step 4)
 * with the PIC-8 single-re-attempt protocol, routing step-1/step-2 setup
 * failures to `internal-error` per PIC-19. Propagates the original body
 * error/result unmasked. Every production shipped snapshot/restore window
 * calls this function (bug 0372 §Fix) — there is exactly one implementation of
 * the protocol.
 */
export async function withActiveSetGate<T>(
  deps: ActiveSetGateDeps,
  body: () => Promise<T>,
): Promise<T> {
```

src/runtime/tool-registration.ts:172-176 (active-set restore protocol):

```ts
/**
 * Step-4 restore with the PIC-8 single-re-attempt protocol: restore the
 * snapshot; on a throw, re-attempt exactly once with the same snapshot; on a
 * second failure, emit `theta/runtime/active-set-restore-failed` (E) plus a
 * `display: true` advisory note. The restore failure is swallowed here so the
```

src/runtime/tool-registration.ts:312-316 (model restore protocol; note that a `false` resolution counts as a failure at :322-323 `const restored = await deps.pi.setModel(snapshot); return restored ? { ok: true } : { ok: false, reason: "pi.setModel returned false" };`):

```ts
 * same snapshot; on a second failure, emit `theta/runtime/model-restore-failed`
 * (E) plus a `display: true` advisory note. The failure is swallowed here so
 * the outcome the `finally` protects propagates unmasked.
 */
async function restoreSessionModel<M extends ModelWindowModel>(
```

src/runtime/tool-registration.ts:389-399 (thinking restore protocol):

```ts
 *    session level back to the snapshot whenever it differs, so neither the
 *    pin nor a `model:`-only swap leaves the user session on another level.
 *
 * The restore never masks the outcome `finally` protects: a failure gets one
 * re-attempt, then `theta/runtime/thinking-restore-failed` (E) plus a display
 * note, and the turn's value (or throw) propagates unchanged.
 */
export async function withThinkingWindow<T>(
  deps: ThinkingWindowDeps,
  run: (applyPin: () => void) => Promise<T>,
): Promise<T> {
```

Composition sites of Way A — src/extension/live-prompt-query-driver.ts:790:

```ts
      const window = await withActiveSetGate(activeSetGateDeps, () => withThinkingWindow(thinkingWindowDeps, (applyThinkingPin) => withModelWindow(modelWindowDeps, async () => {
```

src/runtime/invoke-prompt-suspend.ts:111:

```ts
  const result = await withActiveSetGate<T>(
```

### Way B — inline snapshot / install / restore in the PIC-64 bridge

src/extension/production-host-loop-dispatch.ts:428-439 (snapshot of model and thinking level):

```ts
    // Snapshot the model + active set BEFORE any switch, so `restoreModel`
    // returns the session to its exact pre-dispatch state on every path.
    const originalModel = host.ctx.model;
    let ambientTools: string[] | undefined;
    // Bug 0491: the session thinking level at dispatch entry (undefined when
    // the host exposes no thinking-level control). Taken here, beside the model
    // snapshot, so every path that runs the model restore can also restore it.
    const ambientThinking: string | undefined =
      typeof host.pi.getThinkingLevel === "function" ? host.pi.getThinkingLevel() : undefined;
    // Bug 0491: the bridge mirrors this (see the registration below).
    const sessionReasons = (originalModel as { reasoning?: boolean } | undefined)?.reasoning === true;
    let active = true;
```

src/extension/production-host-loop-dispatch.ts:530-535 (snapshot + install of the active set, model swap-in; the comment itself names the PIC-17 protocol):

```ts
        // PIC-17 active-set protocol (QTL-4): the authored `tool_use` executes in
        // the host loop only if `toolName` is in the active set. Snapshot the
        // ambient set, install exactly `[toolName]`, and switch to the bridge.
        ambientTools = host.pi.getActiveTools();
        host.pi.setActiveTools([request.toolName]);
        await host.pi.setModel(bridge);
```

src/extension/production-host-loop-dispatch.ts:574-593 (the three restores):

```ts
      restoreModel: async (): Promise<void> => {
        // ALWAYS restore (the seam's `finally`), so a thetaAbort mid-turn never
        // leaves the bridge model or the fabricated active set installed.
        if (ambientTools !== undefined) {
          host.pi.setActiveTools(ambientTools);
        }
        if (originalModel !== undefined) {
          await host.pi.setModel(originalModel);
        }
        // Bug 0491: AFTER the model restore (which re-derived the level), put the
        // session back on the level it had before the bridge swap.
        if (
          ambientThinking !== undefined &&
          typeof host.pi.getThinkingLevel === "function" &&
          typeof host.pi.setThinkingLevel === "function" &&
          host.pi.getThinkingLevel() !== ambientThinking
        ) {
          host.pi.setThinkingLevel(ambientThinking as never);
        }
      },
```

`restoreModel` runs as the `finally` of `dispatchViaHostLoop` (src/runtime/host-loop-dispatch.ts:175-177 `} finally { await deps.restoreModel(); }`), so a throw out of any of the three bare restore calls above replaces the tool result the `finally` protects.

### Counts, both ways

Search 1 — every non-import, non-declaration use of the three window helpers in `src/`:
`grep -rn "withActiveSetGate\|withModelWindow\|withThinkingWindow" src --include=*.ts | grep -v "import\|export async function\|^\S*:\s*\*\|^\S*:\s*//"` → 5 hits:

```
src/extension/live-prompt-query-driver.ts:19:  withActiveSetGate,
src/extension/live-prompt-query-driver.ts:20:  withModelWindow,
src/extension/live-prompt-query-driver.ts:21:  withThinkingWindow,
src/extension/live-prompt-query-driver.ts:790:      const window = await withActiveSetGate(activeSetGateDeps, () => withThinkingWindow(thinkingWindowDeps, (applyThinkingPin) => withModelWindow(modelWindowDeps, async () => {
src/runtime/invoke-prompt-suspend.ts:111:  const result = await withActiveSetGate<T>(
```
(lines 19-21 are the import-list members of one multi-line import; the call sites are :790 and :111 — two composition sites.)

Search 2 — every raw `setActiveTools` / `getActiveTools()` / `setModel(` call in `src/` (excluding comments):
`grep -rn "\.setActiveTools(\|\.getActiveTools()\|\.setModel(" src --include=*.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//"` → 11 hits, all in exactly two files:

```
src/extension/production-host-loop-dispatch.ts:533:        ambientTools = host.pi.getActiveTools();
src/extension/production-host-loop-dispatch.ts:534:        host.pi.setActiveTools([request.toolName]);
src/extension/production-host-loop-dispatch.ts:535:        await host.pi.setModel(bridge);
src/extension/production-host-loop-dispatch.ts:578:          host.pi.setActiveTools(ambientTools);
src/extension/production-host-loop-dispatch.ts:581:          await host.pi.setModel(originalModel);
src/runtime/tool-registration.ts:146:    snapshot = pi.getActiveTools();
src/runtime/tool-registration.ts:156:    pi.setActiveTools([...installVector]);
src/runtime/tool-registration.ts:181:    deps.pi.setActiveTools([...snapshot]);
src/runtime/tool-registration.ts:190:    deps.pi.setActiveTools([...snapshot]);
src/runtime/tool-registration.ts:293:  const swapped = await deps.pi.setModel(target);
src/runtime/tool-registration.ts:322:      const restored = await deps.pi.setModel(snapshot);
```

Search 3 — every raw `getThinkingLevel()` / `setThinkingLevel(` call in `src/` (excluding comments):
`grep -rn "\.setThinkingLevel(\|\.getThinkingLevel()" src --include=*.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//"` → 3 hits:

```
src/extension/production-host-loop-dispatch.ts:436:      typeof host.pi.getThinkingLevel === "function" ? host.pi.getThinkingLevel() : undefined;
src/extension/production-host-loop-dispatch.ts:589:          host.pi.getThinkingLevel() !== ambientThinking
src/extension/production-host-loop-dispatch.ts:591:          host.pi.setThinkingLevel(ambientThinking as never);
```
(tool-registration.ts reaches the same members through `pi.getThinkingLevel!()` / `pi.setThinkingLevel!(...)` at :410-411, which the `\.` anchor excludes; `grep -rn "getThinkingLevel\|setThinkingLevel" src/runtime/tool-registration.ts | grep -v "^\S*:\s*\*\|^\S*:\s*//"` → 5 hits: :364, :366 (interface members), :401 (typeof probe), :410, :411.)

So: Way A has 1 implementation per resource (3 helpers) and 2 composition sites; Way B has 1 implementation (the bridge) and 0 helper calls. No third snapshot/restore site exists in `src/`.

### The drift that already happened
docs/bugs/0372-pic8-restore-protocol-orphaned.md:139-141 recorded the bridge as a known parallel implementation and left it outside the unification:

```
- The PIC-64(e) host-loop dispatch snapshot/restore
  (`production-host-loop-dispatch.ts:497/541`) has its own protocol under
  subagent.md and is not assessed here.
```

Bug 0491 then added the thinking-level resource to BOTH ways in one fix (docs/bugs/0491-no-frontmatter-thinking-level-pin.md fix-direction items 3 and 7): item 3 gave Way A a re-attempt + `theta/runtime/thinking-restore-failed`; item 7 gave Way B a bare snapshot/restore. The spec line the bridge's own comment cites (docs/spec_topics/pi-integration-contract/subagent.md:202, wiring (e)) describes the bridge's active-set handling as "the PIC-17 `pi.setActiveTools` snapshot/restore protocol" — the protocol Way A implements.

Concrete mechanical difference today, resource by resource:
- active set: Way A retries once and emits `theta/runtime/active-set-restore-failed` + note on a restore throw, swallowing it; Way B (:578) lets a `setActiveTools` throw escape `restoreModel` and therefore the dispatch `finally`.
- model: Way A treats a `false` resolution of `pi.setModel(snapshot)` as a failure (re-attempt, `theta/runtime/model-restore-failed`); Way B (:581) discards the boolean — a declined restore leaves the bridge model installed on the (prompt-mode: user's live) session with no re-attempt and no diagnostic, contradicting the comment two lines above it ("never leaves the bridge model … installed").
- thinking level: Way A retries once and emits `theta/runtime/thinking-restore-failed` + note; Way B (:591) lets a `setThinkingLevel` throw escape.

`grep -rn "restore-failed" tests/production-host-loop-dispatch.test.ts tests/helpers/fake-host-loop-host.ts` → 0 hits: no witness pins either posture for the bridge, and the fake host's `setModel` (tests/helpers/fake-host-loop-host.ts:276-277) always records and resolves, so the divergence is invisible to the suite.

Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above — the repository's own docstring claims a single implementation of the snapshot/restore protocol, the spec describes the bridge as using that protocol, and the bridge is a second implementation whose failure handling has already diverged on all three resources.

## Why this is a problem
The same problem — temporarily swap a shared session resource and restore it in a `finally` — is solved by composable window helpers at two sites and by inline calls at the third, and the third is the one that runs on the user's live session in prompt mode. A maintainer reading `withActiveSetGate`'s "exactly one implementation" (tool-registration.ts:131-133) or the spec's "PIC-17 snapshot/restore protocol" wording for the bridge will change the restore protocol (a diagnostic code, the re-attempt rule, a new resource such as the bug-0491 thinking level) in the helpers and believe every production swap follows; the bridge does not, and bug 0491 demonstrates exactly that split landing in one fix. Because the bridge's restore is `dispatchViaHostLoop`'s `finally`, the divergence also flips the PIC-8(d) "restore failure does not mask the inner outcome" posture: Way A swallows and reports, Way B propagates and stays silent.

## Suggested direction (non-binding, optional)
Unification hypothesis (unproven): the bridge's `runHostTurn` / `restoreModel` pair could be expressed as a composition of `withActiveSetGate` (install vector `[toolName]`), `withModelWindow` (target = bridge model, ambient = `ctx.model`) and `withThinkingWindow` (no pin) around the fabricated turn, threading the producer's `emitDiagnostic` / system-note channel as the helpers' deps; whether PIC-64's per-dispatch nonce/provider lifecycle and the seam's `registerProvider → runHostTurn → restoreModel` shape admit that composition without changing the leaf `dispatchViaHostLoop` contract is for the fix stage to establish.

## False-positive check
- Clone-map check: the injected clone map lists no groups for `src/extension/production-host-loop-dispatch.ts`; no group covers this. The bridge code is not a token copy of the helpers (different control shape: collaborator closures vs `finally`-wrapping higher-order functions), so this is mechanism-shaped, not D4's.
- D9-affinity check: not a wrong-home claim — the bridge's snapshot/restore belongs with the bridge; the finding is that it re-solves the protocol rather than composing the helpers that live where the protocol is owned.
- D2-deadness check: both sides live — Way A is called at live-prompt-query-driver.ts:790 and invoke-prompt-suspend.ts:111; Way B is the production `hostLoopDispatch` wired at the composition root (`grep -rn "createProductionHostLoopDispatch" src --include=*.ts` → 5 hits: production-composition.ts:107 (import), :1327, :1371 (`createProductionHostLoopDispatch({ pi, ctx, clock })`), :1572, and the declaration at production-host-loop-dispatch.ts:389).
- D8 check: not an over-built facility; the helpers are spec-mandated (PIC-8) and already in use.
- D6 check: the restore-failure posture gap is cited as the demonstrated cost of the divergence, not filed as a swallowed-error or posture finding; no behaviour change is proposed.
- Prior-filing check: `grep -rli "withActiveSetGate\|production-host-loop-dispatch" quality/issues quality/resolved quality/intake` → PTQ-0027, PTQ-0128, PTQ-0134, PTQ-0200, PTQ-0472 (all resolved) and one d10 intake candidate; PTQ-0128's scope was `computeActiveSetInstall`'s install-vector claim across the three `withActiveSetGate` callers and does not touch the bridge; none covers this site. Bug 0372 explicitly excluded the bridge ("not assessed here").
- Git-intent check: `git log -S` confirms bug 0491 (docs/bugs/0491 items 3 and 7) added the thinking-level resource to both ways in one fix; no commit records a decision that the bridge must not use the helpers.
- Self-inconsistency statement: no written rule exists; the anchor is self-inconsistency plus the cost cited above.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified; whether to unify (and to what) is a design decision for a human ruling. Checks: identity and form OK. All three stated searches reproduce line for line (S1 5 hits: :19-21/:790/:111; S2 11 hits; S3 3 hits; the tool-registration S3b gives 5). The excerpts match at production-host-loop-dispatch.ts:428-439/530-535/574-593 (bare setActiveTools, setModel boolean discarded, bare setThinkingLevel) and tool-registration.ts:126-138/172-176/312-323/389-399. The "exactly one implementation" docstring is present. host-loop-dispatch.ts:175-177 runs restoreModel in a finally with no catch. clone-scan on the bridge file finds no clone groups, and the restore-failed grep over the bridge tests is 0. The cost is real: bug 0372's Non-goals say the bridge "is not assessed here", and bug 0491 items 3 and 7 gave the two ways re-attempt+diagnostic vs bare restore in one fix. No duplicate in intake, issues or resolved (d1-02 pic19 is a different root cause). Caveat for the ruling: PIC-8 (tool-registration-lifetime.md#pic-8) scopes itself to "the prompt-mode and prompt → prompt cross-mode invoke snapshot/restore paths in this section", while subagent.md wiring (e) cites only "the PIC-17 snapshot/restore protocol". So whether PIC-8/PIC-8-model's restore-failure posture binds the bridge is itself unsettled in the spec (triage: claude-opus-5-5)
