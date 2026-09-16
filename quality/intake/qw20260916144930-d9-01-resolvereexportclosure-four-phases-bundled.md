---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: resolveReExportClosure still bundles four re-export-resolution phases at 280 LOC after checkThetaImports's Seam C landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:623-902
  - src/extension/import-static-checks.ts:663-733
  - src/extension/import-static-checks.ts:747-767
  - src/extension/import-static-checks.ts:774-789
  - src/extension/import-static-checks.ts:802-893
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#resolveReExportClosure # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260916144930
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-16
---

# resolveReExportClosure still bundles four re-export-resolution phases at 280 LOC after checkThetaImports's Seam C landed

## Observation
`resolveReExportClosure` (src/extension/import-static-checks.ts:623-902, 280
LOC, function band strong) is `checkThetaImports`'s re-export-chain-resolution
delegate; it was itself extracted from `checkThetaImports` by an earlier
D9 seam (commit `a01c35f1`, 2026-09-14). This exact host was reviewed once
before, in wave `qw20260915044704`, and human-deferred rather than ratified
or refused: "deferred, not refused — same host file (import-static-checks.ts)
as the ratified Seam C on checkThetaImports, and one seam per host per wave.
Re-file once Seam C lands" (`quality/TRIAGE_LOG.md:68`). `checkThetaImports`'s
Seam C (the per-specifier resolution loop) is now confirmed landed —
`quality/resolved/PTQ-0368-checkthetaimports-seam-c-still-bundled.md`
(status: fixed) records its ratification and landed result,
`collectImportedSpecifierFacts`, which is present in the current file exactly
as described (924-1274, 351 LOC, per the structural map) and was produced by
git commit `32b4ce8e` ("quality: qw20260916045442 fix
d9/src__extension__import-static-checks.ts"). The deferral's own condition is
therefore satisfied, and `resolveReExportClosure`'s own body is unchanged
since the deferred filing (it sits earlier in the file than
`checkThetaImports`, so Seam C's landing did not move it).

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited
lines immediately before filing; the six rows sum exactly to the function's
280 LOC):

| concern | members | line ranges | LOC |
|---|---|---|---|
| shared state setup | signature, `ReExportEdge` interface, `libDeclaredNames`/`reExportEdges`/`closedOver` | 623-650 | 28 |
| re-export graph collection (IMP-1 mirror, one push per `export` statement) | `closeOverReExports` (plus its own doc comment) | 651-733 | 83 |
| fixpoint settlement (imports.md §Re-exports, least-fixpoint definition) | `fixReExportedNames` (plus its own doc comment) | 734-767 | 34 |
| unknown-re-export-symbol diagnosis (reuses `checkImportUnknownSymbols`) | `diagnoseReExports` (plus its own doc comment) | 768-789 | 22 |
| re-export name-collision diagnosis (bug 0334, its own key scheme + traversal) | `resolveDeclaringSite`, `diagnoseReExportCollisions` (plus their own doc comments) | 790-893 | 104 |
| orchestration (calls the four phases in fixed order) | trailing `for`/calls/`return` | 894-902 | 9 |

The function's own current call-site comment (1688-1698, re-read
immediately before filing) independently states the same four sequential
actions this table separates, one clause each:
```ts
  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every `.thetalib` the import walk reached (`walked`,
  // not only the entry libs — bug 0333's fix — so a re-export fault inside a lib
  // reached only through plain-`import` hops is covered too), settle the fixpoint
  // over the whole collected file set, and only then diagnose — unknown re-exported
  // names, then same-name collisions across declaring sites (bug 0334). Running it over the
```

Collection phase start (663-667) — recursive, self-contained, never reads the
fixpoint or either diagnose phase:
```ts
  const closeOverReExports = async (resolvedPath: string): Promise<void> => {
    if (closedOver.has(resolvedPath)) {
      return;
    }
    closedOver.add(resolvedPath);
```

Fixpoint phase (747-751) — reads only `libDeclaredNames`/`reExportEdges`:
```ts
  const fixReExportedNames = (): Map<string, Set<string>> => {
    const provided = new Map<string, Set<string>>();
    for (const [path, names] of libDeclaredNames) {
      provided.set(path, new Set(names));
    }
```

