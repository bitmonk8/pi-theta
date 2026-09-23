---
id: PTQ-1435
title: presentedCallableNames inlines the bare-identifier tools-spec classifier that callable-set.ts exports as isBareIdentifier
lens: D8
status: fixed
verdict: confirmed
locations:
  - src/extension/callable-lowering.ts:455-462
  - src/parser/callable-set.ts:568-575
  - src/extension/tools-entry-gate.ts:27-34
sites: 2
fix_scope: cross-module
d8_class: reimplemented
d8_host: src/extension/callable-lowering.ts#presentedCallableNames
wave: qw20260923023517
reported_by: lens-d8-simplification (anthropic/claude-fable-5)
date: 2026-09-23
---

# presentedCallableNames inlines the bare-identifier tools-spec classifier that callable-set.ts exports as isBareIdentifier

## Observation
`presentedCallableNames`'s snapshot-absent fallback classifies a `parseToolsEntry`-accepted
spec as a bare Pi-tool name vs a `.theta` path by testing the identifier regex
`/^[A-Za-z_][A-Za-z0-9_]*$/` inline. `src/parser/callable-set.ts` — the module
this file already imports `parseToolsEntry` and `thetaDefaultName` from — exports
`isBareIdentifier(spec)` whose body is exactly that test, documented as "the shape
that marks a `tools:` entry as a Pi-tool name rather than a `.theta` path literal",
and `resolveCallableSet` itself routes on it (callable-set.ts:429). A second
out-of-shard copy exists as the private `isBareToolName` in
`src/extension/tools-entry-gate.ts:32-34`, whose own doc says "the same routing
`resolveCallableSet` applies internally".

## Evidence
src/extension/callable-lowering.ts:455-462 (the fallback loop; line 460 is the inline regex):

```ts
    const parsed = parseToolsEntry(entry.trim());
    if (parsed.kind !== "ok") {
      continue;
    }
    if (parsed.rename !== undefined) {
      names.push(parsed.rename);
      continue;
    }
    names.push(
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(parsed.spec) ? parsed.spec : thetaDefaultName(parsed.spec),
    );
```

The facility, src/parser/callable-set.ts:568-575:

```ts
/**
 * A bare theta identifier `[A-Za-z_][A-Za-z0-9_]*` with no path separator or
 * extension — the shape that marks a `tools:` entry as a Pi-tool name rather
 * than a `.theta` path literal.
 */
export function isBareIdentifier(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}
```

Second copy, src/extension/tools-entry-gate.ts:27-34:

```ts
/**
 * Whether a `tools:` spec is a bare Pi-tool name (identifier-shaped, no path
 * separator or `.theta` extension) rather than a `.theta` path literal — the same
 * routing `resolveCallableSet` applies internally.
 */
function isBareToolName(spec: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(spec);
}
```

Feature-for-feature: all three test the same subject class — a
`parseToolsEntry`-shaped `tools:` spec — with the byte-identical regex; the call
sites need nothing beyond the boolean the export already returns. The importer
already resolves `../parser/callable-set` (callable-lowering.ts:54:
`import { parseToolsEntry, thetaDefaultName, type ResolvedCallable } from "../parser/callable-set";`),
so no new module edge is needed at the shard site. Search used:
`grep -n '\^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$' src/` → 22 hits; only these two hits
apply the regex to a `tools:` spec (the others classify identifiers in
parser/diagnostics contexts, a different subject); `grep -n isBareIdentifier src/`
→ 4 hits, callers only in callable-set.ts:429 and runtime-tools.ts:100.

## Why this is a problem
callable-set.ts:557-562 states the export-for-reuse rationale explicitly for its
neighbour `thetaDefaultName` ("the SINGLE implementation … so the two readers
cannot diverge on a hyphenated stem, bug 0253"), and `presentedCallableNames`'s
own doc-comment (callable-lowering.ts:444-458) argues at length that its fallback
must agree with `resolveCallableSet`'s "SAME closed grammar" — yet the very
classification that decides pi-tool-vs-`.theta` routing is a hand-inlined copy of
the classifier `resolveCallableSet` actually uses, not the shared export. If the
bare-name shape ever changes in `isBareIdentifier` (the one `resolveCallableSet`
routes on), the fallback arm and the tools-entry gate silently diverge from the
resolver — exactly the divergence class bugs 0069/0253 fixed for the default-name
half of this same expression.

## Suggested direction (non-binding, optional)
Unproven hypothesis: import `isBareIdentifier` alongside `parseToolsEntry` /
`thetaDefaultName` at both sites and delete the inline regex / private wrapper.
The fix stage owns the actual shape.

## False-positive check
- Exemption check: no D8 exemption keys `src/extension/callable-lowering.ts` or
  `#presentedCallableNames` (the two D8 exemptions are discovery-walk and
  production-theta-producer hosts).
- Prior-filing check: PTQ-1236 and qw20260922211400-d8-02 concern
  `thetaDefaultName` reimplementations at other hosts, not `isBareIdentifier`;
  this wave's D4 filing qw20260923023517-d4-01-theta-callee-path-and-presented-names-parallel
  claims the snapshot-absent fallback PATTERN parallel between `thetaCalleePath`
  and `presentedCallableNames`, not the inlined classifier — distinct root cause.
- Spec check: frontmatter-fields-a.md's `tools:` grammar names the bare-identifier
  shape; using the shared classifier drops no behaviour (byte-identical regex).
- Liveness: `presentedCallableNames` has 2 src importers per the structural map;
  the fallback arm is documented as harness-serving but is production code either
  way — no demotion proposed.
- D2 precedents: not an export-style or placeholder question; the inline regex has
  no stated rationale for bypassing the export (the surrounding comments argue FOR
  sharing the resolver's derivations).

## Triage
verdict: questionable — accounting verified: all three excerpts byte-match (callable-lowering.ts:460 inline regex inside `presentedCallableNames`, tools-entry-gate.ts:32-34 private `isBareToolName`, callable-set.ts:573-575 exported `isBareIdentifier`), the regex is byte-identical at all three so the facility covers the only need (a boolean) with no behaviour dropped; `isBareIdentifier` is the arm `resolveCallableSet` routes on (callable-set.ts:429) and is already consumed cross-module by runtime-tools.ts:100, and callable-lowering.ts:55 already imports from `../parser/callable-set` so no new module edge; regex re-search gives 23 src hits (candidate said 22 — drift only) with these the only two applied to a `tools:` spec; host has no D8 exemption (only discovery-walk#enumerateDirectory and production-theta-producer#firstAdmittingArmProperties); not a duplicate — resolved PTQ-0382 consolidated the admission gate in production-composition but kept the private `isBareToolName`, PTQ-1236 concerns `thetaDefaultName`, and sibling d4-01 tracks the snapshot-fallback pattern parallel not the inlined classifier; per the D8 rule the simpler shape (import the export) is a design decision for a human ruling (triage: claude-fable-5-1)
triage worker failed (verdict not applied; re-triaged next wave) (loop, 2026-09-23)
verdict: confirmed — RATIFIED (human, 2026-09-23): confirmed - batch ruling; triage verification trusted.
