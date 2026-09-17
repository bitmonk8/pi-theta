---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: checkThetaImports still bundles six sequential import-subsystem concerns at 608 LOC after Seam C landed
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/import-static-checks.ts:1328-1935
sites: 1                     # count of occurrences cited in Evidence
fix_scope: module            # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/import-static-checks.ts#checkThetaImports # D9 breakdown only: the exemption key
d9_band: strong               # D9 breakdown only: zone | justify | strong
wave: qw20260917045205
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-17
---

# checkThetaImports still bundles six sequential import-subsystem concerns at 608 LOC after Seam C landed

## Observation
`checkThetaImports` (src/extension/import-static-checks.ts:1328-1935, 608 LOC,
function band strong) is the sole exported entry point of
`import-static-checks.ts` (1935 LOC, file band justify), whose header states
its role as load-time compose-pass wiring for the `.thetalib` import
subsystem (imports.md IMP-1/IMP-3/IMP-4/IMP-5/IMP-6/IMP-7, §Re-exports,
§"Name collisions"). It is 1 src / 37 test importers per the structural map.
This host was previously filed as `PTQ-0334` (confirmed, fixed — 1124 LOC,
8-row inventory, ratified "Seam A": lift the re-export chain fixpoint into
`resolveReExportClosure`) and `PTQ-0368` (confirmed, fixed — 875 LOC, 6-row
inventory, ratified "Seam C": lift the per-specifier loop into
`collectImportedSpecifierFacts`). Both landed seams are present in the
current file exactly as this shard's own map shows
(`resolveReExportClosure` at 651-930, `collectImportedSpecifierFacts` at
966-1316, both re-read directly). `PTQ-0368`'s own ratification named the
next step explicitly and left it unratified: "Seam D (resolution and
cycle-graph plumbing) is NOT ratified — D9 re-files after." That row is
unchanged in kind since `PTQ-0368`'s own inventory (its rows 1-2); this
filing supplies the current 608-LOC six-row accounting.

## Evidence
Distinct-concern inventory (every boundary re-read verbatim at the cited
lines immediately before filing; the six rows sum exactly to the function's
608 LOC):

