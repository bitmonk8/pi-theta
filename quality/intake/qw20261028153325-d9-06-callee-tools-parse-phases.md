---
id: pending
title: parseCalleeForTools combines path containment, parsing, nested escape projection, and structural judgement
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:3576-3702
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#parseCalleeForTools
d9_band: justify
wave: qw20261028153325
reported_by: lens-d9-placement (openai/gpt-6.1-sol)
date: 2026-10-28
triaged_at: e071eada0d46fdc4e5ebc1a9f3bb2a97f028d3a5
---

# parseCalleeForTools combines path containment, parsing, nested escape projection, and structural judgement

## Observation
`parseCalleeForTools` occupies 127 LOC, band justify, in the authoritative structural map. The file header identifies this as the production composition root for the shipped extension, constructing the session-start object graph over real host seams. This function is unexported; the map quotes its src/tests importer counts as 0/0. Inventory LOC below are inclusive source spans, including signatures and comments; the host size is taken from the supplied map, not recounted.

## Evidence
| phase | line ranges | LOC (inclusive span) | locals read / written |
|---|---|---:|---|
| Dependency contract | 3576-3588 | 13 | reads fs, ctx, callerDir, spec, deps, getAllTools, activeRoots, inProcessToolNames |
| Read and disk-name resolution | 3589-3598 | 10 | reads fs, callerDir, spec; writes absolute, bytes, onDiskName; returns missing-file disposition |
| Root containment gate | 3599-3644 | 46 | reads fs, absolute, spec, activeRoots, onDiskName; writes containment and may return escape disposition |
| Document parse and frontmatter gate | 3645-3654 | 10 | reads absolute, bytes, deps, onDiskName; writes document and may return parse-error disposition |
| Nested containment and diagnostic projection | 3655-3674 | 20 | reads fs, absolute, document.frontmatter.tools, activeRoots; writes nestedContainment, nestedToolsEscapes |
| Structural judgement and result assembly | 3675-3702 | 28 | reads fs, ctx, deps, absolute, document, getAllTools, activeRoots, bytes, nestedContainment, inProcessToolNames, onDiskName, nestedToolsEscapes; writes failsPostParseChecks and CalleeParse |


`src/extension/production-composition.ts:3662-3674`:
```ts
  const nestedContainment = await probeNestedToolsContainment(
    fs,
    absolute,
    document.frontmatter.tools,
    activeRoots,
  );
  const nestedToolsEscapes = await checkNestedToolsContainment(
    fs,
    absolute,
    document.frontmatter.tools,
    activeRoots,
    nestedContainment,
  );
```

`src/extension/production-composition.ts:3695-3702`:
```ts
  return {
    fileExists: true,
    mode: document.frontmatter.mode,
    hasErrors: hasLoadParseError(document.diagnostics) || failsPostParseChecks,
    onDiskName,
    ...(nestedToolsEscapes !== undefined ? { nestedToolsEscapes } : {}),
  };
}
```

## Why this is a problem
The justify-band presumption needs a concrete reason. The sequence is not one grammar production: it performs filesystem containment and post-parse callable/import judgement around the parser. Shared locals exist (absolute/bytes/document), but the read/name phase uses fs/callerDir/spec, the containment phase uses fs/absolute/spec/activeRoots/onDiskName, and nested projection uses fs/absolute/document/activeRoots; six locals are not required through every helper boundary. The structural-judgement call has a wider dependency set, which does not account for the earlier phases. The read-before-containment-before-parse rule and the precomputed containment map preserve input classification and avoid repeated probes; passing the same bytes/map through sequential helpers does not introduce new reads. There is no closed-enumeration mirror, data-only family, generator, human exemption, reverted split, or measured cost requiring this whole body.

## Suggested direction (non-binding, optional)
All hypotheses are unproven. Seam A: nested containment plus diagnostic projection (3655-3674) -> judgeNestedToolsContainment helper (hypothesis) - 20 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: probeNestedToolsContainment and checkNestedToolsContainment, with fs/absolute/tools/activeRoots inputs. Seam B: root containment gate (3599-3644) -> resolveToolsCalleeContainment helper (hypothesis) - 46 LOC, 0 exported symbols moved, external importers 0/0, cross-references back into host: none beyond fs/absolute/spec/activeRoots/onDiskName inputs. Human ratification is required.

## False-positive check
Band check: justify (127 LOC; function thresholds zone 60, justify 100, strong 200). Reasons-considered: the shared-state, enumeration, data/type-family, grammar, generated-code, and strong-reason checks are addressed above. Exemptions check: `quality/exemptions.json` contains no key for this host. Generated-code check: `rg -n '@generated|DO NOT EDIT' src/extension/production-{composition,host-loop-dispatch}.ts` produced no matches; the headers describe production wiring, not a generator. Spec-mirror check: the inventory is not a short-arm switch over a spec-named closed set. History check: `git log --format='%h %s' -- src/extension/production-composition.ts src/extension/production-host-loop-dispatch.ts | grep -i revert` produced no matches; no reverted split is evidenced. Duplicate check: the exact host has no prior `d9_host` entry in quality/issues, quality/resolved, or quality/intake at review time.  Every inventory and excerpt range was re-read immediately before filing.

## Triage
verdict: questionable — Accounting verified: size-scan reproduces 3576-3702, 127 LOC, justify band and 0/0 importers; both excerpts and all inclusive phase spans match, with distinct read/name, root-containment, parse, nested-diagnostic and structural-verdict concerns. The filing accounts for the spec-pinned read→containment→parse ordering and PTQ-0349's shared probe map; neither requires whole-function co-location. Generated/revert searches reproduce, no exemption or same-root-cause finding was found, and no applicable keep-whole reason was overlooked; the breakdown shape needs a human ruling. (triage: claude-opus-5-5)
