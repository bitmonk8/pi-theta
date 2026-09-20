---
id: pending
title: resolveThetaToolsAtLoad runs seven adjudication phases in one 225-LOC body whose shared state is two locals
lens: D9
status: intake
verdict: pending
locations:
  - src/extension/production-composition.ts:2699-2923
sites: 1
fix_scope: module
d9_class: breakdown
d9_host: src/extension/production-composition.ts#resolveThetaToolsAtLoad
d9_band: strong
wave: qw20260920202922
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-20
---

# resolveThetaToolsAtLoad runs seven adjudication phases in one 225-LOC body whose shared state is two locals

## Observation
`resolveThetaToolsAtLoad` (src/extension/production-composition.ts:2699-2923) is 225 LOC — strong band (>= 200). Its doc comment (2690-2698) states its role: "resolve a discovered theta's `tools:` callable set at production load time, returning every load-time diagnostic ... together with the frozen resolution snapshot the runtime enforces against." The body is seven sequential phases over exactly two shared locals (`calleeCache`, `diagnostics`); each phase carries its own bug/spec citation.

## Evidence
Step inventory (phase | lines | LOC | locals read/written — the seam cost):

| phase | lines | LOC | locals read / written |
|---|---|---|---|
| Root closure-hash capture + no-`tools:` early return | 2731-2746 | 16 | r: parsed, fs, ctx, parseDeps; w: rootClosureHash, rootClosureSpread |
| Callee pre-parse loop (bug-0106 malformed gate, bug-0320 extension gate) | 2778-2812 | 35 | r: toolsList, callerDir, fs, ctx, parseDeps, getAllTools, activeRoots, inProcessToolNames; w: calleeCache |
| Escape-drain loop (INV-1 depth-0 + nested, bugs 0110/0111) | 2814-2834 | 21 | r: calleeCache, parsed.sourcePath; w: diagnostics |
| Callee-has-errors loop (V15f) | 2836-2848 | 13 | r: calleeCache, parsed.sourcePath; w: diagnostics |
| CallableSetDeps closure construction | 2850-2889 | 40 | r: ctx, getAllTools, inProcessToolNames, calleeCache, parsed.body; w: deps |
| resolveCallableSet + registered verdict | 2891-2903 | 13 | r: deps, toolsList, parsed.sourcePath; w: result, registered, diagnostics |
| Load-time closure-hash attach + return | 2904-2923 | 20 | r: result, fs, ctx, parseDeps, parsed.sourcePath, rootClosureSpread; w: baseSet, callableSet |

The two diagnostic loops' entire input surface (excerpt, lines 2836-2842):
```ts
  for (const [spec, callee] of calleeCache) {
    if (callee.escape === undefined && callee.fileExists && callee.hasErrors) {
      diagnostics.push(
        ...checkCalleeHasErrors({
          calleePath: spec,
          surface: "tools",
          hasErrors: true,
```

## Why this is a problem
Strong band (225 LOC): presumption of breakdown, not filed only on a strong concrete reason. Reasons considered and defeated:
- Single algorithm with shared local state — defeated by the counts above: the cross-phase state is `calleeCache` and `diagnostics` (2 locals). The escape-drain and has-errors loops each read (calleeCache, parsed.sourcePath) and could return their diagnostic rows — a 2-parameter seam, far under the 6-local bar. Only the pre-parse loop threads 8 values, and those are the function's own parameters forwarded verbatim.
- Closed-enumeration dispatch — no; the loops iterate authored `tools:` entries, not a spec-named closed set of arms.
- Data-only / grammar production / generated — no (imperative admission logic; no generation markers in the file).
- Strong-only, spec-cited critical section / ordered sequence a seam would interleave — no. The cited ordering (escape rows pushed FIRST, ahead of content-derived rows — bugs 0110/0111 §Fix constraint 1; the malformed/extension gates BEFORE any callee read — bugs 0106/0320) is a *call order* over the shared `diagnostics` array; sequential helper calls preserve it byte-for-byte. Nothing observable interleaves across a phase boundary.
- Strong-only, measured cost — no: the pre-parse cache is a by-reference Map; passing it to a helper re-reads nothing.
- Strong-only, prior split reverted / human ruling — none found; no `#resolveThetaToolsAtLoad` key in `quality/exemptions.json`.

