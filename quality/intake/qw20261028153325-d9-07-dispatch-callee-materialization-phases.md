---
id: pending
title: parseCalleeTheta combines structural admission, imported-input materialization, and dispatch-scoped tool snapshots
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:4648-4796
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#parseCalleeTheta
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# parseCalleeTheta combines structural admission, imported-input materialization, and dispatch-scoped tool snapshots

## Observation
`parseCalleeTheta` occupies 149 LOC, band justify, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Dependency contract | 4648-4663 | 16 | reads fs, ctx, baseFile, calleePath, deps, getAllTools, inProcessToolNames |
| Path resolution, read and parse gate | 4664-4675 | 12 | reads baseFile, ctx, calleePath, fs, deps; writes baseDir, absolute, bytes, document |
| Structural admission | 4676-4707 | 32 | reads fs, ctx, deps, absolute, document, getAllTools, bytes, inProcessToolNames; writes structural and may return unreadable |
| Imported-input materialization | 4708-4737 | 30 | reads absolute, document, structural; writes input with patched system template, runtime imports and imported type declarations |
| Dispatch-scoped caches and tools snapshot | 4738-4781 | 44 | reads deps, input, fs, ctx, getAllTools, inProcessToolNames; writes dispatchDeps, toolResult |
| Outcome assembly | 4782-4796 | 15 | reads input, toolResult; returns callable-set and root hash with input |


`src/extension/production-composition.ts:4708-4711`:
```ts
  const input: ThetaCompositionInput = {
    slashName: thetaBasename(absolute),
    sourcePath: absolute,
    // Bug 0423 F1: thread the load-phase-patched `system:` template onto the
```

`src/extension/production-composition.ts:4768-4781`:
```ts
  const dispatchDeps: PassClosureDeps = {
    ...deps,
    closureSourcesCache: new Map<string, readonly ClosureSource[]>(),
    closureHashCache: new Map<string, string>(),
  };
  const toolResult = await resolveThetaToolsAtLoad(
    input,
    fs,
    ctx,
    dispatchDeps,
    getAllTools,
    undefined,
    inProcessToolNames,
  );
```

## Why this is a problem
The justify band presumes breakdown without a concrete reason. The imported-input materialization phase reads only absolute/document/structural, whereas the dispatch snapshot phase reads deps/input/fs/ctx/getAllTools/inProcessToolNames. Thus the full structural-admission dependency set need not be threaded through every helper. The body is not one grammar production or a closed-enumeration dispatch: it surrounds parsing with admission and runtime metadata construction. The fresh dispatch-cache scope is real (4738-4767), but a helper called once per dispatch can allocate those same two maps; no reread or rehash is implied merely by a boundary. The shared import-check result must be reused, which the structural object already permits, rather than running a second import check. This is executable orchestration, not data-only or generated source. No exemption, reverted split, or measured seam overhead is evidenced.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: imported-input materialization (4708-4737) -> materializeCalleeInput helper (hypothesis) - 30 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: absolute, document and structural inputs only. Seam B: dispatch-scoped snapshot block (4738-4781) -> resolveDispatchCalleeTools helper (hypothesis) - 44 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: resolveThetaToolsAtLoad plus deps/input/fs/ctx/getAllTools/inProcessToolNames inputs. Human ratification is required.

## False-positive check
Band check: justify (149 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time.  Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — accounting verified: size-scan reproduces 149 LOC / justify at 4648-4796 with 0/0 importers; excerpts and phase spans match, with distinct structural admission, imported-input materialization, and dispatch-scoped tool resolution concerns; stated generated-code and revert searches return no matches, no host exemption or overlooked keep-whole reason was found, and PTQ-1524 concerns module placement rather than this function's breakdown; target shape needs a human ruling (triage: claude-opus-5-5)
