---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: resolveReExportClosure bundles four re-export-closure phases into one 280-line function now that it is its own host
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:614-893
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#resolveReExportClosure # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260915044704
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-15
---

# resolveReExportClosure bundles four re-export-closure phases into one 280-line function now that it is its own host

## Observation
`src/extension/import-static-checks.ts` is 1779 LOC (band justify). `resolveReExportClosure`
(614-893, 280 LOC, function band strong) is a module-private function PTQ-0334's ratified
Seam A created verbatim out of `checkThetaImports`: the human ruling (2026-09-14) directed
"Lift the re-export chain fixpoint - the closures closeOverReExports, fixReExportedNames,
diagnoseReExports, diagnoseReExportCollisions ... into a module-local top-level function ...
Bodies moved verbatim with their comments." That move landed — the function exists at line
614, its own doc comment states it was "split out of `checkThetaImports` into its own
top-level function," and it is called exactly once, from `checkThetaImports` at line 1584. The
move did not address the moved code's own size: as its own standalone host it is now 80 LOC
over the 200-LOC strong-band threshold, with its own nested `closeOverReExports` (654-724, 71
LOC) independently in the zone band.

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited lines immediately
before filing; the six rows sum exactly to the function's 280 LOC):

| concern | members | lines | LOC |
|---|---|---|---|
| setup & shared closure state | `ReExportEdge` interface, `libDeclaredNames`, `reExportEdges`, `closedOver` | 614-641 | 28 |
| re-export-edge collection walk (Phase 1) | `closeOverReExports` | 642-724 | 83 |
| least-fixpoint settlement (Phase 2) | `fixReExportedNames` | 725-758 | 34 |
| unknown-re-exported-symbol diagnosis (Phase 3) | `diagnoseReExports` | 759-780 | 22 |
| same-name collision detection (bug 0334) | `resolveDeclaringSite`, `diagnoseReExportCollisions` | 781-884 | 104 |
| orchestration tail | walk every `walked` root, invoke fixpoint+diagnose+collisions, return | 885-893 | 9 |

Setup (614-621):
```ts
async function resolveReExportClosure(
  walked: Set<string>,
  parseThetaLib: (resolvedPath: string) => Promise<ParsedThetaLib | undefined>,
  probe: CachingThetaLibProbe,
  resolver: Resolver,
  unreadablePaths: Set<string>,
): Promise<Diagnostic[]> {
  const diagnostics: Diagnostic[] = [];
```

Phase 1 start (654-662), the nested `closeOverReExports` (654-724, 71 LOC, independently
flagged zone band):
```ts
  const closeOverReExports = async (resolvedPath: string): Promise<void> => {
    if (closedOver.has(resolvedPath)) {
      return;
    }
    closedOver.add(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
      libDeclaredNames.set(resolvedPath, []);
      return;
    }
```

Phase 2 start (738-748):
```ts
  const fixReExportedNames = (): Map<string, Set<string>> => {
    const provided = new Map<string, Set<string>>();
    for (const [path, names] of libDeclaredNames) {
      provided.set(path, new Set(names));
    }
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of reExportEdges) {
        const target = provided.get(edge.fromLib);
        if (target === undefined || target.has(edge.exported)) {
```

Phase 3, whole (765-780):
```ts
  const diagnoseReExports = (provided: Map<string, Set<string>>): void => {
    for (const edge of reExportEdges) {
      const sourceExports = provided.get(edge.sourceLib) ?? new Set<string>();
      if (sourceExports.has(edge.source)) {
        continue;
      }
      diagnostics.push(
        ...checkImportUnknownSymbols(
          edge.fromLib,
          edge.specPath,
          [{ source: edge.source, local: edge.exported, range: edge.range }],
          [...sourceExports],
        ),
      );
    }
  };
```

Collision-detection start (793-805):
```ts
  const resolveDeclaringSite = (
    lib: string,
    name: string,
    visited: Set<string>,
  ): string | undefined => {
    const key = `${lib}\u0000${name}`;
    if (visited.has(key)) {
      return undefined;
    }
    visited.add(key);
    if (libDeclaredNames.get(lib)?.includes(name) === true) {
      return key;
    }
```

Orchestration tail, whole (886-893):
```ts
  for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();

  return diagnostics;
}
```

