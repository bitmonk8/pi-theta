---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: checkThetaImports still bundles six sequential import-subsystem concerns at 875 LOC after Seam A's extraction landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:905-1779
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#checkThetaImports # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260915044704
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-15
---

# checkThetaImports still bundles six sequential import-subsystem concerns at 875 LOC after Seam A's extraction landed

## Observation
This host was previously filed as PTQ-0334 ("checkThetaImports still bundles eight sequential
import-subsystem phases after Seam B's extraction landed", D9 breakdown, strong band,
confirmed and fixed), which the human ratified in part: "Seam A only ... Lift the re-export
chain fixpoint ... into a module-local top-level function ... Seam C (per-specifier loop) is
NOT ratified this wave." Seam A landed: `resolveReExportClosure` now exists as its own
top-level function (614-893, 280 LOC — filed separately in this same wave), called once from
`checkThetaImports` at line 1584. `checkThetaImports` itself is now 905-1779, 875 LOC (still
function band strong, threshold 200) — 1 src / 37 test importers per the map — dropped from
PTQ-0334's own 1124 LOC by almost exactly the 243 LOC PTQ-0334 attributed to the extracted
re-export-fixpoint row. Seam C — the per-specifier loop, the one PTQ-0334 explicitly deferred
rather than refused — is unchanged in kind (still present, now 298 LOC and now populating a
seventh map, `importedSchemaShapes`, that did not exist at PTQ-0334's filing) at shifted line
numbers, and the function's other rows remain the same sequential, independently spec-cited
phases PTQ-0334 already found.

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited lines immediately
before filing; the six rows sum exactly to the function's 875 LOC):

| concern | members | lines | LOC |
|---|---|---|---|
| resolution & cycle-graph plumbing | signature/setup, `parseThetaLib`, `walkThetaLib` | 905-1064 | 160 |
| runtime materialization of imported symbols | `buildModuleScope`, `materializeChain` | 1065-1194 | 130 |
| per-specifier resolution & type-fact collection (PTQ-0334's deferred Seam C) | setup maps, main per-decl/per-specifier loop | 1195-1492 | 298 |
| `system:` template patch + imported-symbol usage checks | `patchSystemTemplateForImports` call, four `checkImported*` pushes | 1493-1571 | 79 |
| re-export closure delegation + transitive lib-level checks + own-specifier collision | `resolveReExportClosure` call, per-lib registration/unknown-symbol/collision loop, theta-level collision push | 1572-1680 | 109 |
| cross-file subagent-fn checks + IMP-5 cycle detection + result assembly | `checkSubagentFnStaticResolution`/`checkSubagentFnModelOverrides` loop, `detectImportCycle` loop, `undelivered` + return | 1681-1779 | 99 |

Signature (905-914):
```ts
export async function checkThetaImports(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: FileSystem;
    readonly parseDeps: PassParseDeps;
    /**
     * Bug 0267: whether this call may claim its rows against the pass-scoped
     * delivered-set (bug 0264's dedup). DEFAULT true — every existing call
     * site (the discovered-theta compose loop) keeps claiming, byte-equivalent
     * to before this parameter existed.
```

Runtime-materialization row start (1065-1072):
```ts
  const buildModuleScope = async (
    resolvedPath: string,
    body: ThetaBody,
    callingFrontmatter: ParsedFrontmatter | null,
  ): Promise<ModuleScope> => {
    const cached = moduleScopeCache.get(resolvedPath);
    if (cached !== undefined) {
      return cached;
```

Per-specifier loop start (1266-1273), PTQ-0334's own deferred Seam C:
```ts
  for (const decl of importDecls) {
    const spec = decl.path;
    const site = { file: input.sourcePath, range: decl.range };

    // A wrong-extension / backslash import already produced its parse error
    // (IMP-2, at whole-file parse); do not resolve it (it can never resolve).
    if (!spec.endsWith(".thetalib")) {
      continue;
    }
```

`system:` template patch row start (1491-1498):
```ts
  // Bug 0422/0423/0450 — LOAD-phase `system:` template revalidation and
  // sidecar carry for directly-imported schemas/enums (import-system-template-patch.ts).
  const patchedParts = patchSystemTemplateForImports(
    input,
    importedSchemaShapes,
    importedEnums,
    diagnostics,
  );
```

Re-export delegation row start (1583-1585), Seam A's own landed call site:
```ts
  diagnostics.push(
    ...(await resolveReExportClosure(walked, parseThetaLib, probe, resolver, unreadablePaths)),
  );
```

Cross-file subagent-fn row start (1695-1699):
```ts
  for (const [resolvedPath, parsed] of parseCache) {
    if (parsed === undefined) {
      continue;
    }
    diagnostics.push(
      ...checkSubagentFnStaticResolution({
```

## Why this is a problem
Function band strong (875 LOC, threshold 200) — the presumption of breakdown stands only
against a strong concrete reason; PTQ-0334 already worked through this bar for the pre-Seam-A
shape (1124 LOC, eight rows) and the same reasoning applies to what remains. Reasons
considered:
- Closed-enumeration dispatch: the six rows are sequential, unconditional phases citing
  different spec items (graph/resolution plumbing, bug 0303's module-scope materialization,
  bug 0138/0429/0430/0448's per-specifier collection, the `system:` template bugs, imports.md
  §Re-exports/§"Name collisions", RFC 0001 FN-6/7/9, IMP-5) run one after another — not arms
  of one closed-set dispatch.
- Single algorithm with shared local state: `probe`/`resolver`/`parseThetaLib`/`parseCache`/
  `unreadablePaths` are shared across most rows, but `resolveReExportClosure` (this file's own
  Seam A precedent) already proves this exact class of state externalises in a 5-parameter
  signature; the per-specifier loop's own seven output maps (`importedFns`/`importedSchemas`/
  `importedEnums`/`importedNonCtorNames`/`importedTypeSchemas`/`importedTypeEnums`/
  `importedSchemaShapes`) are produced by ONE row (row 3) and consumed by a DIFFERENT,
  separable row (row 4) — a producer/consumer handoff a returned record settles, not a
  6-or-more-local bundle every row must share.
- Data-only module or type family: the function is executable orchestration; no type/table
  content.
- One grammar production family: not applicable — a compose-pass checker over an
  already-parsed AST, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT EDIT` marker (grepped, no
  hits); every commit touching this file is a hand-authored, bug/RFC-cited fix (`git log
  --oneline --follow`, no generated-code footprint).
Strong-band extra (required beyond the concrete reason): no `imports.md` clause ties all six
rows into one ordered critical section — the module's own header organises IMP-1/3/4/5/6/7,
§Re-exports, and §"Name collisions" as separate spec items, and the two rows PTQ-0304/PTQ-0334
already carved out into `import-system-template-patch.ts` and `resolveReExportClosure` prove
that order-preserving extraction is achievable one row at a time via a caller that invokes
each piece in sequence, exactly as this function already does for both landed seams. No
measured-cost citation exists. `git log --oneline --follow --
src/extension/import-static-checks.ts | grep -iE "revert|split|extract"` returns no hits.
`quality/exemptions.json` carries no entry for this host. The one human ruling on record for
this host (PTQ-0334's triage) is not a keep-whole ruling for the remaining rows — it
explicitly withholds ratification from Seam C ("NOT ratified this wave") without addressing
the other rows PTQ-0334's own inventory already separated out (resolution plumbing,
materialization, `system:` patch delegation, cross-file subagent-fn checks, IMP-5).

## Suggested direction (non-binding, optional)
Continuing PTQ-0334's own pre-announced, not-yet-ratified seam; the human ratifies one (this
project's sibling file shows the identical "deferred, not refused" pattern re-filed
successfully at PTQ-0321 → PTQ-0351).
- Seam C (PTQ-0334's own, still deferred): extract the per-specifier resolution loop
  (1195-1492, 298 LOC) into a helper returning the seven populated maps (`importedFns`/
  `importedSchemas`/`importedEnums`/`importedNonCtorNames`/`importedTypeSchemas`/
  `importedTypeEnums`/`importedSchemaShapes`) plus `entryResolvedPaths`/`allSpecifiers`/
  `registrationFilteredPaths` as one record -> hypothesis `collectImportedSpecifierFacts` - 0
  exported symbols moved (module-private today), 0 external importers (src/tests);
  cross-references back into the host: the returned record feeds the `system:` template patch
  row, the four `checkImported*` pushes, the transitive lib-level checks row, and the IMP-5
  cycle-detection row (`entryResolvedPaths`).
- Seam D: extract the resolution & cycle-graph plumbing (905-1064, 160 LOC: `parseThetaLib`,
  `walkThetaLib`, and their shared caches) into a helper returning the populated
  `parseCache`/`unreadablePaths`/`walked`/`graphEdges` plus the `parseThetaLib`/`walkThetaLib`
  closures themselves (needed by later rows) -> hypothesis `buildThetaLibResolutionGraph` - 0
  exported symbols moved, 0 external importers; cross-references back into the host: consumed
  by every later row.

## False-positive check
Band: strong (function LOC 875, threshold 200). Reasons-considered: listed above with the
evidence that defeated each (sequential unconditional phases citing distinct spec items; the
file's own two already-landed seams prove the shared-collaborator state externalises in small
parameter lists; no type/table content; not a parser production; no generated-code marker).
Exemptions check: `quality/exemptions.json` grepped for `import-static-checks.ts` — no entry.
Generated-code check: grepped for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits.
Spec-mirror check: `imports.md` organises §Path resolution/§Unknown imported
symbol/§Cycles/§Re-exports/§"Name collisions" as separate sections; nothing mandates
single-function implementation. Prior-finding check: grepped `quality/issues` +
`quality/resolved` + `quality/intake` for `checkThetaImports` — the only breakdown hits are
`PTQ-0304` (confirmed/fixed, Seam B) and `PTQ-0334` (confirmed/fixed, Seam A) — both closed by
their own ratified, now-landed seam; this filing supplies fresh line ranges/LOC and a fresh
six-row inventory against the current 875-LOC function (row boundaries and content shifted
from PTQ-0334's 1124-LOC numbering by Seam A's landing) rather than reproducing either prior
filing's now-stale accounting, continuing a thread PTQ-0334's own "NOT ratified this wave"
language leaves open, the same "deferred, not refused" pattern this wave's sibling file shows
already re-filed once (PTQ-0321 → PTQ-0351). Not a duplicate of `PTQ-0325` (a D4 finding: the
per-check wire-name expression recomputed four times — a distinct, already-fixed duplication
concern, unrelated to this function's phase bundling).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan reproduces the file (1779 LOC/justify), Seam A's landed resolveReExportClosure (614-893/280 LOC) and checkThetaImports (905-1779/875 LOC/strong, 1/37 importers) exactly; all six row boundaries, the signature, and every quoted excerpt match the source verbatim, sum to 875 LOC, and are real distinct concerns; exemptions/generated-code/git-log checks hold and this is not a duplicate of resolved PTQ-0304/PTQ-0334 (each closed by its own already-landed seam) or PTQ-0325 (D4, unrelated) — D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
