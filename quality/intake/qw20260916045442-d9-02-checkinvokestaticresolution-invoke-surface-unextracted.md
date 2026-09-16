---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: checkInvokeStaticResolution still inlines its invoke(...) call-surface loop at 245 LOC while the sibling call surface already has its own extracted function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1529-1773
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/invoke-static-checks.ts#checkInvokeStaticResolution # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260916045442
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# checkInvokeStaticResolution still inlines its invoke(...) call-surface loop at 245 LOC while the sibling call surface already has its own extracted function

## Observation
This host was previously filed as PTQ-0321 (509 LOC, five phases) and re-filed as PTQ-0351
(348 LOC, "Seams B/C remain") — both now `status: fixed`. PTQ-0321 ratified Seam A only:
extracting the `.theta`-callable call-surface loop into `checkThetaCallableCallSurface`
(confirmed landed: it now exists at 947-1122, 176 LOC, called from this host at 1723-1730).
PTQ-0351 then ratified Seams B and C together: extracting the Pi-tool provable-disjointness
loop into `checkPiToolArgDisjointness` and the with-clause default-reject loop into
`checkWithClauseDefaultReject` (both confirmed landed: they now exist at 1384-1466/1249-1308,
called from this host at 1754-1762/1745-1752). A fourth delegation, `checkRuntimeToolCallSurface`
(RFC 0011 §5.2, 1133-1216), was added to this host's sequence after PTQ-0351's filing and is
already its own function too. `checkInvokeStaticResolution` itself is now 1529-1773, 245 LOC
(still function band strong, threshold 200) — 1 src / 6 test importers per the map. Of its
remaining 245 lines, 150 (61%) are the ONE call-surface loop neither PTQ-0321 nor PTQ-0351 ever
proposed extracting: the `invoke(...)` call-surface loop, still inlined here even though its
sibling surface (the `.theta`-callable loop, originally near-identical in size and shape) has
carried its own top-level function since PTQ-0321's Seam A landed.

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited lines immediately
before filing; the four rows sum exactly to the function's 245 LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| setup: shared call-site walk, `TypeEnv`/`StaticTypeInferencePass`/runtime-tool-success-types built once | — | 1529-1570 | 42 |
| `invoke(...)` call-surface: path-escape containment, callee-has-errors WARN, INV-8 mode gate, INV-6 cwd type, INV-3 arity, bug-0137 per-slot type (six ordered sub-checks over ONE call surface; never extracted) | invoke-surface `for` loop | 1571-1720 | 150 |
| four already-extracted sibling-surface delegations (`.theta`-callable, runtime-tool, with-clause default-reject, Pi-tool disjointness) | four `diagnostics.push(...check*(...))` blocks | 1721-1762 | 42 |
| INV-4 invocation-cycle detection + return | `detectInvocationCycle` call, return | 1763-1773 | 11 |

The function's own doc comment (1468-1471) still frames its duty as a flat WHAT-list over
BOTH call surfaces, not a single ordered whole:
```ts
/**
 * Run the load-time invoke static checks for one discovered theta, returning
 * every diagnostic (error-severity entries un-register the theta):
 *
```

The unextracted loop's own start (1571-1577), six ordered sub-checks that follow (arity before
type, per its own later in-loop comment "arity before type" at the per-slot-type block):
```ts
    for (const invoke of callSites.invokeExprs) {
      // A dynamic path (empty literal) or a non-`.theta` extension already
      // produced its own parse error; skip to avoid a confusing second report.
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) {
        continue;
      }
      const site = { file: callerPath, range: invoke.range };
      const resolvedPath = resolveCalleeAbsolute(callerPath, invoke.path);
```

Its sibling surface's OWN already-landed extraction (947-956) — the exact shape this loop has
never received:
```ts
async function checkThetaCallableCallSurface(
  callExprs: readonly CallExpr[],
  callerPath: string,
  typeEnv: TypeEnv,
  typePass: StaticTypeInferencePass,
  deps: {
    readonly callableSet: CallableSetSnapshot | undefined;
    readonly resolveCalleeArity: (calleeAbsolutePath: string) => Promise<CalleeArity | undefined>;
  },
): Promise<Diagnostic[]> {
```

