---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: collectCallSites independently re-walks the same theta body from four separate top-level entry points reachable in one compose pass
lens: D8                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:169-181
  - src/extension/invoke-static-checks.ts:211-213
  - src/extension/invoke-static-checks.ts:472-482
  - src/extension/invoke-static-checks.ts:1332-1341
  - src/extension/invoke-static-checks.ts:1534-1538
  - src/extension/import-static-checks.ts:1625-1633
  - src/extension/production-composition.ts:1254-1255
  - src/extension/production-composition.ts:1280
  - src/extension/production-composition.ts:1306-1307
  - src/extension/production-composition.ts:1397-1399
  - src/extension/production-composition.ts:1456-1459
  - src/extension/production-composition.ts:1486-1490
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d8_class: overbuilt          # D8 only: overbuilt | reimplemented | against-grain | heavier-than-scale
d8_host: src/extension/invoke-static-checks.ts#collectCallSites # D8 only: the exemption key, <path> or <path>#<function>
wave: qw20260916144930
reported_by: lens-d8-simplification (unity-completions/gemini-3.7-flash)
date: 2026-09-16
---

# collectCallSites independently re-walks the same theta body from four separate top-level entry points reachable in one compose pass

## Observation
`collectCallSites` (invoke-static-checks.ts) is a full recursive walk of a theta body's whole statement/expression tree (`walkCallSiteNodes`), producing the four call-shaped node arrays (`invokeExprs`, `callExprs`, `objectExprs`, `memberExprs`) every downstream check reads from. The module's own doc comments state its architecture is ONE walk per body, feeding every consumer. In the current code, four separate top-level functions — `buildInvokeGraph` (via its own `collectInvokeExprs` wrapper), `checkInvokeStaticResolution`, `checkThetaImports` (a different file), and `checkImportedWithClauseCallees` — each independently call `collectCallSites`/`collectInvokeExprs` on the identical `input.body`, and `production-composition.ts`'s per-theta compose loop reaches all four, for the same `input`, in one iteration, for any theta that clears each stage's error gate (the ordinary, non-erroring case).

## Evidence
**The module's own stated architecture — invoke-static-checks.ts:169-181:**
```ts
/**
 * The four call-shaped node kinds the shared walk (`walkCallSiteNodes`,
 * `../parser/theta-document.ts`) visits in ONE traversal: every `invoke(...)`
 * expression, every `CallExpr` — a `.theta`-callable-call CANDIDATE whose
 * callee is resolved against the caller's frozen callable set by
 * `resolveThetaCallableCallSites`, not by this walk — every `ObjectExpr`
 * constructor site (bug 0429) and every `MemberExpr` (bug 0430). One walk
 * keeps all four call surfaces in lockstep across this module,
 * `extension-tool-reachability.ts`, `subagent-fn-static-checks.ts` and
 * `collectClauseBearingCalls`: a second, independently written walker would
 * drift out of sync as the `Expr` / `Stmt` node shapes evolve (bug 0071).
 * `checkInvokeStaticResolution` therefore traverses a body once and feeds
 * every one of its check loops from that one result.
 */
```

**Site A — `collectInvokeExprs`, invoke-static-checks.ts:211-213, the wrapper `buildInvokeGraph` calls once per discovered theta before the main per-theta loop even starts:**
```ts
function collectInvokeExprs(body: ThetaBody): InvokeExpr[] {
  return collectCallSites(body).invokeExprs;
}
```
Its call site, invoke-static-checks.ts:472-482 (inside `buildInvokeGraph`, `457-485 | 29 LOC | 1/3 importers` per the structural map):
```ts
  const edges = new Map<string, string[]>();
  for (const input of inputs) {
    if (input.sourcePath === undefined) continue;
    const targets: string[] = [];
    for (const invoke of collectInvokeExprs(input.body)) {
      if (invoke.path.length === 0 || !invoke.path.endsWith(".theta")) continue;
      const abs = await canonical(resolveCalleeAbsolute(input.sourcePath, invoke.path));
      const targetName = byPath.get(abs);
      if (targetName !== undefined) targets.push(targetName);
    }
    edges.set(input.slashName, targets);
  }
```

