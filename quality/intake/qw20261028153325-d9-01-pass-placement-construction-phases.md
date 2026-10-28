---
id: pending
title: buildPassPlacement combines envelope routing, backend selection, policy wiring, and result-wire construction
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1332-1432
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#buildPassPlacement
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# buildPassPlacement combines envelope routing, backend selection, policy wiring, and result-wire construction

## Observation
`buildPassPlacement` occupies 101 LOC, band justify, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Input and return contracts | 1332-1357 | 26 | reads dependency parameters; declares four returned products |
| Envelope routing | 1358-1375 | 18 | reads passEnvelopeWriter, passResultChannel; writes emitResultEnvelope |
| Backend construction and load selection | 1376-1401 | 26 | reads settings, controlPlaneEnv, clock, placementSelector, passPlacementRegistration; writes pipePlacement, execTemplate, execPlacement, selectPlacementNow, placementAtLoad |
| Credential guard and placement policy | 1402-1422 | 21 | reads ctx, settings, pipePlacement, selectPlacementNow, systemNote; writes providerAuthStatus, placementPolicy |
| Result wire and return | 1423-1432 | 10 | reads clock and previously built products; writes subagentOpenWire and returns products |


`src/extension/production-composition.ts:1369-1375`:
```ts
  const emitResultEnvelope =
    passEnvelopeWriter ??
    (passResultChannel !== undefined
      ? (line: string): void => {
          passResultChannel.writeLine(line);
        }
      : createProductionEnvelopeWriter());
```

`src/extension/production-composition.ts:1425-1431`:
```ts
  const subagentOpenWire = createProductionSubagentWire({
    clock,
    launchFs: createProductionLaunchFileFs(),
    server: createProductionChannelServer(),
    mintSecret: createProductionSecretMint(),
  });
  return { emitResultEnvelope, placementAtLoad, placementPolicy, subagentOpenWire };
```

## Why this is a problem
The justify band presumes breakdown without a concrete keep-whole reason. Single algorithm/shared state does not account for all phases: envelope routing consumes two inputs, and result-wire construction consumes clock and three production factories, not the backend selector or the credential guard. The backend and policy phases do share pipePlacement and selectPlacementNow, but those do not reach the envelope phase. Closed enumeration and grammar recognition fail: this is a sequence of constructors, not arms of one spec table or a grammar production. It is executable construction, not a data-only type family or generated source. The PIC-59 one-writer comment at 1358-1368 requires one emitResultEnvelope identity, not co-residence of result-wire and credential-guard construction; a synchronous helper call need not create a second writer. No measured seam cost or reverted split is evidenced.

## Suggested direction (non-binding, optional)
All hypotheses are unproven; the human ratifies one. Seam A: envelope routing (1358-1375) -> resolvePassEnvelopeWriter helper (hypothesis) - 18 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: none (two inputs and one result). Seam B: result-wire construction (1423-1430) -> buildPassResultWire helper (hypothesis) - 8 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: clock input only.

## False-positive check
Band check: justify (101 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time.  Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan reproduces buildPassPlacement at 1332-1432, 101 LOC, justify band, unexported with 0/0 importers and a live runComposePass call; both excerpts and inclusive inventory spans match, with envelope routing and child-wire construction independent of the shared backend/policy state; generated-marker and revert searches return no matches, no exemption or same-root finding exists, and PIC-59 pins writer identity rather than co-residence of these constructions; target breakdown shape needs a human ruling (triage: claude-opus-5-5)
