---
id: PTQ-0035
title: cancellation-core's abandonable-Promise substrate narrates itself as "the substrate shared by the four owning sites" while each owning site ships its own copy and no production module imports it
lens: D2
status: open
verdict: confirmed
locations:
  - src/runtime/cancellation-core.ts:221-296
  - src/runtime/tool-call-swallowing-handler.ts:1-8
  - src/runtime/query-swallowing-handler.ts:1-8
  - src/runtime/invoke-swallowing-handler.ts:1-8
  - src/extension/production-theta-producer.ts:215-217
sites: 5
fix_scope: module
wave: qw20260907130901
reported_by: lens-d2-cruft (anthropic/claude-sonnet-5)
date: 2026-09-07
---

# cancellation-core's abandonable-Promise substrate narrates itself as "the substrate shared by the four owning sites" while each owning site ships its own copy and no production module imports it

## Observation
`src/runtime/cancellation-core.ts` carries a section ("Swallowing-handler
three-side-channel suppression (Checkpoint-seam substrate)") exporting six
symbols: `AbandonableSettlement`, `SubstrateCancellationGuard`,
`SubstrateSideChannels`, `SubstrateDisposition`, `attachSwallowingHandler`,
`routeAbandonableSettlement`. Its doc comment calls this "the substrate shared
by the four owning sites (`V14f`, `V13f`, `V15h`, `V9o`)". The per-site
modules for three of those sites exist as separate files that re-declare the
same settlement/guard/channel shapes and their own attach+route pair, import
nothing from cancellation-core, and state that the cancellation core
"delegates to its owning leaves". Production imports the per-site guards; no
production module imports any of the six substrate symbols.

## Evidence
src/runtime/cancellation-core.ts:224-228:
```ts
/**
 * The settlement of an abandonable Pi-returned Promise the runtime might drop
 * under cancellation (the substrate shared by the four owning sites `V14f`,
 * `V13f`, `V15h`, `V9o`).
 */
```

src/runtime/tool-call-swallowing-handler.ts:1-6 (query- and
invoke-swallowing-handler.ts:1-6 carry the same sentence):
```
// V14f / V14f-T — the code-side `execute()` abandonable-Promise
// swallowing-handler per-site routing seam.
//
// This module owns the code-side `execute()` entry in the four-site
// abandonable-Promise routing set the cancellation core (`V17a`) delegates to
// its owning leaves (`V14f`, `V13f`, `V15h`, `V9o`).
```
Those three per-site modules import only `Diagnostic` and `RuntimeEvent`
(tool-call-swallowing-handler.ts:42-43, query-swallowing-handler.ts:39-40,
invoke-swallowing-handler.ts:36-37) — nothing from cancellation-core.

src/extension/production-theta-producer.ts:215-217 (production wires the
per-site guards, not the substrate):
```ts
import { guardToolExecutePromise } from "../runtime/tool-call-swallowing-handler";
import { guardQueryProviderPromise } from "../runtime/query-swallowing-handler";
import { guardInvokeExecutionPromise } from "../runtime/invoke-swallowing-handler";
```

Searches: each of the six substrate identifiers across src/, extensions/,
tools/ → hits only inside src/runtime/cancellation-core.ts (0 external
production references each). The six files importing from cancellation-core
(production-theta-producer.ts, theta-composition-producer.ts,
effectful-statement-host.ts, prompt-transport-mapping.ts,
statement-executor.ts, subagent-json-driver.ts) import only `createThetaAbort`,
`deriveChildThetaAbort`, `forwardSlashCommandCancel`, `abortForAgentEnd`,
`makeCancelledError`, `OperationResult`, `CancellableStatement`,
`runCancellableSequence`. The substrate group's only external caller is
tests/cancellation-core.test.ts:35-48.

## Why this is a problem
The narration claims a sharing that no site realizes: the generic substrate
has zero production users, and all of its intended users (the four named
owning sites) carry their own per-site implementations whose headers state the
delegation in the opposite direction. Counted users of the substrate group in
production: 0 (searches above); per-site guard functions wired in production:
3 (production-theta-producer.ts:215-217). This is not filed as dead code —
tests/cancellation-core.test.ts is a deliberate witness caller — but the
"shared by the four owning sites" sentence describes an architecture the
current code contradicts, and the generic layer it describes has no
instantiation outside those witnesses.

## Suggested direction (non-binding, optional)
Reconcile the two narrations one way: either the substrate section's comment
states the per-site delegation (matching the V14f/V13f/V15h headers), or the
owners of the V17a/per-site split decide the generic layer's future; the
current pair of contradictory present-tense claims is the artifact to remove.

## False-positive check
- Reference searches: each of `AbandonableSettlement`,
  `SubstrateCancellationGuard`, `SubstrateSideChannels`,
  `SubstrateDisposition`, `attachSwallowingHandler`,
  `routeAbandonableSettlement` grepped across src/, extensions/, tools/,
  tests/ — production hits only in cancellation-core.ts itself; test hits in
  tests/cancellation-core.test.ts.
- Import-shape check: all six production files importing from
  cancellation-core enumerated; none imports a substrate symbol; no
  namespace (`import * as`) import of the module exists.
- Re-exports/dynamic access: no `export *` in src; no string-keyed access to
  the symbol names found.
- Test-only-caller rule: respected — no deadness claim is made against the
  substrate functions; the claim targets the "shared by" narration, proven
  against the per-site modules' own imports and headers.
- Git history intent: cancellation-core's substrate landed with V17a-T
  (4a3f7904); the per-site modules landed with V14f-T (fdebd7a4) whose header
  already states the delegation to owning leaves; the substrate's "shared by"
  comment was not updated then or since.

## Triage
verdict: confirmed — re-verified independently: the comment at cancellation-core.ts:224-228 claims four owning sites share the substrate, yet all six symbols have zero production references (grep across src/, extensions/, tools/: hits only inside cancellation-core.ts; sole external caller tests/cancellation-core.test.ts:35-46), the three existing per-site modules re-declare identical settlement/guard/channels/disposition shapes plus their own attach+route pair and import only Diagnostic+RuntimeEvent, the fourth site (V9o) has no module at all, no `export *`/namespace/dynamic access exists, and `git blame` confirms the sentence landed in 4a3f7904 (V17a-T) untouched since the per-site modules landed in fdebd7a4 — a mechanically false structural claim, not a deadness filing (triage: claude-opus-5)
