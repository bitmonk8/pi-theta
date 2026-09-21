---
id: PTQ-1191
title: runParForIteration bundles a 49-LOC iteration-host wrapper (diagnostics capture + runtime-tool backstop) with body execution and outcome mapping in 131 LOC
lens: D9
status: fixed
verdict: confirmed
locations:
  - src/runtime/statement-executor.ts:1991-2121
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/runtime/statement-executor.ts#runParForIteration
d9_band: justify
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# runParForIteration bundles a 49-LOC iteration-host wrapper (diagnostics capture + runtime-tool backstop) with body execution and outcome mapping in 131 LOC

## Observation
`runParForIteration` (src/runtime/statement-executor.ts:1991-2121, 131 LOC —
justify band) runs one `par for` element: it binds the iteration variable,
constructs a wrapping `StatementEvalHost` that captures per-effect
`childDiagnostics` and implements the RFC 0011 §6.4 runtime-tool backstop,
executes the body with the ERR-20 boundary downgrade, then maps the resulting
`Flow` into a `ParForIterationOutcome`.

## Evidence
Step inventory (anchors verified in the current file):

| phase | lines | LOC | locals read/written |
|---|---|---|---|
| scope bind + iteration-host wrapper (RFC 0003 (A) capture, RFC 0011 §6.4 backstop) | 2001-2049 | 49 | expr, element, env, deps; scope, collectedDiagnostics, iterationHost, iterationDeps |
| body run + ERR-20 boundary downgrade (HostFatal rethrow, panic frame, Err element) | 2050-2086 | 37 | expr, env, deps, collectedDiagnostics; flow |
| Flow -> ParForIterationOutcome mapping (CTRL-5 cancel split) | 2088-2121 | 34 | flow, deps.signal, collectedDiagnostics |

Host-wrap head (statement-executor.ts:2006-2010):

```ts
  const iterationHost: StatementEvalHost = {
    evaluatePure: (e, en, chain) => baseHost.evaluatePure(e, en, chain),
    checkpointFor: (e) => baseHost.checkpointFor(e),
    runEffect: async (e, en, args, chain) => {
```

The wrapper phase's only coupling to the later phases is the
`collectedDiagnostics` array it closes over.

## Why this is a problem
Justify band carries a presumption of breakdown unless a concrete reason is
recorded. Reasons considered and defeated: closed-enumeration dispatch — only
the 34-LOC tail switch mirrors the closed Flow set; the 49-LOC host wrapper is
not an enumeration; single algorithm with shared local state — extracting the
wrapper threads exactly 2 values (`baseHost`, the `collectedDiagnostics` sink),
and the tail mapping threads 3 (`flow`, `deps.signal`, `diagnostics`), both
below the 6-local bar; data-only / grammar production / generated — no. No
exemptions entry for this host key. The wrapper additionally mixes two
sub-duties (diagnostics transport capture and the session-control-tool
refusal), each with its own RFC citation.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: iteration-host wrapper (2005-2048) ->
`makeParForIterationHost(baseHost, diagnosticsSink)` in-file helper
(hypothesis) — 44 LOC, 0 exported symbols, 0 external importers, 0
back-references beyond `StatementEvalHost`. Seam B: Flow mapping (2088-2121)
-> `parForOutcomeOf(flow, signal, diagnostics)` helper (hypothesis) — 34 LOC,
0 exports, back-references `makeOk`/`makeErr`/`makeCancelledError`.

## False-positive check
Band check: 131 LOC (justify) per the map. Reasons-considered list above with
counted defeats (extraction parameter counts stated per phase). Exemptions
check: no `src/runtime/statement-executor.ts#runParForIteration` key in
quality/exemptions.json. Generated-code check: hand-written, RFC/bug annotated
(RFC 0003/0011, bugs 0396/0476). Spec-mirror check: ERR-20 and CTRL-5 name the
downgrade and cancel obligations of single phases, not an enumeration spanning
the function.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces 131 LOC / justify band at 1991-2121, no exemptions key, three phases confirmed distinct (wrapper object 2006-2047 closes over only baseHost + collectedDiagnostics; tail switch reads only flow/deps.signal/diagnostics), no overlooked concrete/strong reason (no prior split in git -S, closed-enum applies to the 34-LOC tail only), d9-01 sibling is the file-level host key not this function; target shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified independently: size-scan map re-run gives `1991-2121 | 131 | function | runParForIteration | no | 0/0` (FN justify 100-200) and quality/exemptions.json has no statement-executor row; the three inventory rows are real distinct phases — the wrapper object 2006-2047 closes over only `baseHost` + `collectedDiagnostics`, the try/catch 2051-2086 writes only `flow`, and the tail switch 2093-2120 reads only `flow`/`deps.signal`/`diagnostics` plus module-level `makeOk`/`makeErr`/`makeCancelledError`; no overlooked reason (closed-enum covers only the 34-LOC Flow switch, CTRL-5/ERR-20 pin behaviour not same-function structure, `git log -S iterationHost` shows one introducing commit 00c18149 and no prior `makeParForIterationHost`/`parForOutcomeOf` ever existed); siblings d9-01 (`d9_host` = file) and d9-03 (`#evalParFor`) are different hosts, not duplicates — D9 breakdown caps at questionable, the seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified: size-scan map re-run reproduces `1991-2121 | 131 | function | runParForIteration | no | 0/0` (FN justify 100-200) and quality/exemptions.json has no statement-executor row; excerpt at 2006-2009 is byte-exact; the three inventory rows are distinct phases with 3 locals crossing wrapper→body (scope, collectedDiagnostics, iterationDeps) and 2 crossing body→tail (flow, collectedDiagnostics), below the 6-shared-locals bar; no overlooked reason (closed-enum is only the 34-LOC Flow switch, control-flow.md#ctrl-5 pins downgrade/cancel behaviour not single-function structure, `git log -S` shows one introducing commit 00c18149 and no reverted split); no PTQ row names this function and siblings d9-01 (file key) / d9-03 (#evalParFor) are different hosts — target seam shape needs a human ruling (triage: claude-fable-5-1)
verdict: confirmed — RATIFIED (human, 2026-09-21): accepted as confirmed - batch ruling, all D4/D9 intake items accepted.
