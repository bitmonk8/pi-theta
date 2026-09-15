---
id: PTQ-0349
title: parseCalleeForTools runs the fs.realpath-based containment probe twice per nested `.theta` tools: entry
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/production-composition.ts:2654-2666
  - src/extension/production-composition.ts:3418-3429
  - src/extension/production-composition.ts:3081-3092
  - src/extension/production-composition.ts:3109-3118
  - src/runtime/invocation.ts:91-106
sites: 5                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: heavier-than-scale  # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/production-composition.ts#parseCalleeForTools
wave: qw20260914130212
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-14
---

# parseCalleeForTools runs the fs.realpath-based containment probe twice per nested `.theta` tools: entry

## Observation
`parseCalleeForTools` resolves one `.theta` callee reached through a caller's `tools:` list, then runs two separate functions over that same callee's own `tools:` list: `checkNestedToolsContainment` (to collect `nestedToolsEscapes` diagnostics) and `calleeFailsOwnStructuralChecks` (through `calleeFailsOwnStructuralChecksWithTaint`, to `calleeFailsOwnStructuralChecksBody` on a memo miss) to decide the recursive `fails`/`ownEscapes` verdict. Both are fed the identical `document.frontmatter.tools` and the identical `activeRoots`, and both independently loop over the same entries, resolve the same `nestedAbsolute` off the same `calleeDir = dirname(calleeAbsolutePath)`, re-read that path's bytes, and call the same containment probe (`checkInvokePathAtLoad`) with byte-identical arguments (`resolvedPath`, `literalPath`, `activeRoots`). Neither loop consults the other's result.

## Evidence
`parseCalleeForTools` feeds the identical `document.frontmatter.tools` / `activeRoots` to both functions, back to back:

`src/extension/production-composition.ts:2654-2666`
```ts
  const nestedToolsEscapes = await checkNestedToolsContainment(
    fs,
    absolute,
    document.frontmatter.tools,
    activeRoots,
  );
  // Bug 0267: the callee's own parse document alone is not its registration
  // verdict — `checkThetaImports` and the callee's own `tools:` resolution
  // both run AFTER the callee's parse in that callee's own `runComposePass`
  // iteration, and a `tools:` scan reaching this file through the CALLER never
  // otherwise sees either. Widen the same predicate the V15f loop already
  // consumes rather than adding a second refusal path.
  const failsPostParseChecks = await calleeFailsOwnStructuralChecks(
```

`checkNestedToolsContainment`'s own loop, per nested entry — read bytes, then probe containment:

`src/extension/production-composition.ts:3418-3429`
```ts
    const nestedBytes = await fs.readBytes(nestedAbsolute).then(
      (value) => value,
      () => undefined,
    );
    if (nestedBytes === undefined) {
      continue;
    }
    const containment = await checkInvokePathAtLoad({
      deps: { fs },
      resolvedPath: nestedAbsolute,
      literalPath: spec,
      activeRoots,
```

`calleeFailsOwnStructuralChecksBody`'s own loop over the same `toolsList = frontmatter.tools`, resolving the same `nestedAbsolute` — reads the bytes a second time:

`src/extension/production-composition.ts:3081-3092`
```ts
    const bytes = await fs.readBytes(nestedAbsolute).then(
      (value) => value,
      () => undefined,
    );
    readable.set(spec, bytes !== undefined);
    if (bytes === undefined) {
      // Unreadable: bug 0270's route owns this spec
      // (`theta/load/unresolvable-theta-path`, via the stub below) — there is
      // no document to judge, so this loop has no further business with it.
      continue;
    }
    onDiskNames.set(spec, await onDiskCalleeName(fs, nestedAbsolute));
```

...then probes containment a second time, with arguments identical to `checkNestedToolsContainment`'s call above:

`src/extension/production-composition.ts:3109-3118`
```ts
    if (activeRoots !== undefined) {
      const containment = await checkInvokePathAtLoad({
        deps: { fs },
        resolvedPath: nestedAbsolute,
        literalPath: spec,
        activeRoots,
      }).then(
        (value) => value,
        () => undefined,
      );
```

`checkInvokePathAtLoad`'s own cost, via `checkInvokePathContainment`: one `fs.realpath` (through `canonicalizePath`) for the nested path, plus one more per member of `activeRoots` (the full discovery-root union) — so each of the two calls above costs `1 + activeRoots.length` `fs.realpath` syscalls, not one:

`src/runtime/invocation.ts:91-106`
```ts
export async function checkInvokePathContainment(
  deps: InvokePathCheckDeps,
  resolvedPath: string,
  activeRoots: readonly string[],
): Promise<InvokePathContainment> {
  // The containment comparison is decided on the byte-exact `realpath` output of
  // *both* the resolved callee path and each active root (invocation.md
  // §Resolution). Forward-slash-normalise per the Lexical "Path literals" rule;
  // no independent case-folding — the canonical form is whatever `realpath`
  // returns on the host.
  const canonicalPath = await canonicalizePath(deps.fs, resolvedPath);

  for (const root of activeRoots) {
    const canonicalRoot = stripTrailingSeparator(
      await canonicalizePath(deps.fs, root),
    );
```

