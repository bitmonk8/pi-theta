---
id: PTQ-0334
title: checkThetaImports still bundles eight sequential import-subsystem phases after Seam B's extraction landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:604-1727
  - src/extension/import-static-checks.ts:784-1026
  - src/extension/import-static-checks.ts:1167-1454
  - src/extension/import-static-checks.ts:1529-1533
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#checkThetaImports # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260914091051
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# checkThetaImports still bundles eight sequential import-subsystem phases after Seam B's extraction landed

## Observation
`src/extension/import-static-checks.ts` is 1727 LOC (band justify). `checkThetaImports`
(604-1727, 1124 LOC, function band strong) is 65% of the file and its only complex export
(1 src / 38 test importers per the map). This is a fresh-evidence continuation of
`PTQ-0304` (confirmed, fixed): that finding's ratified Seam B — moving the `system:`
template load-phase wire-rename patch (286 LOC) into a new sibling module
`import-system-template-patch.ts` — landed at commit `6a68f58c` (374 lines added to the new
file, this file cut by 340 net), taking `checkThetaImports` from the finding's 1402 LOC to
the current 1124. That ratification stated verbatim: "Seams A and C are NOT ratified - D9
re-files the next seam after this lands."

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited lines immediately
before filing; the eight rows sum exactly to the function's 1124 LOC):

| concern | members | lines | LOC |
|---|---|---|---|
| resolution & cycle-graph plumbing | parseThetaLib, walkThetaLib, graphEdges, walked, unreadablePaths | 604-783 | 180 |
| re-export chain fixpoint (defined here; invoked at row 6) | closeOverReExports, fixReExportedNames, diagnoseReExports, diagnoseReExportCollisions | 784-1026 | 243 |
| runtime materialization of imported symbols | buildModuleScope, materializeChain | 1027-1166 | 140 |
| per-specifier resolution & type-fact collection | importedFns/importedSchemas/importedEnums/importedNonCtorNames/importedTypeSchemas/importedTypeEnums + the per-decl loop | 1167-1454 | 288 |
| `system:` template patch delegation + imported-symbol call/ctor/variant/non-ctor checks | patchSystemTemplateForImports call, checkImportedFnCallArgs/SchemaCtorFields/EnumVariantAccess/NonCtorTypeNames | 1455-1517 | 63 |
| re-export phases invocation + transitive lib-level checks | closeOverReExports/diagnoseReExports/diagnoseReExportCollisions calls, per-lib IMP-1/IMP-3/bug-0335 loop | 1518-1616 | 99 |
| own-specifier collision + cross-file subagent-fn checks | checkImportNameCollisions, checkSubagentFnStaticResolution, checkSubagentFnModelOverrides | 1617-1667 | 51 |
| IMP-5 cycle detection + result assembly | detectImportCycle loop, undelivered computation, return | 1668-1727 | 60 |

Re-export chain fixpoint, defined as a local closure (784-790 — moving it requires explicit
parameters, since it is not a top-level function):
```ts
const closeOverReExports = async (resolvedPath: string): Promise<void> => {
    if (closedOver.has(resolvedPath)) {
      return;
    }
    closedOver.add(resolvedPath);
    const parsed = await parseThetaLib(resolvedPath);
    if (parsed === undefined) {
```
...invoked 745 lines later, past three intervening phases (1529-1533):
```ts
for (const resolvedPath of walked) {
    await closeOverReExports(resolvedPath);
  }
  diagnoseReExports(fixReExportedNames());
  diagnoseReExportCollisions();
```

Per-specifier resolution & type-fact collection, start (1167-1171):
```ts
  // Bug 0138 route 2's callee map, local binding name → the directly-resolved
  // library's own `FnDecl` plus that library's statement list. Populated
  // below, in the SAME specifiers loop that already holds each resolved and
  // parsed library body (`materializeChain`'s own loop) — no separate walk.
  const importedFns = new Map<string, ImportedFnCallee>();
```

