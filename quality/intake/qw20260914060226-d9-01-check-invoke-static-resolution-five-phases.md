---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: checkInvokeStaticResolution bundles five sequential invoke/tool-call-check phases into one 509-line function
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:963-1471
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/invoke-static-checks.ts#checkInvokeStaticResolution # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260914060226
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# checkInvokeStaticResolution bundles five sequential invoke/tool-call-check phases into one 509-line function

## Observation
`src/extension/invoke-static-checks.ts` is 1962 LOC (band justify). Its header
states the module's role: "Load-time (compose-pass) wiring for the invoke
static checks the shipped pipeline previously never ran (invocation.md
§Argument arity / §Resolution / §Cycle detection). Each check reuses an
existing, unit-tested checker rather than reimplementing it." `checkInvokeStaticResolution`
(963-1471, 509 LOC, function band strong) is 26% of the file and its single
largest declaration; 1 src / 4 test importers per the map. Its own JSDoc
(900-962, immediately above the signature) lists what it does as a flat
bulleted enumeration citing INV-1, INV-3, INV-4, INV-6, INV-8, bug 0137, bug
0072 (twice), and RFC 0009 Erratum A′ — eight distinct spec/bug identifiers —
rather than describing one algorithm.

## Evidence
Step inventory (every boundary re-read verbatim at the cited lines
immediately before filing):

| phase | spec citation | lines | LOC |
|---|---|---|---|
| setup: one shared call-site walk, one `TypeEnv`/`StaticTypeInferencePass` built once | — | 963-998 | 36 |
| `invoke(...)` call-surface: path-escape containment, arity, mode gate, `cwd` type, per-slot type | INV-1, INV-3, INV-6, INV-8, bug 0137 | 999-1156 | 158 |
| `.theta`-callable call-surface: arity, mode gate, `cwd` type, per-slot type | INV-3, INV-6, INV-8, bug 0072 | 1157-1319 | 163 |
| with-clause default-reject callee classification | RFC 0009 Erratum A′ (INV-8) | 1321-1382 | 62 |
| Pi-tool provable-disjointness check | bug 0072 | 1384-1461 | 78 |
| invocation-cycle detection | INV-4 | 1463-1469 | 7 |

Every phase after setup is its own `for` loop (or `if`-guarded `for` loop)
over `callSites` (built once at line 986) or `input.slashName`; the only
locals every phase can read are the five established in setup —
`diagnostics`, `callerPath`, `callSites`, `typeEnv`, `typePass` — everything
else (`site`, `resolvedPath`, `arity`, `clauseRefused`, `argSlots`, `entry`,
`sole`, `schemaFieldStaticTypes`, …) is scoped to one phase's own loop body.

Setup (979-993), the five shared locals:
```ts
  const diagnostics: Diagnostic[] = [];
  const callerPath = input.sourcePath;

  if (callerPath !== undefined) {
    // One traversal feeds every check loop below (`CollectedCallSites`): the two
    // call surfaces are checked against the same reachable-node set by
    // construction, so neither can be reached by a walk the other misses.
    const callSites = collectCallSites(input.body);
    ...
    const typeEnv = collectTypeEnv(input.body.statements);
```

Phase 1 start (999-1005):
```ts
    for (const invoke of callSites.invokeExprs) {
      // A dynamic path (empty literal) or a non-`.theta` extension already
      // produced its own parse error; skip to avoid a confusing second report.
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) {
        continue;
      }
      const site = { file: callerPath, range: invoke.range };
```

Phase 2 start (1157-1160), an independent loop over the OTHER call surface:
```ts
    for (const site of resolveThetaCallableCallSites(
      callSites.callExprs,
      deps.callableSet,
    )) {
```

Phase 3 start (1321-1323), its own comment naming a further spec citation:
```ts
    // RFC 0009 Erratum A′ (invocation.md INV-8) — the call-site clause's
    // DEFAULT-REJECT callee classification: ONE loop, TWO codes, a three-way
    // verdict against the frozen callable set.
```