## Why this is a problem
Function band strong (280 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: the six rows are unconditional, sequential phases (collect
  edges, settle fixpoint, diagnose unresolved, diagnose collisions), not arms of a
  switch/if-chain over a spec-named closed set; no dispatch structure exists in this function
  at all.
- Single algorithm with shared local state: only three locals span more than one row —
  `diagnostics` (written by rows 2/4/5), `libDeclaredNames` (written row 2, read rows 3/5),
  `reExportEdges` (written row 2, read rows 3/4/5) — under the 6-or-more bar. This project's
  own prior action already demonstrates the state externalises cheaply: this very function
  was extracted from `checkThetaImports` taking only 5 explicit parameters (`walked`,
  `parseThetaLib`, `probe`, `resolver`, `unreadablePaths`); the collision-detection block (row
  5, 104 LOC) similarly needs only `reExportEdges`/`libDeclaredNames` to run standalone and
  push its own diagnostics.
- Data-only module or type family: the one interface (`ReExportEdge`, 12 of 280 LOC ≈ 4%) is
  far under the 80% bar.
- One grammar production family: not applicable — a compose-pass checker walking an
  already-resolved `.thetalib` graph, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT`/`autogenerated` marker
  (grepped the file, no hits).
Strong-band extra (required beyond the concrete reason): the function's own doc comment
states its job was to give the module header's "three ordered phases ... one home instead of
the caller's" — an ordering requirement, not a single-function-body requirement: order is
preserved today by a caller (`checkThetaImports`) invoking this whole function once and
appending its returned diagnostics, exactly the same caller-preserves-order pattern that would
apply one level deeper if, e.g., the collision-detection block were similarly pulled out and
invoked in sequence. No measured-cost citation exists anywhere in the file, its tests, or the
docs. `git log --oneline --follow -- src/extension/import-static-checks.ts | grep -iE
"revert|split|extract"` returns no hits — no prior split of this code was reverted (its only
split is PTQ-0334's own landed, non-reverted extraction). `quality/exemptions.json` carries no
entry for this host.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (matching this project's own precedent of
ratifying one seam per host per wave).
- Seam A: extract the bug-0334 same-name collision detection (`resolveDeclaringSite` +
  `diagnoseReExportCollisions`, 781-884, 104 LOC) into its own module-private top-level
  function taking `reExportEdges` and `libDeclaredNames` as explicit parameters and returning
  `Diagnostic[]` -> hypothesis `diagnoseReExportCollisions` (name unchanged, now top-level) -
  0 exported symbols moved (module-private today), 0 external importers (src/tests),
  cross-references back into the host: none beyond the two parameters.
- Seam B: extract the collection walk (`closeOverReExports`, 642-724, 83 LOC) into its own
  top-level function taking `parseThetaLib`, `probe`, `resolver`, `unreadablePaths` and
  returning the populated edge/name state (or accepting it as an out-parameter) -> hypothesis
  `collectReExportEdges` - 0 exported symbols moved, 0 external importers, cross-references
  back into the host: consumed by the fixpoint, diagnosis, and collision phases.

## False-positive check
Band: strong (function LOC 280, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (no dispatch structure; 3 shared locals under the 6-or-more bar,
with this project's own prior 5-parameter extraction of this exact function proving the state
externalises cheaply; one 12-LOC interface far under 80%; not a parser production; no
generated-code marker). Exemptions check: `quality/exemptions.json` grepped for
`import-static-checks.ts` — no entry. Generated-code check: grepped the file for
`@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check: the function's own
doc comment cites "three ordered phases" as an execution-order statement, not a
single-function-body mandate; `imports.md` §Re-exports states the resolution algorithm's
semantics, not its code shape. Prior-finding check: grepped `quality/issues` +
`quality/resolved` + `quality/intake` for `resolveReExportClosure` — the only hits are
`PTQ-0304` and `PTQ-0334` (both resolved/fixed), which propose and then land the EXTRACTION of
this function out of `checkThetaImports`; neither evaluates the extracted function's OWN
internal size as a fresh host, which did not exist as a standalone, independently-measurable
declaration until Seam A landed. This is not a re-file of either.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan reproduces the file (1779 LOC/justify), resolveReExportClosure (614-893/280 LOC/strong) and nested closeOverReExports (654-724/71 LOC/zone) exactly; the six-row inventory sums to 280 LOC with each row a verified distinct closure at the cited lines, and the reasons-considered (only 3 shared locals, well under the 6-or-more bar; no dispatch structure; ~4% data/type LOC; imports.md §Re-exports/§Name collisions state semantics only, no code-shape mandate; no exemption/generated-marker/reverted-split) are complete; a fresh post-Seam-A host, not a duplicate of resolved PTQ-0304/PTQ-0334 (pre-extraction checkThetaImports) or the untriaged sibling d9-02 (checkThetaImports, a different host) — D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
