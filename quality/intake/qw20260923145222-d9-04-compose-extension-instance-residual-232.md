---
id: pending
title: composeExtensionInstance remains 232 LOC (strong band) after the PTQ-1439 extractions, with the construct-once sequence and the wiring closure in one body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2428-2659
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#composeExtensionInstance
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# composeExtensionInstance remains 232 LOC (strong band) after the PTQ-1439 extractions, with the construct-once sequence and the wiring closure in one body

## Observation
The map places `composeExtensionInstance` at 2428-2659, 232 LOC, band strong
(function threshold >= 200), exported with 1/25 importers. PTQ-1160 and
PTQ-1439 (both resolved/fixed) already extracted makeLoadNoteSink,
wireRunCardSink and dialParentResultChannel (347 -> 232 LOC). The residual is
the extension-instance construct-once sequence, the initial compose pass, and
the returned wiring literal whose `installHotReload` closure the map itself
lists as a 62-LOC zone-band nested function (2596-2657).

## Evidence
Step inventory (anchors re-read at HEAD):

| phase | lines | LOC | reads -> writes |
|---|---|---|---|
| signature + params | 2428-2463 | 36 | 9 params |
| toast + channel + load sink | 2465-2485 | 21 | ctx, pi, rendererGate, entryChannel -> emitToast, channel, resultChannel(let), loadSink, emitLoadNote |
| runtime root + instance registries | 2487-2514 | 28 | ctx, overrides, runCardView -> root, activeInvocations, forwardingSignals, statusSinks, statusBus |
| ERR-7 alias + control plane + channel dial | 2516-2538 | 23 | overrides, root.clock, activeInvocations -> emitErr7, instanceControlPlane, resultChannel |
| initial compose pass (16-arg call) | 2539-2556 | 18 | 14 locals/params -> initial |
| watch roots + settings paths + registry | 2558-2594 | 37 | initial, ctx, root.fileSystem -> settingsPaths, roots, latestWatchRoots(let), registry |
| return wiring literal incl. installHotReload closure | 2595-2659 | 65 | >= 14 captures -> ExtensionInstanceWiring |

Excerpt (2539-2545):
```ts
  const initial = await runComposePass(
    pi,
    ctx,
    root,
    loadSink,
    activeInvocations,
    forwardingSignals,
```

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required.
Reasons considered: (1) single algorithm with >= 6 shared locals — real for
the tail: the runComposePass call consumes 12 constructed locals and the
return literal consumes 10, so a whole-body split is expensive; but the
`installHotReload` rediscover closure (2596-2657, 62 LOC, zone band by the
map) captures a bounded, nameable set (pi, ctx, root, emitErr7,
activeInvocations, forwardingSignals, ownRegisteredNames, registry, overrides,
rendererGate, entryChannel, statusBus, inProcessTools, instanceControlPlane,
resultChannel, latestWatchRoots) that is exactly the ComposeSeamOverrides +
pass-argument set — a rediscover-context object mirrors ComposeOneThetaDeps,
which the PTQ-1438 fix already demonstrated on this file. (2) spec-cited
critical section — Decision 6 B1/B2 and EXST-2 pin that the registries and
bus are constructed once per instance and shared; a construction helper
returning the same instances preserves identity (same verification recorded
in the PTQ-1160/1439 triage notes). (3) measured cost / reverted split — none;
the PTQ-1439 extractions landed and stuck. (4) exemptions.json — no key for
this host. (5) generated — no markers.

## Suggested direction (non-binding, optional)
Seam A: the rediscover closure body -> a top-level makeRediscoverPass(deps)
beside installHotReload's other collaborators (hypothesis) — ~50 LOC, 0
exports moved, one deps object (the capture list above), cross-reference back
to runComposePass only. Seam B: the construct-once cluster (2465-2514) ->
buildInstanceCore(pi, ctx, overrides, rendererGate, entryChannel, runCardView)
(hypothesis) — ~49 LOC returning {channel, loadSink, root, activeInvocations,
forwardingSignals, statusBus}. All unproven; the human ratifies.

