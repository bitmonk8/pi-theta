---
id: PTQ-0351
title: checkInvokeStaticResolution's with-clause default-reject and Pi-tool-disjointness phases remain bundled at 348 LOC now that Seam A has landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1150-1497
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/invoke-static-checks.ts#checkInvokeStaticResolution # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260914130212
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# checkInvokeStaticResolution's with-clause default-reject and Pi-tool-disjointness phases remain bundled at 348 LOC now that Seam A has landed

## Observation
This host was previously filed as PTQ-0321 ("checkInvokeStaticResolution
bundles five sequential invoke/tool-call-check phases into one 509-line
function", D9 breakdown, strong band), which the human ratified in part:
"Seam A only... Seams B and C are NOT ratified - D9 re-files after this
lands." Seam A (extracting the `.theta`-callable call-surface loop into a
new function) landed — `checkThetaCallableCallSurface` now exists as its own
module-private function (915-1090, 176 LOC) and is called from inside
`checkInvokeStaticResolution` at 1337-1345. `git log` confirms the landing
commit (`4a31825f quality: qw20260914091051 fix
d9/src__extension__invoke-static-checks.ts`, 195 insertions / 170 deletions,
the sole and most recent commit touching this file). `checkInvokeStaticResolution`
itself is now 1150-1497, 348 LOC (still function band strong, threshold 200)
— 1 src / 4 test importers per the map, sole src caller
`production-composition.ts:1157`. Seams B and C — the two the human
explicitly deferred, not refused — are still present, unchanged in content
and LOC from PTQ-0321's own measurement (62 and 78 LOC respectively), just at
shifted line numbers.

## Evidence
Phase inventory (every boundary re-read verbatim at the cited lines
immediately before filing):

| concern | members | line ranges | LOC |
|---|---|---|---|
| setup: shared call-site walk, one `TypeEnv`/`StaticTypeInferencePass` built once | — | 1150-1185 | 36 |
| `invoke(...)` call-surface: path-escape containment, mode gate, cwd type, arity, per-slot type | invoke-surface `for` loop | 1186-1335 | 150 |
| `.theta`-callable call-surface (Seam A, already landed) | delegated call to `checkThetaCallableCallSurface` | 1337-1345 | 9 |
| with-clause default-reject callee classification (RFC 0009 Erratum A′, INV-8) | default-reject `for` loop | 1347-1408 | 62 |
| Pi-tool provable-disjointness check (bug 0072) | disjointness `for` loop | 1410-1487 | 78 |
| invocation-cycle detection (INV-4) + return | `detectInvocationCycle` call, return | 1489-1497 | 9 |

Seam A's landed result — the call site, lines 1337-1345 (was a 163-line
inline loop before PTQ-0321; now a 9-line delegation):
```ts
    diagnostics.push(
      ...(await checkThetaCallableCallSurface(
        callSites.callExprs,
        callerPath,
        typeEnv,
        typePass,
        { callableSet: deps.callableSet, resolveCalleeArity: deps.resolveCalleeArity },
      )),
    );
```

Seam C candidate start, lines 1347-1354, its own comment naming the rule:
```ts
    // RFC 0009 Erratum A′ (invocation.md INV-8) — the call-site clause's
    // DEFAULT-REJECT callee classification: ONE loop, TWO codes, a three-way
    // verdict against the frozen callable set. The clause is legal on exactly
    // two surfaces, so this loop convicts everything else on the bare-ident
    // call surface: a callee the set classifies `theta` is the legal surface
    // (the mode gate above owns it), a callee it classifies `pi-tool` draws
    // `theta/parse/with-clause-pi-tool`, and EVERY other callee — `subagent
    // fn`, plain `fn`, imported `fn` including re-export chains, locals,
