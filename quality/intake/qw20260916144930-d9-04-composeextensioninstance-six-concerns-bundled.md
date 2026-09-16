---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: composeExtensionInstance bundles six independently-spec-cited instance-setup concerns in one 328-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:1970-2297
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/production-composition.ts#composeExtensionInstance
d9_band: strong
wave: qw20260916144930
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# composeExtensionInstance bundles six independently-spec-cited instance-setup concerns in one 328-line function

## Observation
`composeExtensionInstance` (`src/extension/production-composition.ts:1970-2297`) is 328 LOC — strong band (>= 200 LOC). It is exported with 1 src importer (`factory.ts`) and 23 test importers per the structural map. Its own doc comment states one job — "run the initial discovery + compose pass over a single runtime root, then expose the step-5 watcher installer" — but the body constructs six independently-spec-cited subsystems end to end: the load-diagnostic/pre-evaluation notification channel, the runtime root plus instance-scoped shared registries, the execution-status bus (with inline footer/widget UI-surface probing), the result-channel/control-plane connection, the initial `runComposePass` invocation, and the watch-root/registry finalisation that installs the hot-reload closure (itself a separately-listed 62-LOC nested function at lines 2234-2295, entirely inside this range).

## Evidence
Distinct-concern inventory (concern | members/phase | line ranges | LOC):

| concern | phase | line ranges | LOC |
|---|---|---|---|
| Load-diagnostic channel & pre-evaluation routing (PIC-54, V4e, error-model.md, bug 0013/0023) | `emitToast`, `channel` (`buildSystemNoteDeps`), `preEvalRouter`, the `resultChannel` forward-declaration, `emitLoadNoteGroup`/`emitLoadNote`/`loadSink` | 2003-2078 | 76 |
| Runtime root & instance-scoped shared registries (Decision 6 / Increment B1-B2) | `root` (`buildRuntimeRoot`), `activeInvocations`, `forwardingSignals` | 2079-2112 | 34 |
| Execution-status bus construction (RFC 0010 EXST-2, PIC-73) | footer/widget UI-surface probing into `statusSinks`, `createExecutionStatusBus`, `latchStatusBus` | 2113-2152 | 40 |
| Result-channel & control-plane wiring (RFC-0012 §2/§3) | `emitErr7`, `instanceControlPlane`, `launch`, `resultChannel = connectResultChannel(...)` | 2153-2176 | 24 |
| Initial compose-pass invocation | the 15-argument `initial = await runComposePass(...)` call | 2177-2205 | 29 |
| Watch-root/registry finalisation & hot-reload closure installation (PIC-36, bug 0312/0018/0471, PIC-67) | `settingsPaths`, `roots`, `latestWatchRoots`, `registry` (`ThetaRegistry`), the returned wiring object's `installHotReload(reRegister)` method (nested `rediscover` closure re-invoking `runComposePass`) | 2206-2297 | 92 |

6 rows, 295 of the function's 328 LOC (90%); the remaining 33 LOC is the parameter list and its per-parameter doc comments (1970-2002).

The channel/pre-eval concern ends and the runtime-root/registries concern begins with no data in common beyond `ctx`/`root.clock` themselves:

`src/extension/production-composition.ts:2070-2088`
```ts
  const loadSink: LoadDiagnosticSink = {
    emit: emitLoadNote,
    emitGroup: emitLoadNoteGroup,
  };

  // The single-diagnostic handle outlives the pass (the `AjvSchemaValidator`
  // seam retains it)...
  const root = buildRuntimeRoot(ctx, emitLoadNote, overrides);

  // Decision 6 / Increment B1 (active-invocation-registry.md): ONE
  // extension-instance-scoped registry of in-flight invocations...
  const activeInvocations = new ActiveInvocationRegistry();
```

The final concern folds the map's separately-listed nested `installHotReload` (2234-2295) into this same function's return statement:

`src/extension/production-composition.ts:2225-2239`
```ts
  return {
    thetas: initial.thetas,
    registry,
    activeInvocations,
    forwardingSignals,
    activeRoots: initial.activeRoots,
    clock: root.clock,
    statusBus,
    ...(resultChannel !== undefined ? { resultChannel } : {}),
    installHotReload(reRegister): HotReloadHandle {
      return installHotReload({
        watcher: root.fileWatcher,
        clock: root.clock,
        roots,
```

