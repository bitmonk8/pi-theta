---
id: pending
title: createRunCardRenderer is a 235-LOC strong-band factory whose body is a nested class definition plus the renderer entry closure
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/execution-status/render/run-card-component.ts:101-335
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/execution-status/render/run-card-component.ts#createRunCardRenderer
d9_band: strong
wave: qw20260922211400
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-22
---

# createRunCardRenderer is a 235-LOC strong-band factory whose body is a nested class definition plus the renderer entry closure

## Observation
`createRunCardRenderer` (src/extension/execution-status/render/run-card-component.ts:101-335) is 235 LOC per the structural map — the strong function band (FN_BANDS strong >= 200). The module is the RFC 0015 D7 / PTQ-1260 Seam A extraction of the live run-card component out of the D5 controller closure (header, :1-6); it landed in commit c5a3d05a. The function's body is the `RunCardComponent` class declared *inside* the factory (so the whole class counts as one function) plus a 24-LOC renderer-entry closure. The map records the exported symbol at 1 src / 0 tests importers.

## Evidence
Step inventory (line numbers verified by direct read immediately before filing):

| phase | line range | LOC | closure state read |
|---|---|---|---|
| nested class fields + ctor | 103-121 | 19 | none (params stored on `this`) |
| `render` degrade guard + `invalidate` | 123-131 | 9 | none |
| `#renderStatic` | 133-140 | 8 | `deps.staticFallback` |
| `#renderLive` frame-model assembly | 142-309 | 168 | `deps.clock/bus/cardStateFor/readSourceBytes/ensureLut` |
| renderer entry closure (seed decode, theme probe, `tracks` gate, construction) | 312-335 | 24 | `deps.bus/clock/staticFallback` |

The only binding the nested class closes over is the single `deps` record (:101, `RunCardComponentDeps`, :76-89); every per-card datum is already a class field:

```ts
export function createRunCardRenderer(deps: RunCardComponentDeps): ThetaRunEntryRenderer {
  class RunCardComponent implements Component {
    readonly #seed: ThetaRunSeed;
    readonly #expanded: boolean;
    readonly #theme: CardThemeSurface;
    readonly #rawEntry: { customType: string; data: unknown };
    readonly #rawTheme: unknown;
```

Reasons considered (strong band requires a strong concrete reason):
- Single algorithm with shared local state — applies to the inner `#renderLive` (142-309, justify band): its phases share 8 locals (`snapshot`, `node`, `now`, `state`, `heat`, `currentSite`, `homeFile`, `displayedFile`), the same accounting the prior wave recorded when it dispositioned `#renderLive` inside PTQ-1260. That keeps `#renderLive` whole, but it does not extend to the strong host: the class-hoist seam threads exactly one binding (`deps`), which the class can carry as one more field.
- Closed-enumeration dispatch — no switch mirrors a spec-named set; the body is sequential model assembly.
- Data-only / grammar production / generated — no (imperative, hand-written extraction; header cites the manual PTQ-1260 Seam A move).
- Strong reasons — quality/exemptions.json has no run-card-component key; no spec-cited critical section (the PIC-21 degrade guard at 123-129 is a try/catch a hoist would not interleave); no measured cost; git log --follow shows only c5a3d05a (the extraction landing) — no prior split reverted.

## Why this is a problem
The strong band carries a presumption of breakdown, and every strong reason class was checked and found absent (see the reasons-considered list above). 211 of the 235 LOC are the nested `RunCardComponent` class, which is inside the factory only to see the single `deps` binding — the nesting inflates one function to the strong band while the actual justify-band work (`#renderLive`, kept whole on its 8 shared locals) already has its own member boundary. PTQ-1260 (resolved) ruled on the *former* controller-closure host, `run-card-renderer.ts#createRunCardController`; this host key was created by that fix and has no ruling of its own.

## Suggested direction (non-binding, optional)
Seam A: `RunCardComponent` class hoisted to module scope with `deps: RunCardComponentDeps` as a constructor parameter/field -> `RunCardComponent` (hypothesis) — 211 LOC, 0 exported symbols moved (class stays module-private), 0 external importers, 1 cross-reference back into the host (`deps`); `createRunCardRenderer` drops to ~24 LOC (the entry closure). No other seam identified; all hypotheses unproven — the human ratifies one.

## False-positive check
Band: 235 LOC / strong reproduced from the shard's authoritative map (101-335), ranges re-read before filing. Reasons considered: all five concrete and four strong classes enumerated above with the evidence defeating each. Exemptions check: quality/exemptions.json has no key for run-card-component.ts or this function. Generated-code check: hand-written (header names the manual PTQ-1260 Seam A extraction). Spec-mirror check: no enumeration in the body mirrors docs/spec_topics or docs/reference tables. Dedupe: PTQ-1260 (resolved, d9_host run-card-renderer.ts#createRunCardController) and PTQ-1256 (resolved, double snapshot) target different hosts/root causes; no intake candidate names run-card-component.ts.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces `#createRunCardRenderer — 101-335 — 235 LOC — band strong` (file band exempt applies to file-level breakdown only; the function host is listed over threshold) and `RunCardComponent.#renderLive — 142-309 — 168 justify`; every inventory row's range (103-121 fields+ctor, 123-131 render/invalidate, 133-140 #renderStatic, 142-309 #renderLive, 312-335 entry closure) matches the current file; grep of the class body confirms the only enclosing-scope binding it reads is `deps` (staticFallback/clock/bus/cardStateFor/readSourceBytes/ensureLut — everything else is `this.#*` or a module import), so the class-vs-entry-closure split is a real 2-concern inventory sharing one binding; the factory itself has a single local so no ≥ 6-shared-locals reason applies at the host (the 8-local reason is inside #renderLive and survives a hoist), no spec-table switch, hand-written, quality/exemptions.json has no run-card-component key, `git log --follow` shows only c5a3d05a (no reverted split); dedupe: PTQ-1260 (resolved) ruled on run-card-renderer.ts#createRunCardController and its ratified Seam A said only "renderer factory takes a small deps record" without ruling on the nested-class shape, PTQ-1256 is a different root cause, no other PTQ or intake names this host — whether to hoist the class is a design decision for a human ruling (triage: claude-fable-5-1)
