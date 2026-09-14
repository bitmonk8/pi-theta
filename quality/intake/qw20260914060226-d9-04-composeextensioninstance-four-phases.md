---
id: pending
title: composeExtensionInstance builds four independently-nameable per-instance collaborators inline in one 284-line function
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1689-1972
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#composeExtensionInstance
d9_band: strong
wave: qw20260914060226
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# composeExtensionInstance builds four independently-nameable per-instance collaborators inline in one 284-line function

## Observation
`composeExtensionInstance` (`src/extension/production-composition.ts:1689-1972`) is 284 LOC — strong band, 1.4x the 200-LOC strong-function threshold. Its doc comment states its job as "run the initial discovery + compose pass over a single runtime root, then expose the step-5 watcher installer." The body constructs four largely-independent pieces of per-instance infrastructure inline (a diagnostic-note channel, the shared invocation/status-bus state, the initial pass plus registry, and the hot-reload closure) rather than delegating any of them to a named helper.

## Evidence
Step inventory (phase | lines | LOC | locals read/written):

| phase | lines | LOC | locals |
|---|---|---|---|
| Diagnostic channel + load-note routing | 1718-1784 | 67 | `emitToast`, `channel`, `preEvalRouter`, `emitLoadNoteGroup`, `emitLoadNote`, `loadSink` |
| Runtime root + per-instance shared state (invocations/forwarding/status-bus) | 1785-1857 | 73 | `root`, `activeInvocations`, `forwardingSignals`, `statusSinks`, `statusBus` |
| Initial compose pass + watch-root/registry seeding | 1858-1904 | 47 | `emitErr7`, `initial`, `settingsPaths`, `roots`, `latestWatchRoots`, `registry` |
| Returned wiring object + hot-reload closure (`rediscover`/`currentWatchRoots`/`probeRuntime`) | 1905-1971 | 67 | closes over nearly every local above, plus `latestWatchRoots` (mutated) |

Excerpt, the function's own boundary (lines 1689-1700):
```ts
export async function composeExtensionInstance(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  overrides?: ComposeSeamOverrides,
  rendererGate?: RendererGate,
  // Bug 0024 (registration-steps.md#pic-69): the LIVE own-registration ledger
  // owned by the factory closure (`factory.ts`) — an alias, not a snapshot, so
  // every pass this call arms (the initial pass below AND every later
  // hot-reload rediscover pass) reads whatever names are registered as of
  // THAT pass, including ones this same call's own initial pass or a prior
  // generation registered. A caller that omits it (one constructing no
  // factory, and so holding no ledger) supplies no own-name exclusion to the
```
Excerpt, phase 2's UI-surface probing (lines 1819-1827, representative of the 39-line status-sink block):
```ts
  const statusSinks: StatusSink[] = [];
  if (
    typeof (ctx.ui as unknown as Partial<FooterUi> | undefined)?.setStatus === "function" ||
    typeof (ctx.ui as unknown as Partial<FooterUi> | undefined)?.setWorkingMessage ===
      "function"
  ) {
    statusSinks.push(
      createFooterSink({
        setStatus: (key, text) => {
```

## Why this is a problem
Strong band (284 LOC): filed unless a strong concrete reason is on record. Reasons considered and defeated:
- Single algorithm with shared local state — the four phases are not one algorithm: phase 1 (diagnostic channel) and phase 2's status-bus construction share no locals with each other; both feed the phase-4 closure only as pre-built collaborators, which is exactly the shape a set of named builder functions returning those collaborators would also produce. `root`, `activeInvocations`, `forwardingSignals`, `statusBus` are shared *because the closure needs references to them*, not because building them requires one shared computation — a `buildInstanceDiagnostics(...)`, `buildInstanceState(root)`, and `buildStatusBus(ctx, root.clock, latchStatusBus)` extraction would hand the same object references to the closure with no behavior change.
- Closed-enumeration dispatch — no; the two UI-surface `typeof` probes (footer, widget) are two short independent capability checks, not arms of one spec-named closed set requiring co-location with the rest of the function.
- Data-only / grammar-production-family / generated-code — not applicable.
- Strong-only, spec-cited ordered critical section where a seam would interleave observable steps — the doc comment explains *why* collaborators are shared (so "the armed watcher and the 250 ms debounce measure against the same seams the initial pass used"), which is an argument for passing the same references forward, not for keeping the construction code inline in one function body; extracting named builders called in sequence preserves reference identity and call order identically.
- Strong-only: measured cost, prior reverted split, human ruling — none cited; `quality/exemptions.json` carries no `production-composition.ts#composeExtensionInstance` key.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven:
- Seam A: extract the diagnostic-channel phase (1718-1784, 67 LOC) into `buildInstanceDiagnosticSink(pi, ctx, rendererGate, entryChannel)` (hypothesis), returning `{ channel, loadSink }`.
- Seam B: extract the status-bus/UI-probe phase (1803-1857, ~55 LOC of the 73-LOC phase 2) into `buildInstanceStatusBus(ctx, clock, latchStatusBus)` (hypothesis), returning the constructed `statusBus`.
- Seam C: extract the hot-reload closure (1905-1971, 67 LOC) into its own factory taking the phase outputs as parameters, e.g. `buildHotReloadWiring(...)` (hypothesis) — this is the same shape `installHotReload` (imported from `./reload-wiring`) already takes today, so the closure here would become a thin adapter rather than 67 lines of inline closure body.

## False-positive check
Band: strong (284 LOC, function line in the structural map). Reasons-considered list above, each defeated with a line-cited count. Exemptions check: `quality/exemptions.json` has no `production-composition.ts#composeExtensionInstance` entry. Generated-code check: no generation markers in the file. Spec-mirror check: the function's doc comment cites `registration-steps.md#watcher-hot-reload-registration`, RFC 0010 (EXST-2), PIC-36, and PIC-73 — four different spec references for four different phases, not one closed enumeration mirrored once.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting verified: size-scan.mjs reproduces composeExtensionInstance at 1689-1972, 284 LOC, band strong; both cited excerpts (1689-1700, 1819-1827) match verbatim; the 4-phase inventory's newly-introduced locals are genuinely disjoint per phase (emitToast/channel/preEvalRouter/emitLoadNote(Group)/loadSink; root/activeInvocations/forwardingSignals/statusSinks/statusBus; emitErr7/initial/settingsPaths/roots/latestWatchRoots/registry; the return object + hot-reload closure); no quality/exemptions.json entry, no generated-code marker, no reverted-split precedent in git log — but two supporting claims don't hold: `registration-steps.md#watcher-hot-reload-registration` is cited in the ADJACENT ExtensionInstanceWiring interface's doc comment (1608-1615), not this function's own (1680-1688), and PIC-73 IS itself a spec-named "frozen list" (closed enumeration, capability-probe.md#pic-73) the filing's closed-enumeration-dispatch dismissal wrongly denies exists — though that reason only protects the two if-blocks staying together (Seam B's own hypothesis already keeps them as one unit), so it does not rescue the whole function; per D9 policy an accurate breakdown accounting is never confirmed, only human-ruled (triage: claude-opus-5)