The four now-thin delegations that replaced PTQ-0321/0351's own former inline phases
(1722-1730, the first of the four — `checkThetaCallableCallSurface`'s own call site):
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

Tail (1763-1773):
```ts
  }

  // INV-4 (invocation.md §Cycle detection): walk the static-resolution graph
  // from this theta; a back-edge un-registers it.
  const cycle = detectInvocationCycle(input.slashName, deps.graph);
  if (cycle !== undefined) {
    diagnostics.push(cycle);
  }

  return diagnostics;
}
```

## Why this is a problem
Function band strong (245 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: not applicable to the whole function — row 2 is one ordered
  procedure over one call surface, and row 3 is four independent delegated calls, not arms of
  one dispatch.
- Single algorithm with shared local state: the only locals every row can read are `diagnostics`,
  `callerPath`, `callSites`, `typeEnv`, `typePass` — five, under the 6-or-more bar — and the
  function's own now-landed history disproves the state-sharing claim further: each of the four
  already-extracted siblings needs only a SUBSET of these five (`checkWithClauseDefaultReject`'s
  own signature takes `callerPath`, `callSites.callExprs`, `deps.callableSet`,
  `input.body.statements` — not even `typeEnv`/`typePass`), so the "shared state" reason already
  failed three times over for this exact function and fails identically for row 2: the
  unextracted loop reads only `callSites.invokeExprs`, `callerPath`, `deps.fs`,
  `deps.activeRoots`, `deps.resolveCalleeArity`, `typeEnv`, `typePass` — a parameter list the
  same size and shape as its already-extracted sibling's own 5-parameter signature quoted above.
- Data-only module or type family: not applicable — pure orchestration, no type/table content.
- One grammar production family: not applicable — a compose-pass checker over an already-parsed
  AST, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT`/`autogenerated` marker
  (grepped, no hits); `git log --oneline --follow -- src/extension/invoke-static-checks.ts |
  grep -iE "revert|split|extract"` returns no hits at all — no split of this function, reverted
  or otherwise, beyond the three already-landed seams.
Strong-band extra (required beyond the concrete reason): invocation.md still carries INV-1
(line 14), INV-3 (line 44), INV-6 (line 59), INV-8 (line 63), and INV-4 (line 95) as five
separately numbered `<a id="inv-N">` sections (direct grep of the doc) — not one unified
critical section neither PTQ-0321 nor PTQ-0351 found, and this filing finds no different result
for row 2 alone. Extracting the unextracted loop would not "interleave observable steps": the
loop is already a single self-contained unit (its own `clauseRefused`/`arity`-gated internal
ordering is entirely internal to the loop body and would move as one lump, exactly as the
`.theta`-callable loop's own extraction already proved workable for the analogous surface,
verbatim-body-preserving per that seam's own ratification). No measured-cost citation exists
anywhere in the file or its tests. `quality/exemptions.json` carries no entry for this host. The
two human rulings on record for this host (PTQ-0321's and PTQ-0351's triage notes) ratified
Seams A, B, and C — the `.theta`-callable loop, the Pi-tool disjointness loop, and the
with-clause default-reject loop — and neither filing's own "Suggested direction" section ever
proposed extracting the `invoke(...)` loop itself; there is no on-record ruling withholding or
refusing this seam, so this is unaddressed ground rather than a re-file of anything already
adjudicated.

## Suggested direction (non-binding, optional)
Unproven; the human ratifies the actual split (this project's own precedent for this exact
function: PTQ-0321 and PTQ-0351 each ratified one seam per wave and left the rest open).
- Seam: extract the `invoke(...)` call-surface loop (1571-1720, 150 LOC) into a module-private
  function taking `callSites.invokeExprs`, `callerPath`, `typeEnv`, `typePass`, and the three
  `deps` members it reads (`fs`, `activeRoots`, `resolveCalleeArity`), returning
  `Promise<Diagnostic[]>` -> hypothesis `checkInvokeCallSurface` (naming it in parallel with the
  already-landed `checkThetaCallableCallSurface`) - 0 exported symbols moved (module-private
  today, matching its sibling), 0 external importers (src/tests); cross-references back into the
  host: `checkInvokePathAtLoad`, `checkCalleeHasErrors`, `checkClauseCwdType`, `checkInvokeCall`,
  `buildInvokeArgSlot`, `WITH_CLAUSE_PROMPT_MODE_CALLEE_CODE`/`_HINT`,
  `withClausePromptModeCalleeMessage` (all already imported or module-private in this file).

## False-positive check
Band: strong (function LOC 245, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (5 shared locals under the 6-or-more bar, and the function's own
three already-landed extractions each needed only a subset — proving row 2's own extraction
would need no more; no type/table content; not a parser production; no generated-code marker).
Exemptions check: `quality/exemptions.json` grepped for `invoke-static-checks.ts` — no entry.
Generated-code check: grepped the file for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits.
Spec-mirror check: invocation.md's five `INV-N` anchors re-verified by direct grep at lines
14/44/59/63/95 (matching PTQ-0351's corrected citation); nothing in the spec mandates
single-function implementation. Prior-finding check: grepped `quality/issues` +
`quality/resolved` + `quality/intake` for `checkInvokeStaticResolution` — hits are `PTQ-0170`/
`PTQ-0295`/`PTQ-0296` (D2 doc-staleness/dead-branch findings, unrelated to breakdown), `PTQ-0321`
and `PTQ-0351` (this host's own predecessors, both `status: fixed`, both re-read in full above);
neither predecessor's "Suggested direction" section names the `invoke(...)` loop as a candidate
seam (PTQ-0321 proposed only the `.theta`-callable loop, the Pi-tool disjointness loop, and the
with-clause default-reject loop; PTQ-0351 proposed only the latter two), so this filing is not a
re-file of either — it is a fresh observation enabled by the asymmetry the two landed
extractions leave behind. This file's other over-threshold declarations were independently
re-checked this same pass and are not part of this filing: `checkClauseCwdType` (74 LOC/zone) is
a 2-arm closed dispatch on `surface.kind`; `collectProvableArgTypes` (152 LOC/justify) is an
exhaustive switch over the closed `Expr` union; `checkThetaCallableCallSurface` (176 LOC/justify)
and `checkRuntimeToolCallSurface` (84 LOC/zone) are each one ordered arity-then-type sequence
over one call surface (the latter's own doc comment states it "Mirrors
`checkThetaCallableCallSurface`'s structure"); `checkWithClauseDefaultReject` (60 LOC/zone) and
`checkPiToolArgDisjointness` (83 LOC/zone) are each Seam B/C's own already-landed single-rule
loop; `checkImportedFnCallArgs` (124 LOC/justify) threads 7 shared locals through one
single-rule loop and is separately the subject of the still-open misplacement finding
`PTQ-0370`, not re-filed here.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting fully reproduces (size-scan confirms checkInvokeStaticResolution at 1529-1773/245 LOC/strong, 1/6 importers; the 1571-1720 invoke loop is 150 LOC and all four inventory rows sum exactly to 245; checkThetaCallableCallSurface/checkRuntimeToolCallSurface/checkWithClauseDefaultReject/checkPiToolArgDisjointness line ranges, LOC, and bands all match; INV-1/3/6/8/4 anchors verified at invocation.md lines 14/44/59/63/95; no exemption, generated-code marker, or reverted split; 5 shared locals verified under the 6-bar; PTQ-0321/0351 re-read in full and confirm neither's Suggested-direction ever proposed this loop as a seam) — but D9 breakdown target shape is a human ruling, never confirmed (triage: claude-opus-5)