Bug-0334 collision phase (802-807, 844-846) — its own key scheme
(`` `${lib}\u0000${name}` ``) and its own recursive traversal, never calling
into or reading the settled fixpoint `Map` the diagnose-unknown phase
produces:
```ts
  const resolveDeclaringSite = (
    lib: string,
    name: string,
    visited: Set<string>,
  ): string | undefined => {
    const key = `${lib}\u0000${name}`;
```
```ts
  const diagnoseReExportCollisions = (): void => {
    const groups = new Map<string, Map<string, ReExportEdge[]>>();
    for (const edge of reExportEdges) {
```

Orchestration tail (895-902) — the four phases called in fixed order, each a
separate top-level statement:
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
Function band strong (280 LOC, threshold 200) — the presumption of breakdown
stands only against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: not applicable — the four phases are
  sequential, unconditional steps citing different rules (the IMP-1 mirror,
  imports.md §Re-exports' fixpoint definition, `checkImportUnknownSymbols`'
  existing row, and bug 0334's separately-landed collision check), not arms
  of one dispatch.
- Single algorithm with shared local state: only three locals
  (`diagnostics`, `libDeclaredNames`, `reExportEdges`) are read by more than
  one phase — well under the "6 or more" bar this reason names. The
  bug-0334 collision pair (`resolveDeclaringSite` +
  `diagnoseReExportCollisions`) reads only two of those three
  (`libDeclaredNames`, `reExportEdges`) and writes only to `diagnostics`; it
  never reads the fixpoint's own settled `Map<string, Set<string>>` output.
  A two-parameter extraction (`libDeclaredNames`, `reExportEdges`) returning
  its own `Diagnostic[]` — exactly the shape the deferred filing's own hint
  named ("two explicit parameters, no other host cross-reference") —
  covers it.
- Data-only module or type family: not applicable — executable orchestration
  and two small recursive traversals, no type/table content.
- One grammar production family: not applicable — a compose-pass checker
  over an already-resolved `.thetalib` graph, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT
  EDIT`/`autogenerated` marker (`grep` run against the file, no hits).
Strong-band extra (required beyond the concrete reason): the module
header's own re-export-resolution bullet (40-42, "Diagnosing only after
the fixpoint settles is what makes the answer a function of the
`.thetalib` file set alone") does state an ordering invariant, but the
orchestration tail already expresses that ordering as four discrete,
separately-named top-level calls (895-902,
quoted above) rather than as one fused block — a seam that relocates any one
phase to a module-private top-level helper leaves this call sequence
untouched, so it does not interleave any observable step; it only relocates
where the phase's own body lives textually. No measured-cost citation exists
anywhere in the file or its tests. `git log --oneline --follow --
src/extension/import-static-checks.ts | grep -iE "revert|split|extract"`
returns no hits — no prior split of this function, reverted or otherwise.
`quality/exemptions.json` carries no entry for this host (grepped for
`import-static-checks.ts`, the one hit is an unrelated D8 entry for
`enumerateDirectory`, a function this file no longer even contains). The one
ruling on record for this host (`qw20260915044704-d9-01`'s human-defer) is
not a keep-whole ruling — it names the exact condition ("re-file once Seam C
lands") that this filing satisfies.

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one. Ordered by the deferred
filing's own stated confidence.
- Seam A (the deferred filing's own hint): hoist `resolveDeclaringSite` +
  `diagnoseReExportCollisions` (790-893, 104 LOC counting each helper's own
  doc comment; 802-825 and 844-893, 74 LOC of declared bodies alone, bug
  0334's collision check) into a module-private helper taking
  `libDeclaredNames` and `reExportEdges`
  as explicit parameters and returning `Diagnostic[]` -> hypothesis
  `diagnoseReExportCollisions` (top-level) - 0 exported symbols today
  (module-private), 0 external importers (src/tests); cross-references back
  into the host: none beyond the two read-only inputs.
- Seam B: hoist `fixReExportedNames` + `diagnoseReExports` (747-789, 43 LOC)
  into a module-private helper taking the same two inputs and returning
  `Diagnostic[]` -> hypothesis `settleAndDiagnoseUnresolvedReExports` - 0
  exported symbols, 0 external importers; cross-references back into the
  host: none (the bug-0334 pair never reads this phase's settled `Map`).
- Seam C (lower confidence, more entangled): hoist `closeOverReExports`
  (663-733, 71 LOC) alone -> hypothesis `collectReExportEdges` - would need
  `probe`/`resolver`/`parseThetaLib`/`unreadablePaths`/`diagnostics` (5
  external dependencies) plus returning the populated
  `libDeclaredNames`/`reExportEdges`, and stays self-recursive.

## False-positive check
Band: strong (function LOC 280, threshold 200). Reasons-considered: listed
above with the evidence that defeated each (only 3 cross-phase-shared
locals, well under the 6-or-more bar; the bug-0334 pair reads only 2 of
those 3; no type/table content; not a parser production; no generated-code
marker). Exemptions check: `quality/exemptions.json` grepped for
`import-static-checks.ts` — the sole hit is `D8:...#enumerateDirectory`, a
different lens and a function no longer in this file. Generated-code check:
grepped for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits.
Spec-mirror check: imports.md §Re-exports states the resolution rule once;
bug 0334 (`git show 595f0b70` confirms 2026-08-28, `diagnoseReExportCollisions`
/ `resolveDeclaringSite`) is a separately-landed, later bug layered onto that
rule — two distinct citations for two of the four phases, not one spec
clause mandating single-function implementation. Prior-finding check: this
host's only prior review is the human-deferred `qw20260915044704-d9-01`
(`quality/TRIAGE_LOG.md:68`, never promoted to a PTQ number, not itself
present in `quality/intake/`), whose named blocker
(`checkThetaImports`'s Seam C) is now confirmed landed via
`quality/resolved/PTQ-0368-checkthetaimports-seam-c-still-bundled.md`
(status: fixed) and the current map's `collectImportedSpecifierFacts`
declaration — this filing is the invited re-file, supplying the same
623-902/280-LOC accounting (unchanged, since Seam C landed later in the
file) rather than a duplicate. Also checked
`quality/resolved/PTQ-0353-reexport-collision-phase-uncounted.md` (D2,
fixed): a different root cause (the call-site/header comments' stale phase
*count*, not a breakdown claim), whose own evidence independently
corroborates this filing's four-phase structure rather than duplicating it.
Not a deadness claim: `resolveReExportClosure` and all four inner phases are
live, called once from `checkThetaImports` on every compose pass (verified
at line 1701, `...(await resolveReExportClosure(walked, parseThetaLib,
probe, resolver, unreadablePaths))`).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan independently reproduces resolveReExportClosure at 623-902/280 LOC/strong band exactly, all six inventory rows and every quoted excerpt (663-667, 747-751, 802-807, 844-846, 895-902, 1688-1698) match the source byte-for-byte, the shared-local count (3: diagnostics/libDeclaredNames/reExportEdges, well under the design doc's own ≥6 bar) and the collision pair's narrower 2-of-3 read are independently verified, and the deferral's own named condition is genuinely satisfied (git a01c35f1 landed resolveReExportClosure 2026-09-14, git 32b4ce8e landed collectImportedSpecifierFacts 2026-09-16 exactly where the map now shows it at 924-1274/351 LOC, PTQ-0368 status: fixed, TRIAGE_LOG.md:68 quotes verbatim) — not a duplicate (never promoted to a PTQ; this is the invited re-file per repo convention, cf. PTQ-0333→PTQ-0367); one evidentiary claim does not reproduce (quality/exemptions.json has zero entries mentioning import-static-checks.ts, not "one hit" for enumerateDirectory — that entry keys src/discovery/discovery-walk.ts, unrelated, apparently cross-contaminated from this wave's sibling d9-02 filing on that file) though the substantive conclusion it supports (no applicable exemption on this host) still holds; D9 breakdown accounting caps at questionable — the seam's target shape is a human ruling, never confirmed (triage: claude-opus-5)