**Site B — `checkInvokeStaticResolution`, invoke-static-checks.ts:1534-1538 (`1515-1759 | 245 LOC | 1/6 importers`), its own independent call, with its own "one traversal" comment:**
```ts
  if (callerPath !== undefined) {
    // One traversal feeds every check loop below (`CollectedCallSites`): the two
    // call surfaces are checked against the same reachable-node set by
    // construction, so neither can be reached by a walk the other misses.
    const callSites = collectCallSites(input.body);
```

**Site C — `checkThetaImports`, import-static-checks.ts:1625-1633 (`1286-1896 | 611 LOC | 1/37 importers`), a THIRD independent call, whose own comment names the walk as expensive enough to be "computed ONCE" — but only within this function's own four sub-consumers:**
```ts
  // PTQ-0319 / PTQ-0330: the shadow set and the call-site walk are each a
  // whole-body traversal (`collectLocalBinderNames`,
  // `../parser/type-layer-checks.ts`; `collectCallSites`,
  // `./invoke-static-checks.ts`) that all four `checkImported*` routes below
  // need identically — computed ONCE here, over the same `input.body` /
  // `paramsFieldNames` every route would otherwise re-derive, and passed in
  // rather than re-walked per route.
  const shadowedNames = collectLocalBinderNames(input.body, paramsFieldNames);
  const callSites = collectCallSites(input.body);
```

**Site D — `checkImportedWithClauseCallees`, invoke-static-checks.ts:1332-1341 (`1332-1362 | 31 LOC | 1/1 importers`), a FOURTH independent call, taking `body: ThetaBody` rather than a `CollectedCallSites` parameter:**
```ts
export function checkImportedWithClauseCallees(
  callerPath: string,
  body: ThetaBody,
  imports: readonly MaterializedImport[],
  callableSet: CallableSetSnapshot | undefined,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const importedNames = importedLocalNames(body.statements);
  const byName = new Map(imports.map((entry) => [entry.name, entry] as const));
  for (const call of collectCallSites(body).callExprs) {
```

**Same `input`, same pass, all four sites reached — production-composition.ts's per-theta compose loop:**

`parsedInputs` built once (1254-1255), fed whole to `buildInvokeGraph` (1280, site A) BEFORE the per-theta loop starts, then the SAME array is walked again by that loop (1306-1307):
```ts
  const parsedInputs: ThetaCompositionInput[] = [];
  for (const theta of discovered) {
```
```ts
  const invokeGraph = await buildInvokeGraph(parsedInputs, fileSystem);
```
```ts
  const importClosureDirs = new Set<string>();
  for (const input of parsedInputs) {
```
Site B, inside that same loop (1397-1399):
```ts
    const invokeDiagnostics = await checkInvokeStaticResolution(input, {
      fs: fileSystem,
      activeRoots,
```
Site C, later in the same iteration (1456-1459):
```ts
    const importCheck = await checkThetaImports(input, {
      fs: fileSystem,
      parseDeps,
    });
```
Site D, immediately after (1486-1490):
```ts
    const importedClauseDiagnostics = checkImportedWithClauseCallees(
      input.sourcePath ?? input.slashName,
      input.body,
      importCheck.imports,
      toolResult.callableSet,
```

## Why this is a problem
The module's own doc comments (quoted above, two separate places in this exact file) state the intended architecture as one walk per body feeding every consumer, citing bug 0071's reasoning against "a second, independently written walker." PTQ-0319 (fixed) already applied that principle by collapsing four internal callers inside `checkThetaImports` down to one shared `CollectedCallSites` parameter — its own fix note (quoted above, site C) even calls the walk "a whole-body traversal" worth computing only once. That fix's scope was the four `checkImported*` sub-routines only; it did not touch the four TOP-LEVEL entry points named here. As traced through `production-composition.ts`'s single per-theta compose loop, every theta that clears each stage's error gate (the ordinary, successful case) has its body walked by `collectCallSites`/`collectInvokeExprs` via site A (pre-loop, once per theta), site B, and site D unconditionally, and additionally via site C whenever the theta declares at least one top-level `import`. That is 3 (or 4, for an import-bearing theta) independent full recursive traversals of the same immutable AST per theta, per compose pass, where the codebase's own stated intent — and its own already-applied fix for the narrower case — is exactly one.

