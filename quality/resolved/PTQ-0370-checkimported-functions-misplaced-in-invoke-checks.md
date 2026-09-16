---
id: PTQ-0370
title: invoke-static-checks.ts's four checkImported* functions have zero in-file callers; their sole affinity is checkThetaImports in import-static-checks.ts
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1515-1518
  - src/extension/invoke-static-checks.ts:1580-1703
  - src/extension/invoke-static-checks.ts:1745-1800
  - src/extension/invoke-static-checks.ts:1843-1885
  - src/extension/invoke-static-checks.ts:1943-1984
  - src/extension/import-static-checks.ts:1209-1209
  - src/extension/import-static-checks.ts:1522-1570
sites: 5                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: misplacement       # D9 only: breakdown | misplacement | husk
wave: qw20260915044704
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-15
---

# invoke-static-checks.ts's four checkImported* functions have zero in-file callers; their sole affinity is checkThetaImports in import-static-checks.ts

## Observation
`src/extension/invoke-static-checks.ts` (1984 LOC, band justify) states its own role in its
header: "Load-time (compose-pass) wiring for the invoke static checks the shipped pipeline
previously never ran (invocation.md §Argument arity / §Resolution / §Cycle detection)." Five
of its declarations — the `ImportedFnCallee` interface (1515-1518) and the four functions
`checkImportedFnCallArgs` (1580-1703), `checkImportedSchemaCtorFields` (1745-1800),
`checkImportedEnumVariantAccess` (1843-1885), and `checkImportedNonCtorTypeNames`
(1943-1984) — are, by the file's own header comment, wired "once per importing theta from
`checkThetaImports` (../extension/import-static-checks.ts)," and their entire subject matter
is judging usage of symbols resolved through the IMPORT boundary (imported `fn` calls,
imported `schema` constructor fields, imported `enum` variant access, imported
non-brace-constructible type names) — a different resolution mechanism from this file's own
stated concern (`invoke(...)`/`.theta`-callable call-site checks against statically-resolved
callees).

## Evidence
Affinity count, both ways.

Touches of the foreign host `import-static-checks.ts#checkThetaImports` — its sole caller, 5
touches (4 calls + 1 type instantiation, all in ONE function):
```ts
// src/extension/import-static-checks.ts:1209
  const importedFns = new Map<string, ImportedFnCallee>();
```
```ts
// src/extension/import-static-checks.ts:1522-1533
  diagnostics.push(
    ...checkImportedFnCallArgs(
      input.body,
      input.sourcePath,
      shadowedNames,
      callSites,
      importedFns,
    ),
  );

  // Bug 0429: judge every imported-`schema` constructor site's field set,
  // ONCE over the importing theta's own body, now that the per-decl loop
```
(the same shape repeats for `checkImportedSchemaCtorFields`, `checkImportedEnumVariantAccess`,
and `checkImportedNonCtorTypeNames`, ending at line 1570). Repo-wide grep for these five names
across `src/` and `tests/` (`grep -rn "checkImportedFnCallArgs\|checkImportedSchemaCtorFields\|
checkImportedEnumVariantAccess\|checkImportedNonCtorTypeNames\|ImportedFnCallee"`) finds no
import statement anywhere other than `import-static-checks.ts:108-114`; every other hit
(`src/parser/static-type-inference.ts`, `src/parser/type-layer-checks.ts`, and ten `tests/`
files) is a doc-comment or test-file prose citation of the diagnostic behaviour, never an
import or a call.

