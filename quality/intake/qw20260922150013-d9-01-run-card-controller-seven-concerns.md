---
id: pending
title: createRunCardController is a 382-LOC closure bundling card-state eviction, TUI-handle/OSC-11 wiring, heat-LUT caching, seed decoding, the live card component, the renderer entry, and the animation sink
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/execution-status/run-card-renderer.ts:247-628
  - src/extension/execution-status/run-card-renderer.ts:389-527
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/execution-status/run-card-renderer.ts#createRunCardController
d9_band: strong
wave: qw20260922150013
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# createRunCardController is a 382-LOC closure bundling card-state eviction, TUI-handle/OSC-11 wiring, heat-LUT caching, seed decoding, the live card component, the renderer entry, and the animation sink

## Observation
`createRunCardController` (src/extension/execution-status/run-card-renderer.ts:247-628, 382 LOC per the structural map) is in the strong function band (FN_BANDS strong >= 200). Its nested member `RunCardComponent.#renderLive` (389-527, 139 LOC) is itself in the justify band. The module's role (header, :1-14 region) is the RFC 0015 D5 live run-card renderer: `createRunCardController` returns the `RunCardController` surface (`renderer`, `sink`, `attachTui`) that factory.ts wires into composition. The map records the exported symbol at 1 src / 1 tests importers.

## Evidence
Distinct-concern inventory (line numbers verified by direct read and grep immediately before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| card-state store + LRU-style eviction | `cards`, `cardStateFor` | 251, 259-275 | ~18 |
| TUI handle latch, guarded render request, OSC-11 background query | `tui`, `requestRender`, `attachTui` body | 253, 277-287, 594-627 | ~45 |
| heat-LUT cache keyed on color mode/endpoints | `terminalBg`, `lut`, `lutKey`, `ensureLut` | 254-257, 288-316 | ~32 |
| defensive seed decode + bus node lookup | `readSeed`, `nodeFor` | 318-334, 336-339 | ~21 |
| live card component (frame computation: follow state, child rows, viewport, heat ages, model assembly) | `RunCardComponent` incl. `#renderLive` | 349-527 | 178 |
| renderer entry (degrade-to-static gate) | `renderer` | 530-552 | ~23 |
| animation predicate + status sink | `animationOwed`, `sink` | 554-586 | ~33 |

Excerpt of the closure state block (:250-257):
```ts
  const cards = new Map<string, CardState>();
  const staticFallback = createThetaRunEntryRenderer();
  let tui: TuiRenderHandle | undefined;
  let terminalBg: Rgb | undefined;
  // The LUT and the endpoint key it was built for (rebuild on theme/OSC change).
  let lut: readonly string[] | undefined;
  let lutKey: string | undefined;
```
The state partitions along the concern rows: the LUT concern alone owns `terminalBg`/`lut`/`lutKey`; the TUI concern alone owns `tui`; the store concern alone owns `cards`. `animationOwed` (554-573) reads no closure binding at all — only its `snapshot`/`nowMs` parameters and the imported `HEAT_FADE_MS`.

## Why this is a problem
Strong band: presumption of breakdown unless a strong concrete reason is recorded. Reasons considered and defeated:
- Closed-enumeration dispatch: no switch/if-chain mirroring a spec-named closed set; the body is seven mechanism groups.
- Single algorithm with shared local state: the 6 closure bindings partition per concern (table above); a seam threads function references (`cardStateFor`, `ensureLut`, `requestRender`), not 6+ locals per helper signature, and `animationOwed` threads zero.
- Data-only module / grammar production / generated code: none apply (imperative render code, hand-written).
- Strong reasons: the body's citations (EXST-8 drop posture, PIC-21 degrade analogue) attach to individual helpers, not to one ordered step sequence a seam would interleave; no measured cost, no reverted split (`git log` shows no prior extraction of this controller), no `quality/exemptions.json` entry for this host.
Nested `#renderLive` (389-527, justify band) is dispositioned here as part of the same host: kept whole below the component seam — its phases (guard/snapshot, current-site, follow, child rows, viewport+heat, model assembly) thread 8 shared locals (`clock`/`now`, `node`, `snapshot`, `state`, `heat`, `currentSite`, `displayedFile`, `homeFile`), meeting the single-algorithm-with-shared-state reason inside the seam-A module.

## Suggested direction (non-binding, optional)
All hypotheses unproven; the human ratifies one. Seam A: `RunCardComponent` + `readSeed` + `nodeFor` + the `renderer` closure -> `render/run-card-component.ts` (hypothesis) — ~230 LOC, 0 exported symbols gain external importers (renderer factory takes a small deps record), cross-references back into the host: `cardStateFor`, `ensureLut`, `staticFallback`. Seam B: heat-LUT cache (`terminalBg`/`lut`/`lutKey`, `ensureLut`, OSC-11 resolution arm of `attachTui`) -> `render/heat-lut-cache.ts` (hypothesis) — ~50 LOC, 0 external importers, cross-reference: `requestRender` on background resolve. Seam C: `animationOwed` hoisted to a module-level pure function — ~21 LOC, no closure references, 0 cross-references.

## False-positive check
Band confirmed from the authoritative map (382 LOC, strong). Reasons-considered list above with defeating evidence per reason. Exemptions check: `quality/exemptions.json` read — no key for run-card-renderer.ts or this function. Generated-code check: hand-written file, no generator banner. Spec-mirror check: RFC 0015 / EXST citations in comments name postures per helper, not a closed enumeration whose arm count explains the length. Duplicate check: no existing PTQ or intake file names this host (grep over quality/ for createRunCardController: only this wave's D2/D8 filings on other symbols in the file).

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 247-628 / 382 LOC strong (and #renderLive 389-527 / 139 justify); every cited member range and the 250-257 state excerpt match byte-for-byte; the six closure bindings partition as tabled (`cards`→cardStateFor, `tui`→requestRender/sink/attachTui, `terminalBg`/`lut`/`lutKey`→ensureLut plus the OSC-11 resolve arm of attachTui that the filing already assigns to Seam B, `staticFallback`→component/renderer) and `animationOwed` reads no closure state, so no helper threads ≥ 6 shared locals; no spec-table switch, hand-written, no exemptions.json key, git log shows only the D5 landing + D6 supersession (no reverted split); importers 1 src (factory.ts:500) / 1 test reproduce; the sibling D8 filing on the same d8_host is a different root cause (double snapshot per frame), no PTQ names this host — target seam shape (A/B/C) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified independently: size-scan map reproduces createRunCardController 247-628 / 382 LOC band strong and RunCardComponent.#renderLive 389-527 / 139 justify; every inventory row's member range and the 250-257 state excerpt match the current file verbatim; the seven rows are real distinct member groups whose closure bindings partition (cards→cardStateFor only; tui→requestRender/sink/attachTui; terminalBg/lut/lutKey→ensureLut + the OSC-11 resolve arm; staticFallback→component/renderer; animationOwed reads no closure binding) so no cross-helper single-algorithm reason with ≥ 6 shared locals applies, no closed-enumeration switch, hand-written, not data-dominated; quality/exemptions.json has no run-card-renderer key; git log shows only e4c4f5d5 (D5 landing) and bde73af5 (D6 supersession), no reverted split; importers reproduce at factory.ts:41/500 and tests/execution-status-run-card-renderer.test.ts:15/84 (1 src / 1 tests); no PTQ in quality/resolved or open names this host (only PTQ-1241 on endpoint-ladder and the sibling D8 double-snapshot filing on #renderLive, a different root cause) — a breakdown's seam shape is a design decision for a human ruling, never confirmed (triage: claude-fable-5-1)