## Why this is a problem
Strong band (328 LOC): filed unless a strong concrete reason is on record. Reasons considered and defeated:
- Closed-enumeration dispatch — no; there is no switch/if-chain over a spec-named closed set here at all (the footer/widget probing in concern 3 is two independent `typeof` presence checks, not an enumeration).
- Single algorithm with shared local state — no. Each concern needs only a small, already-identifiable subset of the prior concerns' outputs: the load-channel concern needs `pi`/`ctx`/`rendererGate`/`entryChannel` and a `resultChannel` reference cell; the status-bus concern needs only `ctx`/`root.clock`/`latchStatusBus`; the result-channel/control-plane concern needs only `overrides`/`root.clock`. None of these hypothetical helper signatures would need to carry more than 4-5 explicit parameters — well under the "6 or more locals threaded through every helper signature" bar this repo's own concrete-reason class sets, and each bundle is exactly the kind of "state object" the same reason class treats as the escape hatch when one is needed.
- Data-only module or type family — no; every concern is imperative setup/wiring logic.
- One grammar production family — no; this is instance composition, not a parser production.
- Generated or mechanically derived code — no; `grep -n "@generated|DO NOT EDIT|autogenerated"` over the file returns no hits.
- Strong-only, spec-cited invariant enforced as one critical section / ordered step sequence spanning the whole function — no. The six concerns cite six independent spec/RFC/bug groups (PIC-54/V4e/error-model.md, active-invocation-registry.md, RFC 0010 EXST-2/PIC-73, RFC-0012 §2/§3, the compose-pass call itself, PIC-36/bug-0312/bug-0018/PIC-67); the comments describing why some objects are "constructed beside" others (e.g. `activeInvocations` beside `root`, so both share the instance lifetime) are DATA-dependency notes — sequential helper calls passing return values forward preserve that same order and identity with no interleaving of observable steps.
- Strong-only, measured cost a seam would reintroduce — none cited.
- Strong-only, prior split reverted — `git log --oneline --follow -- src/extension/production-composition.ts` shows only additive commits; no split-then-revert for this function.
- Strong-only, human ruling on record — `quality/exemptions.json` carries no `D9:src/extension/production-composition.ts#composeExtensionInstance` key.

This is a distinct, function-scoped claim from the already-resolved `PTQ-0322`, whose file-level nine-row inventory folded this same LOC into a "Extension-instance + hot-reload wiring" row (347 LOC under the pre-Seam-0 line numbering) without dispositioning it as its own exemption key; the human's ratified/pre-announced seams from that finding (Seam 0, done; Seams A/B'/C, pre-announced but not executed — confirmed by `theta-callee-tools-verification.ts` / `production-bootstrap.ts` not existing in the repo) do not include this function.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, for the human to ratify:
- Seam A: hoist the load-diagnostic channel & pre-evaluation routing (concern 1, 76 LOC) into a helper, e.g. `buildInstanceLoadChannel(pi, ctx, rendererGate, entryChannel, resultChannelRef)` (hypothesis), returning `{ channel, loadSink, emitLoadNote }`.
- Seam B: hoist the execution-status bus construction (concern 3, 40 LOC, the footer/widget probing) into a helper, e.g. `buildInstanceStatusBus(ctx, clock, latchStatusBus)` (hypothesis), mirroring the existing extraction pattern this same file already uses for `buildRuntimeRoot` and `dedupeWatchRootsByIdentity`.
- Seam C: hoist the result-channel & control-plane wiring (concern 4, 24 LOC) into a helper, e.g. `connectInstanceResultChannel(overrides, clock)` (hypothesis), returning `{ instanceControlPlane, resultChannel }`.

## False-positive check
Band: strong (328 LOC, function top-line in the structural map). Reasons-considered list above, each defeated with a cited count or comment. Exemptions check: `quality/exemptions.json` read in full, no matching `D9:...#composeExtensionInstance` key. Generated-code check: no `@generated`/`DO NOT EDIT`/`autogenerated` markers in the file. Spec-mirror check: the six concerns cite six independent spec/RFC/bug groups (listed above), not one enumeration mirrored once. Already-filed check: searched `quality/intake`, `quality/issues`, `quality/resolved` for `composeExtensionInstance` — no existing filing targets this function by its own exemption key; `PTQ-0322` targets the whole file under a different key and its pre-announced seams do not touch this function (confirmed by the seam-target modules' absence from the repo). Not a re-export barrel (no re-exports here) and not a husk (the function is the instance's own live composition entry point, called once per `session_start`/`/reload`, with 1 src + 23 test importers).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan reproduces composeExtensionInstance at 1970-2297/328 LOC/strong band exactly, all six row boundaries and their LOC (76/34/40/24/29/92 summing to 295 + 33 header = 328) verify at the cited lines with excerpts matching verbatim, every cited spec/bug (PIC-54, error-model.md, active-invocation-registry.md, RFC-0010 EXST-2/PIC-73, RFC-0012 §2/§3, PIC-36, bug 0312/0018/0471, PIC-67) is real and present in-source, exemptions.json has no matching key, and git log shows only additive commits (no reverted split); two minor inaccuracies found (importer count is actually 1 src/38 test, not "23 test" — that figure belongs to the sibling ExtensionInstanceWiring interface's row; the runComposePass call has 16 arguments, not 15) but neither affects the core accounting; PTQ-0322's own ratified disposition explicitly defers function-internal shared-state analysis as separate from its file-level split, so this is a distinct, in-scope claim rather than a duplicate; per D9 breakdown policy a verified accounting caps at questionable — target shape is a human ruling, never a triage confirm (triage: claude-opus-5)