```

Seam B candidate start, lines 1410-1415, its own comment naming the rule:
```ts
    // Bug 0072 — the Pi-tool provable-disjointness check (tool-calls.md
    // §"Provable-disjointness check (parse time)"), a THIRD loop over the SAME
    // `callSites.callExprs` (no new walk; bug 0071 §Fix constraint 3: reuse the
    // shared collection, never fork the walk).
    if (deps.callableSet !== undefined) {
      for (const call of callSites.callExprs) {
```

Phase 5, lines 1489-1497:
```ts
  // INV-4 (invocation.md §Cycle detection): walk the static-resolution graph
  // from this theta; a back-edge un-registers it.
  const cycle = detectInvocationCycle(input.slashName, deps.graph);
  if (cycle !== undefined) {
    diagnostics.push(cycle);
  }

  return diagnostics;
}
```

Setup's five locals every remaining phase reads from, lines 1176-1184:
```ts
    const typeEnv = collectTypeEnv(input.body.statements);
    const typePass = new StaticTypeInferencePass({
      checkCompatible,
      enumNames: collectEnumNames(input.body.statements),
    });

    for (const invoke of callSites.invokeExprs) {
```
(`diagnostics`, `callerPath`, `callSites` are established just above this
excerpt, at 1166-1170.)

## Why this is a problem
Function band strong (348 LOC, threshold 200) — the presumption of breakdown
stands only against a strong concrete reason; PTQ-0321 already worked
through this bar for the pre-Seam-A shape and the same reasoning still
applies to what is left. Reasons considered:
- Closed-enumeration dispatch: the `invoke(...)` phase and the delegated
  `.theta`-callable phase do mirror the two call surfaces tool-calls.md
  §"Argument shape" names together, but the with-clause default-reject
  phase (RFC 0009 Erratum A′) and the Pi-tool disjointness phase (bug 0072)
  are two MORE sequential, unconditional rule passes over the same
  `callSites` collection, each citing a spec item neither surface-pair
  bullet reaches — a 2-arm surface split still cannot rescue the remaining
  4-phase, 348-line body.
- Single algorithm with shared local state: the only function-scope locals
  every phase can read are the same five PTQ-0321 named — `diagnostics`,
  `callerPath`, `callSites`, `typeEnv`, `typePass` — still under the
  6-or-more bar, and unchanged by Seam A's landing (Seam A's extraction
  removed an inline consumer of these locals; it did not add any new shared
  state). The with-clause default-reject phase needs only `callerPath`,
  `callSites.callExprs`, `deps.callableSet` (3 things); the Pi-tool
  disjointness phase needs those three plus `typeEnv`/`typePass` (5 things);
  the cycle-detection phase needs only `input.slashName`/`deps.graph` (2
  things). All comfortably bundle into a small parameter list or a single
  context record without inventing new state.
- Data-only module or type family: not applicable — pure orchestration, no
  type/table declarations.
- One grammar production family: not applicable — a compose-pass checker
  over an already-parsed AST, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT`
  marker (grepped, no hits); every commit touching this file
  (`git log --oneline --follow`) is a hand-authored bug/RFC fix.
Strong-band extra (required beyond the concrete reason): invocation.md still
carries INV-1 (line 14), INV-3 (line 44), INV-6 (line 59), INV-8 (line 63)
and INV-4 (line 95) as five separately numbered `<a id="inv-N">` sections
(direct grep of the doc; this corrects PTQ-0321's own INV-8 citation, which
named line 57 in error) — not one unified critical section — and RFC 0009
Erratum A′ is a sixth, later-added clause layered onto INV-8. The function's
own JSDoc (1092-1144) still presents its contents as a flat bulleted
WHAT-list citing eight distinct spec/bug identifiers, never an ordered
HOW-sequence whose steps must interleave. No measured-cost citation exists.
`git log --oneline --follow -- src/extension/invoke-static-checks.ts | grep
-iE "revert|split|extract"` returns no hits — no prior split of THIS
function was reverted (Seam A's own extraction is a landed split, not a
reverted one). `quality/exemptions.json` carries no entry for this host. The
one human ruling on record for this exact host (PTQ-0321's triage) is not a
keep-whole ruling for Seams B/C — it explicitly withholds ratification from
them and instructs "D9 re-files after this lands," which this filing does.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (matching PTQ-0321's own
un-ratified Seam B / Seam C proposals, updated to current line numbers).
- Seam B: extract the Pi-tool provable-disjointness check (1410-1487, 78
  LOC) into a module-private helper taking `callerPath`,
  `callSites.callExprs`, `deps.callableSet`, `typeEnv`, `typePass` ->
  hypothesis `checkPiToolArgDisjointness` - 0 exported symbols moved
  (module-private today), 0 external importers (src/tests),
  cross-references back into the host: `toolParameterProperties`,
  `fieldSchemaType`, `collectProvableArgTypes`, `renderCollectedTypes` (all
  already module-private in this file).
- Seam C: extract the with-clause default-reject classification (1347-1408,
  62 LOC) into a module-private helper taking `callerPath`,
  `callSites.callExprs`, `deps.callableSet` -> hypothesis
  `checkWithClauseDefaultReject` - 0 exported symbols moved, 0 external
  importers, cross-references back into the host: none beyond the shared
  inputs (the diagnostic codes/messages/hints it uses are already imported
  from `../parser/invoke-diagnostics` at the file's top).

## False-positive check
Band: strong (function LOC 348, threshold 200). Reasons-considered: listed
above with the evidence that defeated each (2-arm surface split covers only
2 of 4 remaining phases; 5 shared setup locals stay under the 6-or-more bar
and each remaining phase's own need is smaller still; no type/table content;
not a parser production; no generated-code marker). Exemptions check:
`quality/exemptions.json` grepped for `invoke-static-checks.ts` — no entry.
Generated-code check: grepped the file for `@generated`/`DO NOT
EDIT`/`autogenerated` — no hits. Spec-mirror check: invocation.md's five
`INV-N` anchors verified at lines 14/44/59/63/95 by direct grep (correcting
PTQ-0321's own INV-8 line citation); nothing in the spec mandates
single-function implementation. Prior-finding / duplicate check: this is a
re-file of PTQ-0321's explicitly-deferred Seams B and C, not a duplicate of
its ratified Seam A (already landed and confirmed via
`checkThetaCallableCallSurface`'s existence at 915-1090 and the sole
`4a31825f` commit touching this file) — grepped `quality/issues` +
`quality/resolved` + `quality/intake` for `checkInvokeStaticResolution` and
found only PTQ-0321 (resolved, this host's own predecessor) and unrelated D2
doc-staleness filings (PTQ-0170); the wave's own "recent triage rejections"
list separately covers a DIFFERENT deferred item on this same file
(`qw20260914091051-d9-01`, the four `checkImported*` functions' relocation,
still blocked on PTQ-0319/PTQ-0330 landing, both still `status: open`) —
that item is not re-filed here. This file's other three over-threshold
functions (`checkClauseCwdType` 74 LOC/zone, `collectProvableArgTypes` 152
LOC/justify, `checkImportedFnCallArgs` 124 LOC/justify) and the freshly
landed `checkThetaCallableCallSurface` (176 LOC/justify) were separately
checked and are not part of this filing: `checkClauseCwdType` is a 2-arm
closed dispatch over the two call surfaces (verified unchanged);
`collectProvableArgTypes` is an exhaustive switch over the closed 20-member
`Expr` union (`src/parser/theta-document.ts:461-481`); `checkImportedFnCallArgs`
threads 7 shared locals (`diagnostics`, `shadowedNames`, `callExprs`,
`importerEnv`, `importerPass`, `libraryEnvCache`, `libraryEnvFor`) through
one single-rule loop; `checkThetaCallableCallSurface` is Seam A's own landed
result, a single ordered mode→cwd→arity→type sequence over one call
surface — all four are closed-enumeration or shared-local-state keep-whole
cases, re-verified against the current source rather than merely carried
over from PTQ-0321.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces exactly: size-scan confirms checkInvokeStaticResolution at 1150-1497/348 LOC/strong with 1 src/4 test importers, Seam A's checkThetaCallableCallSurface (915-1090/176 LOC) is confirmed landed and delegated-to at 1337-1345, the six-row phase inventory sums to 348 LOC with real distinct concerns (own diagnostic codes, own locals) verified verbatim at every cited range, and all five concrete + four strong keep-whole reasons are correctly ruled out (INV-1/3/6/8/4 anchors verified at lines 14/44/59/63/95, correcting PTQ-0321's own INV-8 mis-citation; no exemption; no reverted split; git log confirms 4a31825f as the sole/most-recent commit); this is the human-sanctioned re-file of PTQ-0321's explicitly deferred Seams B/C, not a duplicate of it or of the unrelated open checkImported* relocation items on this file — but D9 breakdown target shape is never confirmed, only a human ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): Seams B AND C as one FUNCTION-seam lane (two independent leaf phases, no cross-reference between them). In src/extension/invoke-static-checks.ts extract from checkInvokeStaticResolution (a) the Pi-tool provable-disjointness check (:1410-1487, 78 LOC) into module-private checkPiToolArgDisjointness taking callerPath, callSites.callExprs, deps.callableSet, typeEnv, typePass, and (b) the with-clause default-reject classification (:1347-1408, 62 LOC) into module-private checkWithClauseDefaultReject taking callerPath, callSites.callExprs, deps.callableSet; checkInvokeStaticResolution calls each at the same point in its sequence and spreads the results exactly as today. The module-private helpers they call (toolParameterProperties, fieldSchemaType, collectProvableArgTypes, renderCollectedTypes) stay. Bodies verbatim with comments; doc comment on each helper; identical diagnostics and order; tsc first; report before/after LOC of the function.