## Why this is a problem
Function band strong (1124 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: the eight rows are sequential, unconditional phases citing
  different spec items (IMP-1/3/4/5, three re-export phases, bug 0138/0429/0430/0448,
  RFC-0001 FN-6/9) run one after another — not arms of one closed set a single
  switch/if-chain dispatches over.
- Single algorithm with shared local state: `parseCache`/`probe`/`resolver` are shared by
  rows 1-3 and the transitive-checks half of row 6, but the per-specifier loop (row 4, 288
  LOC) and the own-collision/subagent-fn checks (row 7) touch neither the re-export
  closures' `libDeclaredNames`/`reExportEdges` (row 2) nor each other's maps — no
  6-or-more-local bundle spans all eight rows.
- Data-only module/type family: the function is executable orchestration, not tables or
  type declarations.
- One grammar production family: not a parser production; a compose-pass checker.
- Generated code: no `@generated`/`DO NOT EDIT` marker (grepped).
Strong-band extra (required beyond the concrete reason): no imports.md-cited invariant ties
all eight rows into one ordered critical section — the module header's own "three ordered
phases" citation binds only the re-export-fixpoint closures (row 2) to their own later
invocation (row 6), saying nothing about why the resolution plumbing, the materialization
helpers, the per-specifier loop, or the subagent-fn checks must share this function's body.
No measured-cost citation exists. `git log --oneline --follow --
src/extension/import-static-checks.ts | grep -iE "revert|split|extract"` returns no hits.
`quality/exemptions.json` carries no entry for this host.

## Suggested direction (non-binding, optional)
Continuing PTQ-0304's own pre-announced, not-yet-ratified seams; the human ratifies one.
- Seam A (PTQ-0304's own, deferred): extract the re-export chain fixpoint
  (`closeOverReExports`/`fixReExportedNames`/`diagnoseReExports`/`diagnoseReExportCollisions`,
  784-1026, 243 LOC) into a module-local helper taking the parse/resolve collaborators as
  explicit parameters (they are closures today, not top-level functions) and returning the
  settled export map + collision diagnostics -> hypothesis `resolveReExportClosure` - 0
  exported symbols moved (file-private today), 0 external importers (src/tests);
  cross-references back into the host: called from row 6 (1529-1533), reads `walked` and
  `parseThetaLib` (row 1).
- Seam C (PTQ-0304's own, deferred): extract the per-specifier resolution loop (1167-1454,
  288 LOC) into a helper returning the six populated maps
  (`importedFns`/`importedSchemas`/`importedEnums`/`importedNonCtorNames`/`importedTypeSchemas`/`importedTypeEnums`)
  as one record -> hypothesis `collectImportedSpecifierFacts` - 0 exported symbols moved, 0
  external importers; cross-references back into the host: the returned record feeds row 5,
  row 6's post-loop checks, and the final `importedTypeDecls` assembly (row 8).

## False-positive check
Band: strong (function LOC 1124, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (sequential unconditional phases, no 6-plus-local bundle
spanning all eight rows, no type/table content, not a parser production, no generated-code
marker, no cross-row spec-cited critical-section invariant, no measured cost, no reverted
split). Exemptions check: `quality/exemptions.json` grepped for `import-static-checks.ts` —
no entry. Generated-code check: grepped for `@generated`/`DO NOT EDIT`/`autogenerated` — no
hits. Spec-mirror check: `imports.md` organises §Path resolution/§Unknown imported
symbol/§Cycles/§Re-exports/§Name collisions as separate sections; nothing mandates
single-function implementation. Prior-finding check: grepped `quality/issues` +
`quality/resolved` + `quality/intake` for `checkThetaImports` — the only breakdown hit is
`PTQ-0304` (confirmed, fixed — Seam B landed at commit `6a68f58c`,
`import-system-template-patch.ts` now 374 LOC per the map); its own ratification named
Seams A and C as the explicit next steps ("D9 re-files the next seam after this lands")
without ratifying either. This filing supplies fresh line ranges/LOC against the current
1124-LOC function (row boundaries shifted from PTQ-0304's 2057-LOC-file numbering) rather
than reproducing the prior filing's now-stale accounting.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan reproduces the file (1727 LOC/justify) and checkThetaImports (604-1727/1124 LOC/strong, 1/38 importers) exactly, all eight row boundaries and quoted excerpts match the source byte-for-byte, the git-log/exemptions checks hold, and this is the explicitly-invited re-filing of PTQ-0304's own deferred Seams A/C after Seam B landed at 6a68f58c — D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-14): Seam A only - a FUNCTION seam inside import-static-checks.ts. Lift the re-export chain fixpoint - the closures closeOverReExports, fixReExportedNames, diagnoseReExports, diagnoseReExportCollisions (checkThetaImports :784-1026, 243 LOC) - out of checkThetaImports into a module-local top-level function (hypothesis name resolveReExportClosure) taking the collaborators they close over today (walked, parseThetaLib, and whatever else the bodies read) as explicit parameters and returning what row 6 consumes (the settled export map + collision diagnostics, or the same closures bundled as a record if the call pattern needs staged invocation - keep row 6's call order identical). Bodies moved verbatim with their comments; doc comment on the helper; no logic, diagnostic or order-of-effects change; tsc first; report before/after LOC of checkThetaImports. Seam C (per-specifier loop) is NOT ratified this wave.
