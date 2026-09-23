---
id: pending
title: invoke-machinery.ts bundles five member groups (entry resolvers, drive legs, boundary guards, binding/projection, typed-return validation) at 1005 LOC
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/invoke-machinery.ts:1-1005
sites: 1
fix_scope: cross-module
d9_class: breakdown
d9_host: src/extension/invoke-machinery.ts
d9_band: justify
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# invoke-machinery.ts bundles five member groups (entry resolvers, drive legs, boundary guards, binding/projection, typed-return validation) at 1005 LOC

## Observation
src/extension/invoke-machinery.ts is 1005 LOC — justify band. Its header (:1-14)
names the module as "the production `invoke(...)` machinery for the per-theta
producer … extracted from `ProductionThetaProducer`". It holds one class,
`InvokeMachinery` (145-942, 798 LOC, 1 src importer per the map), two return-
typing types, the deps interface, and one module-level guard function. The file
was minted by the ratified PTQ-1183/1274/1440 fix commits and has no file-level
host filing of its own.

## Evidence
Distinct-concern inventory (all ranges re-read at HEAD; member names and line
ranges from the structural map):

| concern | members | line ranges | LOC |
|---|---|---|---|
| call-surface entry resolvers | resolveInvoke, resolveCallAsInvoke, #buildInvokeChild | 159-315 | 148 |
| callee drive legs (cross-mode fork) | #driveCallee, #driveAttachedPromptCallee, #driveSpawnedSubagentCallee | 327-568 | 229 |
| invoke boundary guards | #guardInvokeBoundary, #parseCalleeOrErr, #recheckCalleeContainment, invokeBoundaryArgGuards | 571-656, 725-764, 972-1005 | 152 |
| param binding & result projection | #bindCalleeParams, #projectValidatedReturn | 659-716 | 56 |
| typed-return resolution & validation | InvokeReturnTyping, InvokeReturnSite, #resolveReturnSite, validateInvokeReturn | 119-138, 783-822, 867-941 | 163 |
| producer collaborator seam | InvokeMachineryDeps | 86-104 | 19 |

The groups share no class state beyond `#input`/`#deps` (the only two fields,
:146-147); every cross-group hand-off is by explicit parameter — e.g.
#driveCallee → legs pass `(callee, calleePath, returnSite, paramBindings, ctx,
chain, parentSignal, parentInvocationId, [resolvedCwd|trace])` (:355-397), and
both legs converge on `#projectValidatedReturn` (:475, :555). The guard family
returns plain records (`{ callee, resolvedCwd }`, :622) rather than touching
fields. Excerpt (:145-152):
```ts
export class InvokeMachinery {
  readonly #input: ProductionProducerInput;
  readonly #deps: InvokeMachineryDeps;

  constructor(deps: InvokeMachineryDeps) {
    this.#input = deps.input;
    this.#deps = deps;
  }
}
```

## Why this is a problem
Justify band: presumption of breakdown unless a concrete reason to stay whole
is found. Reasons considered: (a) single algorithm with shared local state —
defeated: only 2 fields, and the inter-group hand-offs are 4 named values
(callee, resolvedCwd, returnSite, paramBindings), under the >= 6 bar; (b)
closed-enumeration dispatch — the only switch is #resolveReturnSite's 3-arm
`InvokeReturnTyping` switch (40 LOC), which does not carry the file's length;
(c) data-only — no (type/interface LOC ≈ 60, ~6 %); (d) generated — no; (e)
grammar production — n/a. No quality/exemptions.json entry names this file or
any member. The typed-return group in particular is self-contained: 163 LOC
reached only through `#projectValidatedReturn`'s one call and reading only
`#input.root.schemaValidator` from the class.