## Suggested direction (non-binding, optional)
Seam hypotheses, unproven, ordered by confidence: Seam A: the two diagnostic loops (2814-2848) -> in-file helper `drainCalleeDiagnostics(calleeCache, sourcePath)` returning `Diagnostic[]` (hypothesis) — 34 LOC, 0 exported symbols moved, 0 external importers, cross-reference back into the host: none (push order preserved by returning escape rows before has-errors rows). Seam B: the CallableSetDeps closure (2850-2889) -> `makeLoadCallableSetDeps({ ctx, getAllTools, inProcessToolNames, calleeCache, body })` (hypothesis) — 40 LOC, 0 exported symbols moved (it already mirrors the sibling `stubDeps` shape in `calleeFailsOwnStructuralChecksBody`, a D4-adjacent observation routed in this wave's notes). Seam C: none identified yet for the pre-parse loop (it forwards the function's full parameter list).

## False-positive check
Band: strong (225 LOC quoted from the structural map). Reasons-considered list above, each defeated with a local count or an order-preservation argument. Exemptions check: `quality/exemptions.json` read in full — no matching key. Generated-code check: no markers. Spec-mirror check: the phases cite independent authorities (RFC-0005 hash capture, frontmatter-fields-a.md admission, INV-1 containment, V15f callee-has-errors) — several facilities, not one closed enumeration mirrored once. Duplicate check: no pending or resolved finding carries this host key (grep over quality/ for `resolveThetaToolsAtLoad` shows only harness-duplication D4/D7 findings in tests and PTQ-0322's file-level inventory row); PTQ-0349 (resolved) changed this function's nested-containment probing but dispositioned no size claim.

## Triage
verdict: questionable — accounting verified: size-scan map reproduces resolveThetaToolsAtLoad at 2699-2923, 225 LOC, band strong (FN threshold 200), unexported 0/0 importers; excerpt at 2836-2842 matches verbatim and all seven phase ranges re-read as real sequential blocks each carrying its own bug/spec citation (0328, 0106/0320, INV-1 0110/0111, V15f, 0001, RFC-0005); my own cross-phase local count is four (calleeCache, diagnostics, toolsList, rootClosureSpread) plus two linear handoffs (deps→result), not the title's two, but every one is disclosed in the table and the total stays under the 6-shared-locals single-algorithm bar; cited orderings are call orders over `diagnostics` that sequential helpers preserve; no exemption key for file or function in quality/exemptions.json; prior REVIEW_LOG keep-whole notes (2026-09-14/16) are reviewer notes, not human rulings; not a duplicate — PTQ-0322's host key is the file and its ratified/pre-announced seams are module moves that disposition no function-level size claim, PTQ-0348/0349/0382 are D8/D4; the seam shape (and sequencing against PTQ-0322's pre-announced A+C move of this function) is a design decision for a human ruling (triage: claude-fable-5-1)
verdict: questionable — accounting re-verified against post-fix code (commit 0fb4497e landed after filing): size-scan map now places resolveThetaToolsAtLoad at 2679-2884, 206 LOC, still band strong (FN threshold 200), unexported 0/0 importers; the excerpt reproduces verbatim at 2816-2822 (20-line drift) and all seven rows re-read as real sequential blocks, though row 5 shrank 40→20 LOC because its resolvePiTool body was extracted to callable-pi-tool-resolver.ts; the title's "two shared locals" is undercounted — locals read in ≥ 2 rows are four (calleeCache, diagnostics, toolsList, rootClosureSpread) and strict cross-row handoffs reach 6-7 only by adding single-producer/single-consumer pipeline values (callerDir→2, deps→6, result→7) that a sequential extraction returns rather than shares, with no try/finally or interleaved critical section (unlike the drive-user-visible-turn rejection), so the ≥ 6-shared-locals reason is not cleanly met and every local is disclosed in the table; cited orderings (0106/0320 gates first, 0110/0111 escape rows before V15f rows) are call orders over `diagnostics` preserved by sequential helpers; no exemption key for file or function in quality/exemptions.json; REVIEW_LOG 2026-09-14/16 keep-whole entries are reviewer notes, not human rulings; not a duplicate (PTQ-0322 is file-level module moves, PTQ-0348/0349/0382/1126 are D8/D4); a 206-LOC linear pipeline six lines over the bar with a 4-local (or 6-7 by strict count) seam cost is exactly the shape needing a human ruling (triage: claude-fable-5-1)
