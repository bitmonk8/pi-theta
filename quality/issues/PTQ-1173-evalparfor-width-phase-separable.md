---
id: PTQ-1173
title: evalParFor runs 209 LOC across five phases; the 69-LOC CTRL-2 width-resolution phase touches none of the worker pool's shared locals
lens: D9
status: open
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:2134-2342
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts#evalParFor
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# evalParFor runs 209 LOC across five phases; the 69-LOC CTRL-2 width-resolution phase touches none of the worker pool's shared locals

## Observation
`evalParFor` (src/runtime/statement-executor.ts:2134-2342, 209 LOC — strong
band) implements the RFC 0003 `par for` fan-out: iterand snapshot, in-flight
width resolution, entry-cancel guard, a bounded worker pool, and the
cancel/diagnostics/collect epilogue. The width-resolution phase (CTRL-2 with
its bug 0325/0326/0438 clamp-and-diagnose ladder) writes exactly one local
(`width`) consumed once by `workerCount` at line 2258.

## Evidence
Step inventory (anchors verified in the current file):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| CTRL-1 iterand snapshot (pure vs effect path, kind gate) | 2134-2164 | 31 | expr, env, deps; iterandValue, snapshot |
| CTRL-2 width resolution (non-finite/non-integer/non-number clamps + diagnostics) | 2165-2233 | 69 | expr.max, env, deps; width |
| entry state + CTRL-5 pre-flight cancel guard | 2235-2251 | 17 | deps.signal; n, results, childDiagnostics, wholeThetaCancelled, nextIndex |
| worker pool fan-out (synchronous index claim, EXST-3 lanes) | 2253-2306 | 54 | width, n, snapshot, results, childDiagnostics, wholeThetaCancelled, nextIndex, laneSet, workerCount |
| cancel/diagnostics/collect epilogue (CTRL-3/CTRL-5) | 2308-2342 | 35 | wholeThetaCancelled, deps, childDiagnostics, results, n |

Width phase head (statement-executor.ts:2170-2173):

```ts
  let width = PAR_FOR_THROTTLE;
  if (expr.max !== null) {
    const maxResult = await evalExpr(expr.max, env, deps);
    if (maxResult.flow !== "value") {
```

The pool phase's shared locals (`results`, `childDiagnostics`,
`wholeThetaCancelled`, `nextIndex`, `laneSet`, `workerCount`) are never read or
written by the width phase; its only output is `width`.

## Why this is a problem
Strong band (209 LOC >= 200) carries a presumption of breakdown. Reasons
considered and defeated: single algorithm with shared local state — the worker
pool phase does genuinely share 6+ locals internally, but the claim fails for
the function as a whole: the 69-LOC width phase reads `(expr.max, env, deps)`
and yields one number, so extracting it threads 3 values, not 6; closed
enumeration — the clamp ladder is a value-classification if-chain, not a
spec-table dispatch; data-only / grammar / generated — no. Strong reasons: the
CTRL-1..CTRL-5 clauses are an ordered step sequence, but a
`resolveParForWidth` helper call preserves the order without interleaving any
observable step (the diagnostics it emits stay at the same program point); no
measured cost; no reverted split; no exemptions entry.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: CTRL-2 width resolution (2165-2233) ->
`resolveParForWidth(max, env, deps)` in-file helper returning
`{ width } | EvalResult` (hypothesis) — 69 LOC, 0 exported symbols, 0 external
importers, 1 back-reference (`evalExpr` for the max operand). Seam B: the
epilogue's diagnostics drain + collect (2320-2342) -> `collectParForResults`
helper (hypothesis) — ~23 LOC, 0 exports, 0 back-references. The pool phase
itself stays whole (its shared-local claim holds there).

## False-positive check
Band check: 209 LOC per the map. Reasons-considered list above; the
shared-local defeat is counted (width phase writes 1 local; pool phase locals
listed by name). Exemptions check: no
`src/runtime/statement-executor.ts#evalParFor` key in quality/exemptions.json.
Generated-code check: hand-written with bug citations (0325/0326/0369/0438).
Spec-mirror check: CTRL-1..CTRL-5 are ordered obligations, not an enumeration
whose length this function mirrors.

## Triage
verdict: questionable — accounting verified: size-scan map confirms evalParFor 2134-2342 = 209 LOC strong band with no exemptions.json key; the 69-LOC CTRL-2 width phase (2165-2233) reads only expr.max/env/deps and writes only `width`, consumed once at line 2258, while the six pool-phase locals are all declared after it (2245-2259), so the shared-local defence holds only for the pool; no reverted prior split (git -S resolveParForWidth empty) and sibling intake d9-01 is a module-level host, not a duplicate — the seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map reproduces `2134-2342 | 209 | evalParFor | exempt: no | 0/0` (FN strong ≥ 200) with no statement-executor key in quality/exemptions.json; CTRL-2 phase 2165-2233 reads only expr.max/env/deps and writes only `width` (one EvalResult passthrough at 2174), read once at 2258, while all six pool locals are declared after it at 2245-2259; control-flow.md CTRL-2 and the bug-0369 comment pin only ordering, which a helper call preserves; git -S resolveParForWidth/collectParForResults empty; sibling d9-01 keys the file-level host and d9-06 targets runParForIteration, so no duplicate — the seam shape is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces `2134-2342 | 209 | function | evalParFor | no | 0/0` (FN strong ≥ 200) and quality/exemptions.json has no statement-executor key; excerpt at 2170-2173 is byte-exact; a grep of 2165-2233 for the six pool locals (results/childDiagnostics/wholeThetaCancelled/nextIndex/laneSet/workerCount) returns only two comment mentions of `n`, all six are declared after the phase at 2245-2259, and `width` has one read at 2258, so the ≥ 6-shared-locals reason covers only the pool sub-range, not the function; clamp ladder is a value-classification chain, not a spec-table dispatch; the CTRL-2/bug-0369 comments pin ordering only, which an in-place helper call preserves; git log -S resolveParForWidth/collectParForResults empty (no reverted split); dedupe: same-wave d9-01 keys the file host, d9-02 #evalExpr, d9-06 #runParForIteration, and PTQ-1133 is a parser-side D4 clone — different root causes; D9 breakdown never confirms, the seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