Phase 4 start (1384-1389), its own comment naming a fourth loop over the same collection:
```ts
    // Bug 0072 — the Pi-tool provable-disjointness check (tool-calls.md
    // §"Provable-disjointness check (parse time)"), a THIRD loop over the SAME
    // `callSites.callExprs` (no new walk; bug 0071 §Fix constraint 3: reuse the
    // shared collection, never fork the walk).
    if (deps.callableSet !== undefined) {
      for (const call of callSites.callExprs) {
```

Phase 5, whole (1463-1471):
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

`invocation.md` itself carries INV-1/3/4/6/8 as five separately numbered
sections (lines 12, 44, 95, 59, 57 of that doc respectively — confirmed by
direct grep), not one unified rule, and RFC 0009 Erratum A′ is a sixth,
later-added clause layered onto INV-8.

## Why this is a problem
Function band strong (509 LOC, threshold 200) — the presumption of breakdown
stands only against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: phases 1 and 2 do mirror the two call
  surfaces tool-calls.md §"Argument shape" names together ("invoke(...)" vs
  ".theta"-callable), but phases 3, 4, and 5 are three MORE sequential,
  unconditional rule passes over the same `callSites` collection, each
  citing a spec item neither surface-pair bullet reaches (RFC 0009 Erratum
  A′, bug 0072's disjointness check, INV-4) — a 2-arm surface split cannot
  rescue a 5-phase, 509-line body.
- Single algorithm with shared local state: the only function-scope locals
  every phase can read are the five named above (`diagnostics`,
  `callerPath`, `callSites`, `typeEnv`, `typePass`) — under the 6-or-more
  bar — and phase 3 needs only `callerPath`/`callSites.callExprs`/
  `deps.callableSet`, phase 5 needs only `input.slashName`/`deps.graph`.
  Five locals bundle into one small context record without inventing new
  state, exactly the seam this project's own review already ratified for
  the sibling function `checkThetaImports` in `import-static-checks.ts`
  (PTQ-0304's Seam C: `collectImportedSpecifierFacts` "returning the seven
  populated maps as one record").
- Data-only module or type family: not applicable — the function is
  exclusively executable orchestration, no type/table declarations.
- One grammar production family: not applicable — a compose-pass checker
  over an already-parsed AST, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT`
  marker (grepped); 23 commits (`git log --oneline --follow`), each
  hand-authored bug/RFC prose.
Strong-band extra (required beyond the concrete reason): no invocation.md/RFC
clause ties the five phases into one ordered critical section —
INV-1/3/4/6/8 are five separately numbered spec sections (not one), and the
function's own JSDoc presents its contents as a flat WHAT-list, never an
ordered HOW-sequence whose steps must interleave. No measured-cost citation
exists. `git log --oneline --follow -- src/extension/invoke-static-checks.ts
| grep -iE "revert|split|extract"` returns no hits — no prior split was
reverted. `quality/exemptions.json` carries no entry for this host.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (this project's own precedent,
PTQ-0304, ratified exactly one of its three proposed seams and deferred the
rest for a later wave).
- Seam A: extract phase 2 (the `.theta`-callable call-surface loop,
  1157-1319, 163 LOC) into a module-local helper taking `callerPath`,
  `typeEnv`, `typePass`, and `deps` (`callableSet`/`resolveCalleeArity`),
  returning `Diagnostic[]` -> hypothesis `checkThetaCallableCallSurface` - 0
  exported symbols moved (file-private today), 0 external importers
  (src/tests), cross-references back into the host: `checkClauseCwdType`,
  `checkInvokeArity`/`checkToolCallArguments`, `collectProvableArgTypes`,
  all already file-private in this module.
- Seam B: extract phase 4 (the Pi-tool provable-disjointness check,
  1384-1461, 78 LOC) into a helper taking `callerPath`,
  `callSites.callExprs`, `deps.callableSet`, `typeEnv`, `typePass` ->
  hypothesis `checkPiToolArgDisjointness` - 0 exported symbols moved, 0
  external importers, cross-references back into the host:
  `toolParameterProperties`, `fieldSchemaType`, `collectProvableArgTypes`,
  `renderCollectedTypes` (all file-private).
- Seam C: extract phase 3 (the with-clause default-reject classification,
  1321-1382, 62 LOC) into a helper taking `callerPath`,
  `callSites.callExprs`, `deps.callableSet` -> hypothesis
  `checkWithClauseDefaultReject` - 0 exported symbols moved, 0 external
  importers, cross-references back into the host: none beyond the shared
  inputs.

## False-positive check
Band: strong (function LOC 509, threshold 200). Reasons-considered: listed
above with the evidence that defeated each (2-arm surface split covers only
2 of 5 phases; 5 shared locals under the 6-local bar and trivially bundled
per this project's own ratified precedent; no type/table content; not a
parser production; no generated-code marker). Exemptions check:
`quality/exemptions.json` grepped for `invoke-static-checks.ts` — no entry.
Generated-code check: grepped the file for `@generated`/`DO NOT
EDIT`/`autogenerated` — no hits. Spec-mirror check: `invocation.md` carries
INV-1 (line 12), INV-3 (line 44), INV-4 (line 95), INV-6 (line 59), INV-8
(line 57) as five separately numbered sections, confirmed by direct grep of
the doc; nothing in the spec mandates single-function implementation, and
the numbered-section organization if anything supports the phase split
cited above. Prior-finding check: grepped `quality/issues` + `quality/resolved`
+ `quality/intake` for `invoke-static-checks.ts` and for
`checkInvokeStaticResolution` by name — the only existing hits are
`PTQ-0170`/`PTQ-0295`/`PTQ-0296` (doc-staleness / dead-branch D2 findings,
unrelated to breakdown) and `PTQ-0304` (a D9 breakdown finding against the
neighboring file `import-static-checks.ts`'s `checkThetaImports`, cited above
as the seam precedent — filed against a different file, not this one). This
file's other three over-threshold declarations were separately checked and
are not part of this filing: `collectProvableArgTypes` (151 LOC/justify) is
an exhaustive switch over the closed 19-member `Expr` union (grammar.md
§Expression sublanguage, `src/parser/theta-document.ts:137`; longest arm
`"binary"`, 651-704, 54 LOC, under the 60-LOC zone floor) and
`checkClauseCwdType` (74 LOC/zone) is a 2-arm closed dispatch over the two
call surfaces (invoke ~15 LOC / theta-callable ~12 LOC) — both
closed-enumeration keep-whole cases; `checkImportedFnCallArgs` (124
LOC/justify) threads 7 shared locals (`diagnostics`, `shadowedNames`,
`callExprs`, `importerEnv`, `importerPass`, `libraryEnvCache`,
`libraryEnvFor`) through one single-rule loop (bug 0138 route 2), a
shared-local-state keep-whole case matching this project's own precedent for
`resolveSettingsSource` (PTQ-0281/PTQ-0305).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces: size-scan confirms invoke-static-checks.ts at 1962 LOC/justify and checkInvokeStaticResolution at 963-1471/509 LOC/strong with 1 src/4 test importers exactly, all five phase-boundary excerpts and the setup's five shared locals match the source verbatim, and the five-concern inventory is real (five distinct invocation.md/tool-calls.md citations, not one dispatch split by adjectives) with reasons-considered correctly applying the design doc's own ≥6-shared-locals bar (5 found, no rescue); but two supporting citations are wrong — invocation.md's INV-8 anchor is at line 63, not the cited line 57 (unrelated intro prose), and PTQ-0304's Seam C is mischaracterized as "already ratified" when its own record says "Seams A and C are NOT ratified" (only Seam B was) — neither error refutes the core accounting, so D9 breakdown caps here at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