## False-positive check
Band: strong (232 >= 200, map-quoted). Reasons-considered list with defeating
evidence above. Exemptions check: quality/exemptions.json has no
production-composition key. Generated-code check: 0 markers. Spec-mirror
check: no closed-enumeration table. Duplicate check: PTQ-1160 and PTQ-1439
are resolved (fixed); no open issue carries this d9_host — residual-after-fix
filing per the PTQ-1439 precedent (itself a residual of PTQ-1160).

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map --files` reproduces `composeExtensionInstance — 2428-2659 — 232 LOC — band strong` (FN strong ≥ 200) with the nested `installHotReload — 2596-2657 — 62 LOC — zone`; quality/exemptions.json's four keys carry no production-composition or composeExtensionInstance entry; the excerpt is verbatim at 2539-2545 and every inventory anchor lands within 0-2 lines (emitToast 2467, channel 2476, `let resultChannel` 2480, loadSink 2481, root 2488, activeInvocations 2496, forwardingSignals 2505, statusSinks/statusBus 2513-2514, emitErr7 2524, instanceControlPlane 2529, dial 2531, initial 2539, settingsPaths 2568, latestWatchRoots 2579, registry 2583, return 2587, rediscover 2608, close 2659; 109 comment lines, 0 generated markers); the three claimed prior extractions exist (`makeLoadNoteSink` 2662, `wireRunCardSink` 2736, `dialParentResultChannel` 2787) and the `ComposeOneThetaDeps` precedent is real at 1722; the 7-row inventory separates at least two nameable concerns (the construct-once chain rows 2-4 vs. the return-wiring/rediscover closure row 7) with reads→writes honestly recorded; no reason overlooked — the ≥6-shared-locals reason is live for the whole body (loadSink/root/activeInvocations/resultChannel/statusBus/instanceControlPlane thread through rows 2-7 and the rediscover closure captures 16) and prior PTQ-1160/1439 triage conceded the wiring closure keep-whole, so whether a 16-field deps object (the PTQ-1438 shape) defeats that reason for Seam A, and whether Seam B's chain is worth a bundle-returning helper, is precisely the design ruling reserved for the human; Decision 6 B1/B2 + EXST-2 pin construct-once identity, not intra-function placement (same as the four prior rulings on this host); not a duplicate — PTQ-1160 and PTQ-1439 are both status fixed in quality/resolved/ and quality/issues/ holds no `#composeExtensionInstance` d9_host, so this is a residual-after-fix filing per the PTQ-1439/1284/1287 precedent; never confirmed for a D9 breakdown (triage: claude-fable-5-1)
verdict: questionable — accounting verified: I re-ran size-scan and it reproduces composeExtensionInstance 2428-2659, 232 LOC, band strong (FN strong ≥ 200), plus the nested installHotReload 2596-2657 at 62 LOC in zone; the 2539-2545 excerpt is verbatim and the inventory anchors hold (emitToast 2467, channel 2476, let resultChannel 2480, root 2488, activeInvocations 2496, statusBus 2514, emitErr7 2524, dial 2531, initial 2539, settingsPaths 2568, registry 2583, return 2587, rediscover 2608); the prior extractions makeLoadNoteSink/wireRunCardSink/dialParentResultChannel exist at 2662/2736/2787 and ComposeOneThetaDeps exists at 1722; exemptions.json has no key for this host; the reasons-considered list overlooks nothing, since the ≥6-shared-locals reason is argued and the Decision 6/EXST-2 passages pin construct-once identity, not placement; not a duplicate, because PTQ-1160 and PTQ-1439 are in quality/resolved and no quality/issues file carries this d9_host; the ~50-LOC figure for Seam A is high (the rediscover closure spans 2608-2643, about 36 lines, mostly a second 16-arg runComposePass call), but the seam is non-binding, and a D9 target shape needs a human ruling (triage: claude-opus-5-5)
