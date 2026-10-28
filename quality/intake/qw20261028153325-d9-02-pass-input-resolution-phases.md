---
id: pending
title: resolvePassInputs combines settings effects, placement and regime detection, and discovery
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1510-1632
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#resolvePassInputs
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# resolvePassInputs combines settings effects, placement and regime detection, and discovery

## Observation
`resolvePassInputs` occupies 123 LOC, band justify, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Input and result contracts | 1510-1536 | 27 | reads pi, fileSystem, clock, sink, controlPlaneEnv, excludeOwnedNames, statusBus, passPlacementRegistration |
| Settings and status verbosity | 1537-1548 | 12 | reads fileSystem, sink, statusBus; writes settingsResult, settings and bus verbosity |
| Placement selector | 1549-1562 | 14 | reads passPlacementRegistration, settings, controlPlaneEnv; writes placementSelector |
| Regime and marked root | 1563-1578 | 16 | reads controlPlaneEnv; writes subagentRootRegime, markedRoot |
| Discovery inputs and walks | 1579-1622 | 44 | reads pi, excludeOwnedNames, fileSystem, clock, settings, markedRoot, sink; writes cliPaths, piOwnedNames, packageWalk, walk, discovered |
| Result assembly | 1623-1632 | 10 | reads settings, placementSelector, subagentRootRegime, markedRoot, walk, packageWalk, discovered; returns pass products |


`src/extension/production-composition.ts:1539-1548`:
```ts
  const settingsResult = await loadSettings(fileSystem);
  sink.emitGroup(settingsResult.diagnostics);
  const settings: ThetaSettings = settingsResult.settings;

  // EXST-10: the telemetry-class ceiling, read like every other settings key
  // and defaulted at the READ site (an absent OR out-of-range value is absent
  // in the cleaned view, so both land on `names`). A hot-reload re-compose
  // pass re-runs this, so a settings edit takes effect at the next reload
  // without reconstructing the bus.
  statusBus?.setVerbosity(settings.theta?.progress ?? "names");
```

`src/extension/production-composition.ts:1558-1562`:
```ts
  passPlacementRegistration?.discover();
  const placementSelector = resolvePlacementSelector(
    settings.theta?.subagentPlacement,
    controlPlaneEnv[SUBAGENT_PLACEMENT_ENV],
  );
```

## Why this is a problem
The justify band presumes breakdown. Shared-state algorithm is not a reason for retaining the entire host: regime/marked-root detection reads controlPlaneEnv alone; settings/status propagation reads fileSystem, sink and statusBus; discovery does not read placementSelector. At least six locals need not cross every candidate boundary. The different phases implement EXST-10 verbosity, RFC-0012 placement selection, PIC-58 regime selection, and package/discovery inputs, rather than one spec-named enumeration. This is neither a grammar recognizer nor a data-only type family; it performs awaits and host effects. No generated source, exemption, measurement, or reverted split is evidenced. Preserving the current diagnostic order requires sequential calls, not that every operation remain in this body.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: settings read, diagnostic delivery and bus verbosity (1537-1548) -> loadPassSettings helper (hypothesis) - 12 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: returns settings, takes fileSystem/sink/statusBus. Seam B: discovery inputs and walks (1579-1622) -> discoverPassThetas helper (hypothesis) - 44 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: settings and markedRoot inputs, walk/packageWalk/discovered outputs. Human ratification is required.

## False-positive check
Band check: justify (123 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time.  Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan reproduces resolvePassInputs at 1510-1632, 123 LOC, justify band, unexported with 0/0 importers; the excerpts and inclusive inventory spans match, with distinct settings/status, placement, regime/marked-root and discovery phases rather than one shared-state algorithm. Generated-marker and revert searches reproduce zero matches, no exemption or same-host finding exists, and PTQ-1438's prior extraction does not establish a keep-whole invariant; target shape needs a human ruling. (triage: claude-opus-5-5)