## Suggested direction (non-binding, optional)
Unproven hypothesis: have `production-composition.ts`'s per-theta loop compute `collectCallSites(input.body)` once (or let `checkInvokeStaticResolution`, which already runs first in the loop, return its own already-computed `CollectedCallSites` alongside its diagnostics) and thread that single result into `checkThetaImports` and `checkImportedWithClauseCallees` as a parameter, mirroring how `checkThetaImports` already threads it into its own four `checkImported*` sub-routines post-PTQ-0319; separately, thread a precomputed per-input `CollectedCallSites` (or just its `invokeExprs`) into `buildInvokeGraph` instead of having it derive its own via `collectInvokeExprs`. The exact threading shape is left to whoever picks this up.

## False-positive check
Re-read every cited range immediately before filing; excerpts match verbatim. Traced `production-composition.ts` from `parsedInputs`'s construction (1254) through `buildInvokeGraph` (1280) into the single `for (const input of parsedInputs)` loop (1306) and confirmed `checkInvokeStaticResolution` (1397), `checkThetaImports` (1456), and `checkImportedWithClauseCallees` (1486) are sequential statements in that one loop body, each gated only by an `if (...some error...) { continue; }` on the PRECEDING check's own diagnostics — so a theta with no errors reaches all three, and `buildInvokeGraph` already walked its body before the loop even began. Checked PTQ-0319 (resolved): its fix collapsed the `checkImported*` sub-routines' own four internal `collectCallSites` calls down to one shared parameter WITHIN `checkThetaImports` (confirmed landed: `checkImportedFnCallArgs` etc. in `invoke-imported-checks.ts` now take `callSites: CollectedCallSites` as a parameter, not re-deriving it) — a narrower, already-fixed instance of the same principle, distinct from this filing's claim about the four TOP-LEVEL entry points (`buildInvokeGraph`, `checkInvokeStaticResolution`, `checkThetaImports` itself, `checkImportedWithClauseCallees`) each independently deriving the walk. Grepped `quality/` for "checkImportedWithClauseCallees" (2 hits, PTQ-0371/PTQ-0372, both about stale header prose, not this redundancy) and for "buildInvokeGraph" combined with "collectCallSites" / "collectInvokeExprs" (no hit naming this specific cross-entry-point redundancy). Confirmed via the structural map's importer counts that all four functions are live production code reached from exactly one production caller each (`production-composition.ts`), not dead code. This finding's own doc-comment quote at site B names three further consumers outside this shard's manifest (`extension-tool-reachability.ts`, `subagent-fn-static-checks.ts`, `collectClauseBearingCalls`) that may exhibit the same pattern; those files were not opened for this review and are not claimed here — the four sites cited are confirmed from files inside this shard (`invoke-static-checks.ts`, `import-static-checks.ts`) plus the orchestrating loop in the neighbouring `production-composition.ts`, read for call-site evidence only.

## Triage
<!-- triage appends: verdict + one-line reason. Nothing above this line is edited. -->
verdict: questionable — every cited excerpt/line-range/importer-count reproduces exactly against current source and `node tools/quality/size-scan.mjs map` (buildInvokeGraph 457-485/29 LOC/1-3, checkInvokeStaticResolution 1515-1759/245 LOC/1-6, checkImportedWithClauseCallees 1332-1362/31 LOC/1-1, checkThetaImports 1286-1896/611 LOC/1-37), and the production-composition.ts loop trace holds verbatim (buildInvokeGraph walks every parsedInput pre-loop; checkInvokeStaticResolution/checkThetaImports/checkImportedWithClauseCallees each `continue`-gate only on the PRECEDING check's own error diagnostics, with input.body never mutated in between) so an ordinary theta is genuinely walked 3-4 times per pass; a distinct, unaddressed root cause from PTQ-0319/PTQ-0330 (both confirmed fixed one level down, collapsing checkThetaImports's own four children onto one shared call — verified landed via invoke-imported-checks.ts's `callSites: CollectedCallSites` parameters) and from PTQ-0351 (D9 phase-count on the same host, unrelated axis) — not a duplicate; D8 accurate accounting caps at questionable, the cross-function threading shape is a human's design call (triage: claude-opus-5)