Touches of invoke-static-checks.ts's own members — 3, all from one of the five
(`checkImportedFnCallArgs` alone; the other three touch 0):
```ts
// src/extension/invoke-static-checks.ts:1580-1591
export function checkImportedFnCallArgs(
  importingBody: ThetaBody,
  importingFile: string,
  shadowedNames: ReadonlySet<string>,
  callSites: CollectedCallSites,
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
    return [];
  }
  const diagnostics: Diagnostic[] = [];
  const { callExprs } = callSites;
```
— `CollectedCallSites` (the parameter type, shared by all four), `collectProvableArgTypes`
(called once inside `checkImportedFnCallArgs`, line 1665), `dedupeArgType` (called once
inside `checkImportedFnCallArgs`, line 1695). Grep for calls of the four functions from
anywhere else IN this same file (`checkInvokeStaticResolution`, `checkThetaCallableCallSurface`,
or any other declaration here) finds zero call sites — the only in-file hits are prose
doc-comments naming them (e.g. line 710: "the imported-`fn`-call route
(`checkImportedFnCallArgs`, below)").

## Why this is a problem
Touches 5 members of the foreign host `import-static-checks.ts#checkThetaImports` (4 call
sites + 1 type instantiation, all in ONE function), 3 of its own file (`CollectedCallSites`,
`collectProvableArgTypes`, `dedupeArgType` — and those only from one of the five
declarations) — and 0 of this file's own main entry point, `checkInvokeStaticResolution`, or
its Seam-A companion `checkThetaCallableCallSurface`. Every other import-boundary check
`checkThetaImports` itself performs (`checkImportUnknownSymbols`, `checkImportNameCollisions`,
`computeThetaLibExports`, `detectImportCycle`) is imported directly from `../parser/imports.ts`
and called in the same file/orchestration as `checkThetaImports` itself — these five
declarations are the ONLY import-boundary checks that must reach across the `extension/`
sibling-file boundary into `invoke-static-checks.ts` to be invoked, an exception to that
sibling pattern. The two files' own header comments cross-reference each other on exactly
this point: `import-static-checks.ts`'s header calls `invoke-static-checks.ts` "the invoke
static-check compose pass," and `invoke-static-checks.ts`'s header separately narrates bug
0138/0429/0430/0448 as "wired once per importing theta from `checkThetaImports`" — both
files' own documentation already treats this cluster as belonging conceptually to the import
side, hosted here only because it reuses this file's `collectCallSites`/
`collectProvableArgTypes`/`dedupeArgType`.

## Suggested direction (non-binding, optional)
This exact seam was already proposed and human-deferred, not refused, in an earlier wave
(`qw20260914091051-d9-01-invoke-static-checks-seven-subsystems-bundled.md`, filed as a
file-level breakdown claim rather than misplacement, retrieved via `git show 4262f8c2` since
it was never promoted to a PTQ number): "human 2026-09-14: deferred for sequencing, not
refused. Its Seam A moves exactly the four checkImported* functions that two ruled D8 issues
(PTQ-0319 collectCallSites-once and the collectLocalBinderNames-once sibling) edit next wave;
let those land first, then re-file. Intended next seam: Seam A -> src/extension/
invoke-imported-checks.ts (cycle-free: invoke-static-checks.ts itself never calls the four;
import-static-checks.ts re-points its import; collectCallSites / collectProvableArgTypes /
dedupeArgType get exported)." Both named blockers (`PTQ-0319`, `PTQ-0330`) are now in
`quality/resolved/` (confirmed landed: `checkThetaImports` now computes `callSites`/
`shadowedNames` once and passes them into all four functions, matching the fix these two
issues describe). Seam A: move `ImportedFnCallee`, `checkImportedFnCallArgs`,
`checkImportedSchemaCtorFields`, `checkImportedEnumVariantAccess`,
`checkImportedNonCtorTypeNames` (269 LOC total) into a new sibling module -> hypothesis
`invoke-imported-checks.ts` - 5 exported symbols moved (1 interface + 4 functions), external
importers today: 1 src (`import-static-checks.ts`) / 0 tests each per the map;
cross-references back into the host: `CollectedCallSites` (type), `collectProvableArgTypes`,
`dedupeArgType` — module-private today, would need exporting from `invoke-static-checks.ts`
(or moving alongside).

## False-positive check
Affinity counts both ways, verified by direct grep rather than estimated: 5 touches of
`checkThetaImports` (4 calls + 1 type use, all re-read verbatim at
`import-static-checks.ts:1209,1522-1570`), 3 touches of `invoke-static-checks.ts`'s own
members (`CollectedCallSites`/`collectProvableArgTypes`/`dedupeArgType`, all three used by
only one of the five declarations), 0 touches from this file's own
`checkInvokeStaticResolution`/`checkThetaCallableCallSurface`. Sibling-pattern citation:
`checkThetaImports`'s other four import-boundary checks (`checkImportUnknownSymbols`,
`checkImportNameCollisions`, `computeThetaLibExports`, `detectImportCycle`) all live in and
are imported directly from `../parser/imports.ts`, called in the same file as
`checkThetaImports` itself — these five declarations are the only import-boundary checks
requiring a cross-`extension/`-file reach. Barrel/facade check: not applicable (misplacement,
not husk) — these are ordinary named exports, not a re-export barrel. Prior-finding check:
grepped `quality/issues`/`quality/resolved`/`quality/intake` and `quality/TRIAGE_LOG.md` for
`checkImportedFnCallArgs`/`invoke-imported-checks`/`ImportedFnCallee` in a breakdown or
misplacement title — the sole prior hit is the human-deferred `qw20260914091051-d9-01` (never
promoted to a PTQ number; the wave's own do-not-refile list does not name it, since it was
deferred rather than confirmed/rejected/resolved). This filing reframes that deferred
file-level breakdown claim's Seam A specifically as a misplacement (affinity-counted) claim
once its named blockers landed, rather than restating the original's full seven-row
file-breakdown table (whose other six rows are separately dispositioned in this same review:
`checkInvokeStaticResolution` under the still-open `PTQ-0351`; `checkClauseCwdType`,
`collectProvableArgTypes`, `checkThetaCallableCallSurface` kept whole on independent
closed-enumeration/single-algorithm grounds, re-verified against current line numbers). Not
dead code: all five declarations have a live caller (`checkThetaImports`, 1 src importer per
the map); this is a placement claim, not a D2 deadness claim.

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — affinity re-verified exactly (5 foreign-host touches: 4 calls + 1 ImportedFnCallee instantiation, all inside checkThetaImports at import-static-checks.ts:1209/1522-1570; vs 3 own-host touches, 2 of which only from checkImportedFnCallArgs), sibling pattern confirmed (the file's other four import-boundary checks live in and are called from ../parser/imports.ts; these five declarations are the only ones reaching a cross-extension/-sibling-file boundary), size-scan map and repo-wide grep reproduce every cited line/LOC/importer count verbatim (269 LOC total, 1 src/0 test importers each), and the cited human-deferred prior wave plus its since-landed blockers (PTQ-0319, PTQ-0330) check out in git history/TRIAGE_LOG.md — but D9 misplacement accounting caps at questionable, never confirmed; the move is a human ruling (triage: claude-opus-5)
verdict: confirmed — RATIFIED (human, 2026-09-15): Seam A as pre-announced in the qw20260914091051-d9-01 deferral; its blockers PTQ-0319/0330 have landed. Move ImportedFnCallee, checkImportedFnCallArgs, checkImportedSchemaCtorFields, checkImportedEnumVariantAccess, checkImportedNonCtorTypeNames (269 LOC) from invoke-static-checks.ts to a new sibling src/extension/invoke-imported-checks.ts with a header comment stating its role (the imported-symbol usage checks checkThetaImports runs over a theta's body: bugs 0138/0429/0430/0448). Cycle-free by construction: invoke-static-checks.ts never calls the four; it EXPORTS what the new module needs (collectProvableArgTypes, dedupeArgType; CollectedCallSites via import type) — export, never duplicate; import-static-checks.ts re-points its import; no other importer exists (map: 1 src / 0 tests). Bodies verbatim with comments; identical diagnostics; tests unchanged; tsc first; report before/after LOC of invoke-static-checks.ts.