## Suggested direction (non-binding, optional)
Hypotheses, unproven: Seam A: the typed-return group (InvokeReturnTyping,
InvokeReturnSite, #resolveReturnSite, validateInvokeReturn, ~163 LOC) ->
`invoke-return-validation.ts`; moves 3 exported type/member names whose only
external importer is production-theta-producer.ts (map: InvokeReturnSite 1 src
importer); one cross-reference back (schemaValidator via a parameter). Seam B:
the boundary-guard family (#guardInvokeBoundary, #parseCalleeOrErr,
#recheckCalleeContainment, invokeBoundaryArgGuards, ~152 LOC) ->
`invoke-boundary-guards.ts`; 0 exported symbols move today (all private/
module-local), cross-references: `#input.parseCallee`/`fileSystem`/
`activeRoots` become parameters. Seam C: none identified yet for the drive
legs. The human ratifies.

## False-positive check
Band: justify (1005 LOC), quoted from the map. Reasons-considered list with
defeating evidence above. Exemptions check: quality/exemptions.json (4 keys)
has no invoke-machinery entry. Generated-code check: no marker; file minted by
quality fix commits 48b6a1b7/87620215 lineage (hand-written). Spec-mirror
check: invocation.md INV-1/INV-6/INV-8 and ceiling #4 name the guards, each
already its own member — no spec clause pins the file as one body. Dedupe:
PTQ-1183/1274/1440 (all resolved) keyed production-theta-producer.ts member
hosts and predate this file; no filing carries the invoke-machinery.ts host
key. Not a husk (798-LOC class payload) and not a barrel (implementation, not
re-exports).

## Triage
verdict: questionable — accounting verified: size-scan map (one-line manifest) reproduces `src/extension/invoke-machinery.ts — 1005 LOC — band justify` (FILE_BANDS justify=1000) with `InvokeMachinery` 145-942 / 798 LOC, `InvokeMachineryDeps` 86-104, `InvokeReturnTyping` 119-122, `InvokeReturnSite` 134-138, module-level `invokeBoundaryArgGuards` 972-1005, and every member row at the cited lines; quality/exemptions.json holds no key for this file or any member; the 145-152 excerpt matches byte-for-byte and the class really has only `#input`/`#deps` as fields; all five member-group rows are real distinct concerns (entry resolvers 159-315 build an `InvokeChild` and thread 11 params into `#driveCallee`; the two legs 404-568 are self-contained try/finally blocks sharing no leg-written local; the guard family 571-656/725-764/972-1005 returns plain records; bind/project 659-716; typed-return 783-822/867-941 reads only `#input.root.schemaValidator`), and cross-group produced values are exactly callee/resolvedCwd/returnSite/paramBindings (4 < 6, the rest are threaded method parameters — the same count the PTQ-1183/1274/1440 triage notes accepted), so no concrete/strong keep-whole reason was overlooked (the only switch is the 3-arm `#resolveReturnSite`, ~6 % type LOC, hand-authored via fix commits f1b77776/39670a25/48b6a1b7 with no reverted split, no spec clause pins the file as one body); two minor inaccuracies that do not refute the inventory: the typed-return row is 124 LOC by size-scan (4+5+40+75) not 163, and that group is NOT reached only through `#projectValidatedReturn` — `validateInvokeReturn` is public and wired into `SubagentSpawnRegime` via production-theta-producer.ts:294-295, `#resolveReturnSite` is called directly from `#driveCallee` :369, and `InvokeReturnSite`'s one external importer is subagent-spawn-regime.ts:110 not production-theta-producer.ts (which if anything strengthens Seam A as an already-shared seam); not a duplicate — PTQ-1183/1274/1440 (quality/resolved, all fixed) key production-theta-producer.ts member hosts and predate this file, same-wave d9-02 sibling keys production-theta-producer.ts, no filing carries the invoke-machinery.ts host key; the seam shape (A/B or otherwise) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting verified; target shape needs a human ruling: size-scan map reproduces 1005 LOC / band justify (FILE_BANDS justify=1000), InvokeMachinery 145-942 (798 LOC) with only #input/#deps fields, and every member range in the inventory; the groups are real distinct concerns joined by explicit parameters (#driveCallee :348-396 passes callee/resolvedCwd/returnSite/paramBindings, 4 < 6 shared values), both legs meet at #projectValidatedReturn (:471, :551), the only switch is #resolveReturnSite's 3-arm switch, no exemptions.json key, no generated marker, no spec clause pins the file as one body; no filing in quality/ other than this one carries d9_host invoke-machinery.ts; minor inaccuracies that do not overturn the inventory: validateInvokeReturn is public and also reached from subagent-spawn-regime.ts:1616 via production-theta-producer.ts:294-295, not only through #projectValidatedReturn, and InvokeReturnSite's one src importer is subagent-spawn-regime.ts:110, not production-theta-producer.ts (triage: claude-opus-5-5)
