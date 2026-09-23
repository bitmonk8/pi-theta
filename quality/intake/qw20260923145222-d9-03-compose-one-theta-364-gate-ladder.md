---
id: pending
title: composeOneTheta is 364 LOC (strong band), a twelve-gate refusal ladder plus composed-input assembly in one body
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:1758-2121
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#composeOneTheta
d9_band: strong
wave: qw20260923145222
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-23
---

# composeOneTheta is 364 LOC (strong band), a twelve-gate refusal ladder plus composed-input assembly in one body

## Observation
The map places `composeOneTheta` at 1758-2121, 364 LOC, band strong (function
threshold >= 200), unexported, 0/0 importers. It is the fix product of
PTQ-1438 seam B ("Extracted verbatim from runComposePass's registration loop
... each former `continue` is a `return undefined`", its own doc comment).
The body is a sequential ladder of load gates followed by the composed-input
assembly and fixture construction. It has never been dispositioned under its
own host key.

## Evidence
Step inventory (anchors re-read at HEAD):

| phase | lines | LOC | reads -> writes |
|---|---|---|---|
| deps destructure | 1762-1784 | 23 | deps -> 19 locals |
| gate 1: Step 0(f) executable probe | 1786-1793 | 8 | input, subagentExecutableProbe, sink |
| gate 2: RFC-0012 §6 placement | 1795-1803 | 9 | placementAtLoad, input, sink |
| gate 3: V20a tools resolution | 1805-1837 | 33 | input, fileSystem, ctx, parseDeps, registrySnapshot, activeRoots, inProcessToolNames -> toolResult |
| gate 4: RFC 0011 §3.3 session tools | 1838-1845 | 8 | toolResult, ctx, pi, sink |
| gate 5: PIC-64 rung-3 reachability | 1847-1870 | 24 | input, toolResult, dispatchLadderProbe, sink |
| gate 6: INV-1/3/4 invoke statics | 1872-1901 | 30 | input, fileSystem, activeRoots, invokeGraph, parseDeps, toolResult -> invokeDiagnostics |
| gate 7: FN-6 subagent-fn statics | 1903-1916 | 14 | input, sink |
| gate 8: FN-7 model overrides | 1918-1932 | 15 | input, modelMatcher, sink |
| gate 9: IMP-1..7 import checks + closure fold | 1934-1961 | 28 | input, fileSystem, parseDeps, importClosureDirs -> importCheck |
| gate 10: Erratum B imported clauses | 1963-1978 | 16 | input, importCheck, toolResult, sink |
| gate 11: binder-model resolution | 1980-2042 | 63 | input, subagentRootRegime, controlPlane, settingsBinderModel, modelMatcher, probeStrictCapable -> bypassEligible, isMarkedRootTheta, binderModelResolution |
| gate 12: typed-query provider warning | 2044-2063 | 20 | input, ctx, sink |
| composed-input assembly + fixture | 2065-2121 | 57 | input, importCheck, toolResult, binderModelResolution, producerDeps -> composedInput, fixture, return |

Excerpt (1786-1792):
```ts
  if (input.frontmatter.mode === "subagent" && !subagentExecutableProbe.ok) {
    sink.emit(subagentExecutableProbe.diagnostic);
    return undefined;
  }
```

Cross-gate shared locals (written in one phase, read in >= 2 later phases):
`toolResult` (gates 4, 5, 6, 10, assembly), `importCheck` (gates 10,
assembly), `binderModelResolution` (assembly). Everything else arrives via
the already-invented `ComposeOneThetaDeps` object (19 members) and `input`.

## Why this is a problem
Strong band: presumption of breakdown, strong concrete reason required.
Reasons considered: (1) closed-enumeration dispatch — the gates cite twelve
distinct authorities (Step 0(f), RFC-0012 §6, V20a, RFC 0011 §3.3, PIC-64
rung 3, invocation.md INV-1/3/4, RFC 0001 FN-6/FN-7, imports.md IMP-1..7,
RFC 0009 Erratum B, binder-model-and-context.md, conversation-drive.md), not
one spec table, and the longest arm (binder-model, 63 LOC) is itself over the
zone bar — the prior PTQ-1151 triage verified the same for this ladder
("the gates cite distinct authorities (no spec table)"). (2) single algorithm
with >= 6 shared locals — defeated by the count above: only 3 cross-gate
locals; the deps object already exists, so a two-way split (gates 1-10 vs
binder-model + assembly) threads `input`, `deps`, `toolResult`, `importCheck`
— 4 values. (3) spec-cited ordered sequence — the one structural ordering the
comments name (INV-1 tools rejection strictly before checkInvokeStaticResolution,
bug 0110) is preserved by any sequential split; no step interleaves.
(4) reverted split / measured cost / exemption — none (this host key has never
been filed or ruled; the function is one wave old).

## Suggested direction (non-binding, optional)
Seam A: binder-model resolution (gates 11) -> resolveThetaBinderModel(input,
deps) (hypothesis) — 63 LOC, 0 exports moved, returns BinderModelResolution;
cross-references: modelMatcher, probeStrictCapable, subagentRootRegime from
deps. Seam B: composed-input assembly -> buildComposedInput(input, importCheck,
toolResult, binderModelResolution) (hypothesis) — 45 LOC, pure. Seam C: none
further identified yet. All unproven; the human ratifies.

## False-positive check
Band: strong (364 >= 200, map-quoted). Reasons-considered list above with
defeating evidence per item. Exemptions check: quality/exemptions.json has no
key for this file or `#composeOneTheta`. Generated-code check: 0 markers.
Spec-mirror check: twelve distinct spec citations, no single closed set.
Duplicate check: no open or resolved PTQ carries `d9_host: ...#composeOneTheta`
(the function was created by the PTQ-1438 fix); PTQ-1438's own host key was
`#runComposePass`.

## Triage
verdict: questionable — accounting verified: `size-scan.mjs map` reproduces composeOneTheta at 1758-2121, 364 LOC, band strong (FN strong ≥ 200 per `size-scan bands`), unexported 0/0 importers, the PTQ-1438 seam-B product (doc comment 1747-1757 says so; commit landed, 0 reverts in `git log --follow`); the 1786-1789 excerpt is byte-exact and all fourteen inventory rows open at the cited anchors within ±3 lines (Step 0(f) 1783/1786, RFC-0012 §6 1790, `toolResult` 1805, RFC 0011 §3.3 1835, reachability 1861, invoke statics 1878, FN-6 1908, FN-7 1923, `importCheck` 1939, Erratum B 1969, binder-model 1980-2042, typed-query warning 2053, `composedInput` 2070, `composeThetaFixture` 2113) as real distinct gates each citing its own authority and minting its own diagnostics; the cross-gate shared-local count reproduces — only `toolResult` (15 refs across gates 4/5/6/10/assembly), `importCheck` (13 refs, gates 10/assembly) and `binderModelResolution` (5 refs, assembly) cross a phase boundary, every other local (`invokeDiagnostics`, `reachabilityDiagnostics`, `bypassEligible`, `isMarkedRootTheta`, …) is consumed inside its own gate, so the ≥6-shared-locals reason is defeated as filed and the 19-member `ComposeOneThetaDeps` object already exists; no overlooked reason — twelve distinct spec authorities means no closed-enumeration spec table (PTQ-1151/1438 triage found the same for this ladder), the one spec-cited ordering (INV-1 tools rejection before `checkInvokeStaticResolution`, bug 0110) survives any sequential split, 0 `@generated|DO NOT EDIT` hits, exemptions.json has no key for this file or `#composeOneTheta`, no measured cost or reverted split; not a duplicate — no open or resolved PTQ carries `d9_host: …#composeOneTheta` (PTQ-1151 and PTQ-1438 are both fixed under `#runComposePass`; same-wave siblings d9-01/02/04 target the file, `#runComposePass` and `#composeExtensionInstance`, so the one-seam-per-host-per-wave rule applies to sequencing); per the D9 protocol the seam shape (binder-model extraction vs composed-input assembly) is a design decision for human ruling, never confirmed (triage: claude-fable-5-1)
