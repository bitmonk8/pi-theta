---
id: pending
title: buildProducerDeps retains session, telemetry, launch, dispatch, and callee-parse wiring in one body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1640-1846
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#buildProducerDeps
d9_band: strong
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# buildProducerDeps retains session, telemetry, launch, dispatch, and callee-parse wiring in one body

## Observation
`buildProducerDeps` occupies 207 LOC, band strong, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Dependency contract | 1640-1696 | 57 | destructures the pass dependency inputs and their types |
| Runtime registry and telemetry wiring | 1697-1728 | 32 | reads pi, root, ctx, activeInvocations, forwardingSignals, systemNote, statusBus, runCard, statusTrace, inProcessTools; builds dependency properties |
| Host tool and session-control adapters | 1729-1734 | 6 | captures ctx and pi; installs resolvePiTool and sessionControlHosts |
| Child launch and result surfaces | 1735-1778 | 44 | reads placementPolicy, subagentOpenWire, subagentExecutableHost, controlPlaneEnv, ctx, root, controlPlane, subagentRootRegime, emitResultEnvelope, printModeFailureSurface, subagentOutcomeEvents; builds launch fields and session-path policy |
| Dispatch and inbound depth | 1779-1806 | 28 | reads dispatchLadderProbe, hostLoopDispatch, controlPlaneEnv, pi; builds dispatch fields, parses inbound depth, installs registry thunk |
| Diagnostic and callee-parse adapters | 1807-1846 | 40 | reads sink, fileSystem, ctx, parseDeps, pi, inProcessToolNames, activeRoots; installs emitDiagnostic and fresh-snapshot parseCallee closure, returns assembled producer deps |


`src/extension/production-composition.ts:1731-1734`:
```ts
    resolvePiTool: (name: string) => resolvePiTool(name, ctx),
    // RFC 0011 §0 C1: composition-scope session-control handles, `Pick`-narrowed.
    // The same `ctx` / `pi` captures `resolvePiTool` closes over.
    sessionControlHosts: { ctx, piHandle: pi },
```

`src/extension/production-composition.ts:1831-1845`:
```ts
    parseCallee: (baseFile, calleePath) =>
      parseCalleeTheta(
        fileSystem,
        ctx,
        baseFile,
        calleePath,
        parseDeps,
        () => pi.getAllTools?.() ?? [],
        inProcessToolNames,
      ),
    // INV-1 (invocation.md §Resolution): the runtime open-time containment
    // re-check consults the same `realpath` seam and active-root union.
    fileSystem,
    activeRoots,
  });
```

## Why this is a problem
The strong band requires a strong concrete reason to keep the host whole. This body is a wiring literal, but not data-only: it calls createChildSessionPathPolicy, readParentPid, createProductionParamsFs and parseInboundInvokeDepth, and installs runtime closures that consult the live tool registry and parse files. A shared-state algorithm does not span the families: the session-control pair captures ctx/pi while the final parse adapter captures fileSystem/ctx/parseDeps/pi/inProcessToolNames; launch fields are supplied independently. The named identity contracts (the same registry, forwardingSignals, system-note channel and envelope writer) require forwarding the same values, not constructing all property families in one body. The fresh-registry-snapshot invariant at 1815-1830 requires a new closure per dispatch, not co-location with telemetry wiring. No PIC/BNDR/EXST critical section would be interleaved merely by synchronous assembly helpers. No measurement, reverted split, or human exemption is evidenced. There is no closed enumeration, grammar production or generator accounting for the host's size.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: diagnostic and callee-parse adapter assembly (1807-1843) -> buildProducerCalleeAdapters helper (hypothesis) - 37 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: parseCalleeTheta plus the sink/fs/ctx/parseDeps/pi/inProcessToolNames inputs. Seam B: child launch and result fields (1735-1778) -> buildProducerLaunchDeps helper (hypothesis) - 44 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: supplied launch values plus ctx/root for the session-path policy. Human ratification is required.

## False-positive check
Band check: strong (207 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time. PTQ-1438 covered the former inline pass phases; it is resolved and the buildProducerDeps helper now exists. This report concerns the helper body, not re-filing runComposePass or the file-level PTQ-1524 inventory. Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan reproduces buildProducerDeps at 1640-1846, 207 LOC, strong band, unexported with 0/0 importers; both excerpts and all inclusive inventory spans match, with distinct telemetry, session-control, launch, dispatch and callee-parse wiring rather than one shared-state algorithm. Runtime factories and adapters defeat the data-only rationale; the cited identity/snapshot contracts do not require co-location or an indivisible ordered sequence. Generated-marker and revert searches reproduce zero matches, no exemption or same-host finding exists, and PTQ-1438's extraction and PTQ-1524's file-level move address different breakdowns; target shape needs a human ruling. (triage: claude-opus-5-5)
