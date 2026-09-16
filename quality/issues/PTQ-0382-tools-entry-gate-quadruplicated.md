---
id: PTQ-0382
title: production-composition.ts's tools: entry admission gate (parseToolsEntry + toolsEntrySpec + bare-name/dedup skip) is hand-copied across four functions
lens: D4                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:2656-2669
  - src/extension/production-composition.ts:3452-3460
  - src/extension/production-composition.ts:3788-3796
  - src/extension/production-composition.ts:3864-3872
sites: 4                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone              # D4 only: clone | drift | parallel
wave: qw20260916144930
reported_by: lens-d4-duplication (unity-completions/kimi-k2.7-code)
date: 2026-09-16
---

# production-composition.ts's tools: entry admission gate (parseToolsEntry + toolsEntrySpec + bare-name/dedup skip) is hand-copied across four functions

## Observation
Four functions in production-composition.ts each open a `for (const entry of <tools-list>)` loop and reproduce the identical admission gate before doing anything else with the entry: reject an entry that fails `parseToolsEntry`, extract its spec via `toolsEntrySpec`, then skip it if the spec is empty, is a bare Pi-tool name (`isBareToolName`), or is already present in a local dedup collection. Three of the four (`calleeFailsOwnStructuralChecksBody`, `probeNestedToolsContainment`, `checkNestedToolsContainment`) reproduce the gate byte-for-byte except for the name of that local collection (`readable`/`results`/`judged`); the fourth (`resolveThetaToolsAtLoad`'s callee-cache loop) keeps the identical two-statement grammar gate but restates the skip test as a positive compound condition with one extra, documented conjunct. The code's own comments name this as one deliberate cross-depth invariant (bugs 0111/0248), not four independent implementations.

## Evidence
`resolveThetaToolsAtLoad`'s callee-cache loop — production-composition.ts:2656-2669:
```ts
  const calleeCache = new Map<string, CalleeParse>();
  for (const entry of toolsList) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (
      spec.length > 0 &&
      !isBareToolName(spec) &&
      !calleeCache.has(spec) &&
      checkInvokeExtension({ literalPath: spec, site: { file: parsed.sourcePath } })
        .length === 0
    ) {
      calleeCache.set(
        spec,
```

`calleeFailsOwnStructuralChecksBody`'s loop — production-composition.ts:3452-3460:
```ts
  for (const entry of toolsList) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length === 0 || isBareToolName(spec) || readable.has(spec)) {
      continue;
    }
    const nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec);
```

`probeNestedToolsContainment`'s loop — production-composition.ts:3788-3796:
```ts
  for (const entry of calleeTools) {
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length === 0 || isBareToolName(spec) || results.has(spec)) {
      continue;
    }
    const nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec);
```

`checkNestedToolsContainment`'s loop — production-composition.ts:3864-3872:
```ts
    if (parseToolsEntry(entry.trim()).kind !== "ok") {
      continue;
    }
    const spec = toolsEntrySpec(entry);
    if (spec.length === 0 || isBareToolName(spec) || judged.has(spec)) {
      continue;
    }
    judged.add(spec);
    const nestedAbsolute = isAbsolute(spec) ? spec : resolvePath(calleeDir, spec);
```

Diff verdict: sites 2/3/4 are type-2 clones of each other — identical statements, only the collection identifier renamed (`readable`/`results`/`judged`). Site 1 keeps the identical two-statement grammar gate (`parseToolsEntry(...).kind !== "ok"` → `continue`; `const spec = toolsEntrySpec(entry)`) then restates the rest as a positive compound `if` carrying one extra, separately-documented conjunct (bug 0320's extension-name check) instead of a `continue`. No clone-map group id: the map reported no groups for this file; each occurrence is 5-9 lines, below the scanner's token-window floor.

## Why this is a problem
The four sites are not incidentally similar — the code states outright that they must apply the identical subject test. `checkNestedToolsContainment`'s own comment (3852-3863) says the gate is "the same three lines in the same position as the depth-0 cache loop in `resolveThetaToolsAtLoad` above," because bug 0111 "ruled the *Trigger* names the entry kind, not the entry's depth, so the same subject test governs this loop and the depth-0 one" — a malformed or bare-name `tools:` entry must draw exactly one diagnostic, under exactly one code, no matter which of these four functions (which recursion depth) meets it first. With the gate copy-pasted four times and no shared helper, a future change to what counts as an admissible spec — widening `isBareToolName`'s regex, or a new `parseToolsEntry` grammar arm — requires editing all four call sites by hand; missing one reopens exactly the double-diagnostic-or-missed-diagnostic class bugs 0111 and 0248 were filed to close, because one depth would then judge an entry the other three still skip, or the reverse. This is distinct from the already-recorded cost concern on this same code: the resolved PTQ-0349 and the pending `qw20260916045442-d8-02-parsecalleefortools-percaller-redundant-probes.md` both claim the CONTAINMENT PROBE downstream of this gate is executed redundantly (a performance/D8 claim); this finding is that the ADMISSION GATE itself, upstream of that probe, has no shared implementation at all (a maintenance/drift-risk/D4 claim).

## Suggested direction (non-binding, optional)
Shared source of truth (hypothesis): a small helper — e.g. `admissibleToolsSpec(entry, seen): string | undefined`, returning the extracted spec or `undefined` when the entry should be skipped — performing the grammar check, extraction, and empty/bare/seen skip once, called from all four sites instead of reproduced in each. `resolveThetaToolsAtLoad`'s extra `checkInvokeExtension` conjunct would stay caller-side, layered on top of the shared result; named as an observation, not a design.

## False-positive check
Re-ran `grep -n 'parseToolsEntry(entry.trim()).kind !== "ok"' src/extension/production-composition.ts` immediately before filing: exactly 4 hits, matching the clone map's "no clone groups" report for this file (the map's scanner apparently does not pair these). Confirmed all four are live: `resolveThetaToolsAtLoad` is called once per discovered theta and once per runtime dispatch (production-composition.ts:1329, via `parseCalleeTheta`); `calleeFailsOwnStructuralChecksBody`, `probeNestedToolsContainment`, and `checkNestedToolsContainment` are each reached from `parseCalleeForTools`, itself called from `resolveThetaToolsAtLoad`'s own callee-cache loop — none is a dead copy (D2 territory would require one to be unreachable; all four execute whenever a discovered theta's, or a `tools:`-referenced callee's, own `tools:` list is non-empty). Checked this is not the resolved PTQ-0349 or the pending D8 finding named above: both are about the COST of re-running `checkInvokePathAtLoad`/`onDiskCalleeName` downstream of this gate; neither names the gate's own four-way code duplication. Checked the already-filed D4 list (PTQ-0373/0374/0375, the nearest-shaped prior findings — a guard quadruplicated, an argument loop cloned, a param-junk guard cloned) — each names a different guard/loop in a different file (`invoke-static-checks.ts`, `type-layer-checks.ts`), none is this `tools:`-entry admission gate in `production-composition.ts`. Not tests/, not generated. Not a spec-repeated normative vector table — the admitted-entry grammar (frontmatter-fields-a.md §`tools`) is cited once by the code; the duplication is between four CODE implementations of that one clause, not between the spec and the code.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: confirmed — all 4 excerpts verified verbatim at cited lines; clone-scan.mjs (map and whole-repo groups) confirms zero clone groups anywhere in this file, matching the filing's claim, while manual diff independently confirms sites 2-4 are identical modulo the loop-iterable/dedup-collection identifiers (toolsList/calleeTools, readable/results/judged) and site 1 keeps the identical two-statement grammar gate wrapped in one extra, separately bug-0320-documented conjunct instead of continue; the cross-depth-invariant comment at 3851-3862 quoting bugs 0111/0248 reproduces verbatim; all four sites confirmed live via parseCalleeForTools <- resolveThetaToolsAtLoad (called at production-composition.ts:1329 and :4184); distinct root cause from resolved PTQ-0349 and pending qw20260916045442-d8-02 (both about the containment probe's COST/redundant execution downstream of this gate, not the gate's own code duplication) and from PTQ-0373/0374/0375 (different guards, different files); d4_class: clone, accurate, per protocol confirmed as a mechanical dedupe. (triage: claude-opus-5)