| concern | members | lines | LOC |
|---|---|---|---|
| resolution & cycle-graph plumbing (`PTQ-0368`'s own deferred "Seam D") | signature/setup (`probe`/`resolver`/`parseCache`/`unreadablePaths`), `parseThetaLib`, `walkThetaLib` | 1328-1476 | 149 |
| runtime materialization of imported symbols | `moduleScopeCache`/`moduleScopeInProgress`, `buildModuleScope`, `materializeChain` | 1477-1615 | 139 |
| per-specifier resolution & type-fact collection delegation ("Seam C", landed) | `localTopLevelNames`, the `collectImportedSpecifierFacts` call + 10-field destructure | 1616-1646 | 31 |
| `system:` template patch + imported-symbol usage checks | `patchedParts` computation, `shadowedNames`/`callSites` setup, four `checkImported*` pushes | 1647-1727 | 81 |
| re-export closure delegation + transitive lib-level checks + own-specifier collision | `resolveReExportClosure` call, per-lib registration/unknown-symbol/collision loop, theta-level collision push | 1728-1837 | 110 |
| cross-file subagent-fn checks + IMP-5 cycle detection + result assembly | `checkSubagentFnStaticResolution`/`checkSubagentFnModelOverrides` loop, `detectImportCycle` loop, `undelivered` + return | 1838-1935 | 98 |

Signature, row 1's start (1328-1334):
```ts
export async function checkThetaImports(
  input: ThetaCompositionInput,
  deps: {
    readonly fs: FileSystem;
    readonly parseDeps: PassParseDeps;
    /**
     * Bug 0267: whether this call may claim its rows against the pass-scoped
```

Row 1 / row 2 boundary (1475-1488) — `walkThetaLib` closes, `buildModuleScope`'s setup begins, no shared code between them beyond what both already receive as closure-captured collaborators (`probe`/`resolver`/`parseThetaLib`):
```ts
    graphEdges.set(resolvedPath, targets);
  };

  // Bug 0303: the DECLARING module's own environment for an imported `fn`,
  // built from the lib's own body plus its own materialised imports
  // (recursively — a lib-to-lib import) and its own enum registrations.
  // Cached per resolved path (reusing the existing path-keyed `parseCache`
  // pattern) and bounded by an in-progress visited set INDEPENDENTLY of IMP-5's
  // cycle refusal (constraint 4): IMP-5 refuses an import cycle for the
  // IMPORTING THETA at the top level, but building a module scope is a
  // separate recursive walk over the SAME `.thetalib` graph that this cache
  // must bound on its own terms.
  const moduleScopeCache = new Map<string, ModuleScope>();
  const moduleScopeInProgress = new Set<string>();
  const buildModuleScope = async (
```

Row 2 / row 3 boundary (1613-1622) — the former 298-LOC inline loop ("Seam C") is now an 8-line delegating call:
```ts
    return undefined;
  };

  const localTopLevelNames = collectTopLevelNames(input.body);
  // Bug 0138/0429/0430/0448/0465, PTQ-0368 Seam C: resolve every direct
  // `import` declaration's specifiers against its resolved `.thetalib`'s own
  // top-level body — split out to `collectImportedSpecifierFacts` above (see
  // its doc comment for exactly what it reads and returns).
  const {
    entryResolvedPaths,
```

Row 4 / row 5 boundary (1719-1732) — the last `checkImported*` push closes, the re-export delegation begins:
```ts
  diagnostics.push(
    ...checkImportedNonCtorTypeNames(
      input.sourcePath,
      shadowedNames,
      callSites,
      importedNonCtorNames,
    ),
  );

  // Re-export chain resolution, phases 1–3 (imports.md §Re-exports): collect the
  // `export … from` closure of every `.thetalib` the import walk reached (`walked`,
  // not only the entry libs — bug 0333's fix — so a re-export fault inside a lib
  // reached only through plain-`import` hops is covered too), settle the fixpoint
  // over the whole collected file set, and only then diagnose — unknown re-exported
```

## Why this is a problem
Function band strong (608 LOC, threshold 200) — the presumption of breakdown
stands only against a strong concrete reason. Reasons considered:
- Closed-enumeration dispatch: the six rows are sequential, unconditional
  phases citing different spec items (the resolution/cycle graph IMP-5
  needs, bug 0303's materialization rule, bugs 0138/0429/0430/0448/0465's
  per-specifier collection now delegated, bugs 0422/0423/0450's `system:`
  patch, imports.md §Re-exports/§"Name collisions" plus bug 0335, and RFC
  0001 FN-6/7/9 plus IMP-5) run one after another — not arms of one closed
  set a single dispatch switches over.
- Single algorithm with shared local state: `probe`/`resolver`/
  `parseThetaLib`/`walkThetaLib`/`unreadablePaths` (row 1's own outputs) ARE
  read by rows 2, 3, and 5 — but this exact host already proves this class
  of state externalises cleanly, twice: the landed "Seam A"
  (`resolveReExportClosure`) takes 5 of these as explicit parameters, and
  the landed "Seam C" (`collectImportedSpecifierFacts`) takes 12 (including
  `probe`/`resolver`/`parseThetaLib`/`unreadablePaths`/`walkThetaLib`
  themselves). A "Seam D" extraction returning `{ probe, resolver,
  parseThetaLib, walkThetaLib, unreadablePaths, graphEdges }` as one record
  — mirroring Seam C's own "return one record" shape — applies the same,
  already-proven technique to the one row `PTQ-0368` named for it.
- Data-only module or type family: not applicable — executable
  orchestration and two closures, no type/table content.
- One grammar production family: not applicable — a compose-pass checker
  over an already-parsed AST, not a parser production.
- Generated or mechanically derived code: no `@generated`/`DO NOT
  EDIT`/`autogenerated` marker (`grep -n "@generated\|DO NOT
  EDIT\|autogenerated" src/extension/import-static-checks.ts` — no hits).
Strong-band extra (required beyond the concrete reason): no `imports.md`-cited
critical section binds all six rows into one ordered unit — the module's own
header (re-read in full) lists IMP-1/IMP-3/IMP-4/IMP-5/IMP-6/IMP-7,
§Re-exports, and §Visibility (materialization) as independent bullets, and
this file's own two already-landed seams on this same function (Seam A,
Seam C) each prove that lifting one row out preserves every other row's own
call order unchanged — both landed as a single call site "at the same
point," destructuring/consuming the return value with no interleaving of
observable steps. No measured-cost citation exists anywhere in the file or
its tests. `git log --oneline --follow -- src/extension/import-static-checks.ts
| grep -iE "revert|split|extract"` returns no hits. `quality/exemptions.json`
(read in full, 4 entries) carries no entry for this host or this file. The
one ruling on record for this host, `PTQ-0368`'s own ratification, is not a
keep-whole ruling for rows 1-2 — it explicitly withholds ratification with
"Seam D (resolution and cycle-graph plumbing) is NOT ratified — D9 re-files
after," naming exactly the two rows this filing's inventory separates out.

## Suggested direction (non-binding, optional)
Continuing `PTQ-0368`'s own pre-announced, not-yet-ratified seam; the human
ratifies the shape.
- Seam D (`PTQ-0368`'s own named seam): extract the resolution &
  cycle-graph plumbing (1328-1476, 149 LOC: the `probe`/`resolver`/
  `parseCache`/`unreadablePaths` setup, `parseThetaLib`, `graphEdges`/
  `walked`, `walkThetaLib`) into a helper returning `{ probe, resolver,
  parseThetaLib, walkThetaLib, unreadablePaths, graphEdges }` -> hypothesis
  `buildThetaLibResolutionGraph` - 0 exported symbols moved (module-private
  today), 0 external importers (src/tests); cross-references back into the
  host: consumed by every later row (materialization, the Seam-C delegation,
  the re-export delegation, the transitive lib-checks loop, IMP-5).
- Seam E: extract runtime materialization (1477-1615, 139 LOC:
  `moduleScopeCache`/`moduleScopeInProgress`, `buildModuleScope`,
  `materializeChain`) into a helper taking Seam D's outputs (`probe`/
  `resolver`/`parseThetaLib`) as explicit parameters and returning
  `{ buildModuleScope, materializeChain }` -> hypothesis
  `createImportMaterializer` - 0 exported symbols moved, 0 external
  importers; cross-references back into the host: `materializeChain` is
  passed into the Seam-C call (row 3) and read directly inside
  `buildModuleScope`'s own body.

## False-positive check
Band: strong (function LOC 608, threshold 200; FN_BANDS
zone=60/justify=100/strong=200, read from the supplied structural map, not
recounted by hand). Reasons-considered: listed above with the evidence that
defeated each (sequential phases citing distinct spec items; this same
function's own two already-landed seams proving 5- and 12-parameter
externalisation of exactly this shared state; no type/table content; not a
parser production; no generated-code marker). Exemptions check:
`quality/exemptions.json` grepped for `import-static-checks` — no hits (the
file's 4 entries name `binder-system-prompt.ts`,
`discovery/package-discovery.ts`, and two unrelated D8 hosts). Generated-code
check: grepped for `@generated`/`DO NOT EDIT`/`autogenerated` — no hits.
Spec-mirror check: `imports.md` organises §Path resolution/§Visibility/
§"Unknown imported symbol"/§Cycles/§Re-exports/§"Name collisions" as separate
sections; this file's own header (re-read in full) lists IMP-1/IMP-3/IMP-4/
IMP-5/IMP-6/IMP-7 as separate bullets — nothing mandates single-function
implementation of the resolution graph, the materialization step, and the
four downstream check rows together. Prior-finding check: grepped
`quality/issues`/`quality/resolved`/`quality/intake` for `checkThetaImports`
— `PTQ-0304` (confirmed/fixed, Seam B), `PTQ-0334` (confirmed/fixed, Seam A),
and `PTQ-0368` (confirmed/fixed, Seam C) are each closed by their own
already-landed seam; `PTQ-0368`'s own ratification explicitly deferred
exactly the two rows this filing targets ("Seam D ... NOT ratified ... D9
re-files after"), which this filing does, supplying the current 608-LOC
six-row accounting (row boundaries and content shifted since `PTQ-0368`'s
875-LOC numbering by Seam C's landing, independently confirmed present at
966-1316/351 LOC per this shard's own structural map) rather than
reproducing `PTQ-0368`'s now-stale numbers. Not a duplicate of the pending
`qw20260916144930-d9-01-resolvereexportclosure-four-phases-bundled.md`: that
filing's host is `import-static-checks.ts#resolveReExportClosure` — a
different function-level exemption key, evaluating that function's OWN
internal four-phase structure (which this filing's row 5 only calls once,
as a single line) — not this function's six-row bundling, of which
`resolveReExportClosure` is merely one row's delegate. Not a duplicate of
`PTQ-0325` (D4, wire-name recomputation) or the confirmed-landed `PTQ-0381`
(D4, resolve-parse triplication in this same file, verified landed at commit
`82efa599`) — both distinct root causes (duplication, not bundling). Not a
deadness claim: every row is live, exercised on every compose pass (1 src /
37 test importers per the map).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — size-scan reproduces the file (1935 LOC/justify) and checkThetaImports (1328-1935/608 LOC/strong, 1/37 importers) exactly; all six row boundaries and every quoted excerpt match the source verbatim (signature at 1328-1334, the 1475-1488/1613-1622/1719-1732 boundaries, the 10-field destructure) and sum to 608 LOC; resolveReExportClosure (651-930/280 LOC, 5 params) and collectImportedSpecifierFacts (966-1316/351 LOC, 12 params) reproduce exactly as cited, as does PTQ-0368's quoted "Seam D ... NOT ratified — D9 re-files after" ratification and the PTQ-0304/0334/0368/0325/0381 history; exemptions.json (4 entries, none for this host), the generated-code grep, and the git-log revert/split/extract grep all confirm empty as claimed; not a duplicate of the pending resolveReExportClosure filing (distinct function-level d9_host) or of PTQ-0325/PTQ-0381 (distinct D4 root causes) — D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
