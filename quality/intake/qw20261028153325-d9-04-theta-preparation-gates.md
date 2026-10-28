---
id: pending
title: prepareOneTheta combines launch refusal, tool admission, dispatch reachability, and import observation
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1887-1994
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#prepareOneTheta
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# prepareOneTheta combines launch refusal, tool admission, dispatch reachability, and import observation

## Observation
`prepareOneTheta` occupies 108 LOC, band justify, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Dependency unpacking | 1887-1895 | 9 | reads input and deps; names pi, ctx, fileSystem, sink, parseDeps, registrySnapshot, activeRoots, inProcessToolNames, dispatchLadderProbe, subagentExecutableProbe, placementAtLoad, importClosureDirs |
| Executable and placement refusals | 1896-1911 | 16 | reads input, subagentExecutableProbe, placementAtLoad, sink; may return undefined |
| Tools resolution and refusal | 1912-1946 | 35 | reads input, fileSystem, ctx, parseDeps, registrySnapshot, activeRoots, inProcessToolNames, sink; writes toolResult |
| Session tool availability | 1947-1957 | 11 | reads toolResult, ctx, pi, input, sink; writes sessionToolDiags and may return undefined |
| Extension dispatch reachability | 1958-1983 | 26 | reads input, toolResult, dispatchLadderProbe, sink; writes reachabilityDiagnostics and may return undefined |
| Import observation and watch coverage | 1984-1994 | 11 | reads input, fileSystem, parseDeps; writes importCheck, importClosureDirs; returns PreparedTheta |


`src/extension/production-composition.ts:1951-1957`:
```ts
  if (toolResult.callableSet !== undefined) {
    const sessionToolDiags = checkSessionToolAvailability(
      toolResult.callableSet, { ctx, pi }, input.sourcePath ?? input.slashName,
    );
    sink.emitGroup(sessionToolDiags);
    if (sessionToolDiags.length > 0) { return undefined; }
  }
```

`src/extension/production-composition.ts:1985-1993`:
```ts
  const importCheck = await checkThetaImports(input, {
    fs: fileSystem, parseDeps, claimDelivery: false,
  });
  // Retain watch coverage even when a later library invoke/FN/import gate
  // refuses the importer. Observing preparation never consumes display budget.
  for (const libPath of importCheck.resolvedLibs) {
    importClosureDirs.add(normalizePath(dirname(libPath)));
  }
  return { input, toolResult, importCheck };
```

## Why this is a problem
The justify-band presumption is not discharged by a single-algorithm/shared-state reason: launch refusals read input/sink and two probes; session availability reads input/sink/toolResult/ctx/pi; import observation reads input/fileSystem/parseDeps/importClosureDirs. No six locals are required by every phase. These are independently named gates (Step 0(f), RFC-0012 placement, V20a callable admission, RFC-0011 session tools, PIC-64 reachability, and imports), not a closed enumeration's short arms. The ordering requirement that tools refuse before import observation can be preserved by sequential calls; it does not require a single function. The body performs I/O and mutates a watch set, so it is not a data/type-only family or grammar recognizer. No generator, measured seam cost, reverted split, or exemption is evidenced.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: launch refusal gates (1896-1911) -> checkThetaLaunchPrerequisites helper (hypothesis) - 16 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: input, sink, subagentExecutableProbe, placementAtLoad. Seam B: import observation and watch coverage (1984-1994) -> observeThetaImportPreparation helper (hypothesis) - 11 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: input, fileSystem, parseDeps, importClosureDirs. Human ratification is required.

## False-positive check
Band check: justify (108 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time.  Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 1887–1994, 108 LOC, justify band and private 0/0 importers; both excerpts and all six inventory spans match. Launch refusal, callable/session admission, dispatch reachability and import/watch observation use distinct state subsets, not one closed enumeration or six-local algorithm. The stated marker/revert searches return no matches and no exemption applies. Bug 0508 pins preparation-before-graph ordering and retained watch coverage, not this function boundary. PTQ-1524 tracks file-level families and resolved PTQ-1438 the former pass extraction, not this internal breakdown. Target shape needs a human ruling. (triage: claude-opus-5-5)