## Why this is a problem
Both loops apply the identical entry gates (`parseToolsEntry(...).kind !== "ok"` skip, `toolsEntrySpec`, empty/bare-name skip) to the identical `tools:` array, resolve the identical `nestedAbsolute` off the identical `calleeDir`, and — for every entry naming a distinct `.theta` path — call `checkInvokePathAtLoad` with byte-identical `resolvedPath`/`literalPath`/`activeRoots`. That probe's own cost is `1 + activeRoots.length` `fs.realpath` calls, so this is a redundant `O(activeRoots.length)` cost per nested entry, doubled, on every `parseCalleeForTools` invocation whose callee declares its own `tools:` `.theta` entries — a live path, since `resolveThetaToolsAtLoad`'s per-theta cache calls `parseCalleeForTools` for every distinct `.theta` spec in a discovered theta's `tools:` list. `pass-verdict-memo.ts` (bug 0276) already gives the structural-verdict half of this walk a per-pass memo keyed on `(getAllTools, activeRoots, calleeAbsolutePath, bytes)`, so on a memo hit `calleeFailsOwnStructuralChecksBody`'s own copy of the probe is skipped for a later caller referencing the same callee — but `checkNestedToolsContainment` carries no memo of its own, so its copy re-runs on every `parseCalleeForTools` call regardless of the sibling memo's hit/miss state.

## Suggested direction (non-binding, optional)
One unproven hypothesis: compute the per-entry containment verdict (escape-or-not, plus its diagnostic) once per `(nestedAbsolute, activeRoots)` inside `parseCalleeForTools`, and hand that already-computed result to both `checkNestedToolsContainment` (which only needs to project the escaping subset into diagnostics) and `calleeFailsOwnStructuralChecksBody`'s loop (which only needs the escape/no-escape verdict for withhold (a)). This changes which function calls the probe, not the two functions' separately-documented decisions (diagnostic relocation vs. recursive-verdict fold, tied to bugs 0111/0275), which are not challenged here.

## False-positive check
Re-read both loops side by side (production-composition.ts:3373-3439 and the per-entry section of 2960-3240) to confirm the entry gates, `calleeDir` derivation, and `checkInvokePathAtLoad` argument shapes are identical, not merely similar. Checked whether the verdict memo could make `calleeFailsOwnStructuralChecksBody`'s copy skip before duplicating this work: on a memo HIT the body — and its copy of the probe — is skipped entirely by `calleeFailsOwnStructuralChecksWithTaint`, but `checkNestedToolsContainment` is called directly from `parseCalleeForTools` with no memo of its own, so its copy still runs every time regardless; the redundancy is real at minimum in the "both run" (memo-miss) case documented above. Checked this is distinct in kind from the D9 breakdown concern already recorded on this same host (`calleeFailsOwnStructuralChecksBody` is listed in the size-scan map's own "over threshold" section at 281 LOC, band strong): that is a claim about the function's LOC/bundled concerns, cross-referenced here; this finding is about a cross-function redundant execution of an identical expensive probe, which persists whether or not the function is later split. Checked the code's own doc-comment (the WITHHOLD (a) discussion, bugs 0111/0275): it explains why the two functions' decisions (which diagnostic to relocate vs. which verdict to fold) must stay separate — a reason not contested here — without addressing why the underlying probe execution must also be duplicated. Searched `quality/issues/`, `quality/resolved/`, and the wave's rejected list for "checkNestedToolsContainment", "calleeFailsOwnStructuralChecks", "containment": no existing filing covers this redundancy. Not dead code: both loops sit on the live `resolveThetaToolsAtLoad` → `parseCalleeForTools` load path.

## Triage
verdict: questionable — all 5 excerpts verified verbatim at the cited lines; checkNestedToolsContainment (production-composition.ts:3373-3439, sole call site parseCalleeForTools:2654) and calleeFailsOwnStructuralChecksBody's loop (2960-3240, via calleeFailsOwnStructuralChecksWithTaint) are independently confirmed to share the same document.frontmatter.tools array and activeRoots reference, resolve identical nestedAbsolute off identical calleeDir, and call checkInvokePathAtLoad with byte-identical resolvedPath/literalPath/activeRoots, each costing 1+activeRoots.length fs.realpath calls (activeRoots = the discovered-theta directory union, confirmed non-trivial at its construction site, line 821); checkNestedToolsContainment has no memo of its own (grep confirms its one call site) unlike the sibling pass-verdict-memo.ts that skips calleeFailsOwnStructuralChecksBody's copy on a hit, so the doubling is real on every memo-miss and compounds across sibling callers of a shared nested tool; the WITHHOLD-(a) doc-comments (bugs 0111/0275/0276) justify only why the two verdicts stay separate, never why the probe execution must be duplicated; no exemptions.json entry, no spec-required behaviour dropped by the suggested consolidation — accounting verified, but per the D8 rule the consolidation shape is a design decision for a human ruling, matching the accepted PTQ-0319/0330/0331 precedent for this same repeated-computation D8 class. (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): probe once. parseCalleeForTools computes the per-entry containment verdict (escape-or-not plus its diagnostic, from checkInvokePathAtLoad over the identical nestedAbsolute / literalPath / activeRoots) ONCE per nested tools: entry and hands the computed results to both consumers — checkNestedToolsContainment (which projects the escaping subset into diagnostics) and calleeFailsOwnStructuralChecksBody's loop (which folds the escape verdict into withhold (a)) — instead of each calling the probe. The two consumers' separately documented decisions (bug 0111 / bug 0275) are unchanged; the memo in pass-verdict-memo.ts is unchanged. Identical diagnostics, identical verdicts, half the fs.realpath calls; tests unchanged unless one counts realpath calls (re-pin and say so). Same host-lane note as the sibling ruling (after the D9 lane; follow the functions if Seam A+C moved them).
