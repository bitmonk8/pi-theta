---
id: pending                  # PTQ-NNNN minted at acceptance; never self-assigned
title: invoke-static-checks.ts bundles seven independently-specced check subsystems into one 1963-line file
lens: D9                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: intake               # intake | open | fixed | rejected (store mechanics own transitions)
verdict: pending              # pending | confirmed | questionable | false-positive | duplicate | out-of-scope | malformed
locations:                   # every cited site, repo-relative path:line-range
  - src/extension/invoke-static-checks.ts:1-1963
sites: 1                     # count of occurrences cited in Evidence
fix_scope: cross-module      # localized | module | cross-module - mechanical size proxy, NOT a priority
d9_class: breakdown          # D9 only: breakdown | misplacement | husk
d9_host: src/extension/invoke-static-checks.ts # D9 breakdown only: the exemption key, <path> or <path>#<function>
d9_band: justify              # D9 breakdown only: zone | justify | strong
wave: qw20260914091051
reported_by: lens-d9-placement (anthropic/claude-fable-5)
date: 2026-09-14
---

# invoke-static-checks.ts bundles seven independently-specced check subsystems into one 1963-line file

## Observation
`src/extension/invoke-static-checks.ts` is 1963 LOC (band justify, threshold
1000). Its header (lines 1-64) states its role: "Load-time (compose-pass)
wiring for the invoke static checks the shipped pipeline previously never
ran (invocation.md §Argument arity / §Resolution / §Cycle detection). Each
check reuses an existing, unit-tested checker rather than reimplementing
it." The header's own bulleted list then separately enumerates nine distinct
spec/bug identifiers as separate items — INV-3, bug 0137, bug 0072 (twice,
two different checks), INV-4, INV-1, bug 0138, bugs 0429/0430/0448, and RFC
0009 (INV-6/INV-8/Erratum A′) — and the file's ~26 top-level declarations
resolve into seven distinguishable subsystems below, each independently
commented and each citing a different subset of that list.

## Evidence
Distinct-concern inventory (every row's boundary re-read verbatim at the
cited lines immediately before filing; concern names are the code's own
subject nouns):

| concern | members | line ranges | LOC |
|---|---|---|---|
| Shared call-site AST walk and resolution (bug 0071) | `normalizePath`, `CollectedCallSites`, `collectInvokeExprs`, `collectCallSites`, `ThetaCallableCallSite`, `resolveThetaCallableCallSites`, `collectThetaCallableCallSites` | 148-305 | 82 |
| With-clause `cwd` argument type judgment (RFC 0009, INV-6/INV-8) | `checkClauseCwdType` | 322-395 | 74 |
| Cross-theta invoke-graph construction (INV-4) | `resolveCalleeAbsolute`, `buildInvokeGraph` | 398-468 | 36 |
| Callee arity/shape descriptor types | `CalleeArityField`, `CalleeArity` | 474-510 | 35 |
| Provable argument-type collection and rendering (bug 0072) | `toolParameterProperties`, `SCHEMA_REFINEMENT_KEYS`, `fieldSchemaType`, `collectProvableArgTypes`, `collectArmUnion`, `renderCollectedTypes`, `buildInvokeArgSlot`, `dedupeArgType` | 522-904 | 267 |
| Same-file invoke/`.theta`-callable compose-pass entry point (INV-1/3/4/6/8, bug 0137, bug 0072) | `checkInvokeStaticResolution` | 964-1472 | 509 |
| Cross-file imported-`.thetalib`-symbol checks (bug 0138/0429/0430/0448) | `ImportedFnCallee`, `checkImportedFnCallArgs`, `checkImportedSchemaCtorFields`, `checkImportedEnumVariantAccess`, `checkImportedNonCtorTypeNames` | 1491-1963 | 272 |

Seven rows, 1275 of the file's 1963 LOC (the remainder is the module header
and per-declaration doc comments). Boundary excerpts:

`src/extension/invoke-static-checks.ts:209-221` (row 1 — the one shared walk):
```ts
function collectCallSites(body: ThetaBody): CollectedCallSites {
  const out: CollectedCallSites = { invokeExprs: [], callExprs: [], objectExprs: [], memberExprs: [] };
  walkCallSiteNodes(body, (node) => {
    switch (node.kind) {
      case "invoke":
        out.invokeExprs.push(node);
        return;
      case "call":
        out.callExprs.push(node);
        return;
```

`src/extension/invoke-static-checks.ts:322-333` (row 2 — the with-clause `cwd` slot):
```ts
function checkClauseCwdType(input: {
  readonly clause?: CallWithClause;
  readonly surface:
    | { readonly kind: "invoke"; readonly providedCount: number }
    | { readonly kind: "theta-callable"; readonly name: string };
  readonly file: string;
  readonly fallbackRange: SourceRange;
  readonly typeEnv: TypeEnv;
  readonly typePass: StaticTypeInferencePass;
}): Diagnostic[] {
```

`src/extension/invoke-static-checks.ts:440-448` (row 3 — the invoke-graph builder):
```ts
export async function buildInvokeGraph(
  inputs: readonly ThetaCompositionInput[],
  fs: Pick<FileSystem, "realpath">,
): Promise<InvokeGraph> {
  const canonical = (path: string): Promise<string> =>
    canonicalizePath(fs, path).then(
      (real) => real,
      () => normalizePath(path),
    );
```

`src/extension/invoke-static-checks.ts:474-484` (row 4 — the callee-shape types):
```ts
export interface CalleeArityField {
  readonly typeSource: string;
  readonly name: string;
}
```

`src/extension/invoke-static-checks.ts:618-628` (row 5 — the provable-type switch):
```ts
function collectProvableArgTypes(
  expr: Expr,
  env: TypeEnv,
  pass: StaticTypeInferencePass,
): CompatType[] | undefined {
  switch (expr.kind) {
    case "number":
    case "string":
    case "bool":
    case "null":
```

`src/extension/invoke-static-checks.ts:964-966` (row 6 — the main compose-pass entry, already separately tracked at function level by PTQ-0321):
```ts
export async function checkInvokeStaticResolution(
  input: ThetaCompositionInput,
  deps: {
```

`src/extension/invoke-static-checks.ts:1556-1562` (row 7 — the cross-file imported-symbol route):
```ts
export function checkImportedFnCallArgs(
  importingBody: ThetaBody,
  importingFile: string,
  paramsFieldNames: readonly string[],
  importedFns: ReadonlyMap<string, ImportedFnCallee>,
): Diagnostic[] {
  if (importedFns.size === 0) {
```

## Why this is a problem
Band justify (1963 LOC, threshold 1000) — presumption of breakdown stands
unless a concrete reason to keep the whole FILE together is found. Reasons
considered and why each fails:
- Closed-enumeration dispatch: not applicable at file scope — the seven rows
  are seven separate top-level declarations, not arms of one switch/if-chain.
  (Row 2 and row 5 are each individually a closed dispatch internally, which
  is why neither is itself filed as a breakdown candidate below threshold
  logic — but a function-level dispatch does not make the surrounding FILE
  one enumeration.)
- Single algorithm with shared local state: not applicable — there is no
  module-scope mutable state (the only module-scope const,
  `SCHEMA_REFINEMENT_KEYS`, is a frozen literal `Set`, row 5). Each row's
  locals stay scoped to its own function bodies; rows 5-7 are related by
  ordinary function calls (row 6 and row 7 each call into row 5's helpers),
  not by a shared local state bundle threaded through every row.
- Data-only module or type family: the five interfaces plus the one literal
  table sum to 17 (`CollectedCallSites`) + 8 (`ThetaCallableCallSite`) + 11
  (`CalleeArityField`) + 24 (`CalleeArity`) + 4 (`ImportedFnCallee`) + 15
  (`SCHEMA_REFINEMENT_KEYS`) = 79 of 1963 LOC (~4%), far under the 80% bar.
- One grammar production family: not applicable — this is compose-pass
  (post-parse) checking code; grammar.md's productions are recognised in
  `../parser/theta-document.ts`, not here.
- Generated or mechanically derived code: grepped the file for
  `@generated`/`DO NOT EDIT`/`autogenerated` — no hits; every comment is
  hand-authored prose citing specific bug numbers and spec clauses.

None of the five reason classes rescue the file (band is justify, not
strong, so a concrete reason alone would have sufficed had one existed).

## Suggested direction (non-binding, optional)
Unproven hypotheses; the human ratifies one (this project's own precedent —
PTQ-0304 on the sibling file `import-static-checks.ts`, and PTQ-0322 on
`production-composition.ts` — each ratified exactly one of several proposed
seams and deferred the rest).
- Seam A: move the cross-file imported-`.thetalib`-symbol checks —
  `ImportedFnCallee` (1491-1494, 4 LOC), `checkImportedFnCallArgs`
  (1556-1679, 124 LOC), `checkImportedSchemaCtorFields` (1721-1777, 57 LOC),
  `checkImportedEnumVariantAccess` (1820-1863, 44 LOC),
  `checkImportedNonCtorTypeNames` (1921-1963, 43 LOC), 272 LOC total — into a
  new sibling module -> hypothesis `invoke-imported-checks.ts` - 5 exported
  symbols moved (1 interface + 4 functions), external importers of those
  symbols today: 1 src (`import-static-checks.ts`) / 0 tests each per the
  map; cross-references back into the host: `collectCallSites`,
  `collectProvableArgTypes`, `dedupeArgType` (all three file-private today, 0
  external importers — each would need exporting).
- Seam B: move the provable-argument-type collection and rendering
  substrate — `toolParameterProperties` (522-533, 12), `SCHEMA_REFINEMENT_KEYS`
  (542-556, 15), `fieldSchemaType` (567-583, 17), `collectProvableArgTypes`
  (618-769, 152), `collectArmUnion` (779-793, 15), `renderCollectedTypes`
  (804-806, 3), `buildInvokeArgSlot` (835-876, 42), `dedupeArgType` (894-904,
  11), 267 LOC total, all file-private today (0 exported, 0 external
  importers) — into a new sibling module -> hypothesis
  `invoke-arg-type-collection.ts` - cross-references back into the host:
  consumed today by `checkClauseCwdType`, `checkInvokeStaticResolution`, and
  `checkImportedFnCallArgs` (all three in this file), each of which would
  gain an import edge.
- Seam C: move the cross-theta invoke-graph builder —
  `resolveCalleeAbsolute` (398-404, 7), `buildInvokeGraph` (440-468, 29), 36
  LOC total — into `../runtime/invoke-depth-cycle.ts` (the module that
  already declares the `InvokeGraph` type this builder populates and the
  `detectInvocationCycle` function that walks it) -> hypothesis, same name
  `buildInvokeGraph` - 1 exported function moved, 1 src / 3 test external
  importers today per the map; cross-references back into the host:
  `collectInvokeExprs` and `normalizePath` (both file-private today, 0
  external importers — would need exporting or a duplicate).

## False-positive check
Band: justify (file LOC 1963, threshold 1000). Reasons-considered: listed
above with the evidence that defeated each (no file-scope dispatch, no
module-scope mutable state, 79/1963 LOC ≈ 4% type/table content, not a
parser production, no generated-code marker). Exemptions check:
`quality/exemptions.json` grepped for `invoke-static-checks` — no entry.
Generated-code check: grepped the file for
`@generated`/`DO NOT EDIT`/`autogenerated` — no hits. Spec-mirror check: the
module header cites INV-1, INV-3, INV-4, INV-6, INV-8 (five separately
numbered `invocation.md` sections, confirmed by direct grep of that doc),
plus bug 0137, bug 0072 (twice), bug 0138, bugs 0429/0430/0448, and RFC 0009
— nine distinct identifiers naming heterogeneous, independently-landed
fixes, not one spec-mandated single-file shape. Prior-finding check: grepped
`quality/issues` + `quality/resolved` + `quality/intake` for
`invoke-static-checks.ts` (25 file hits: 2 in `quality/issues`, 20 in `quality/resolved`, 3 other-lens in-flight `quality/intake` candidates from this same wave). The only open D9 finding on this file
is PTQ-0321, host-keyed to `src/extension/invoke-static-checks.ts#checkInvokeStaticResolution`
(row 6 above) alone — its own false-positive check separately dispositions
row 2 (`checkClauseCwdType`, closed 2-arm dispatch) and row 5's
`collectProvableArgTypes` (exhaustive switch over the 20-member `Expr` union,
confirmed against `../parser/theta-document.ts:461-481`) and
`checkImportedFnCallArgs` (7-local shared-state helper) as individually
keep-whole; none of that addresses whether the FILE's seven rows should live
in one file, which is this finding's own, distinct claim. PTQ-0319 (D8,
ratified) addresses redundant per-body walks inside row 7's four functions,
not their file placement. No prior finding in the three directories claims
file-level breakdown against this host. This filing does not restate
PTQ-0321's evidence; row 6 is carried here only as one opaque line in the
inventory (its own internal phase breakdown stays PTQ-0321's territory).

## Triage
<triage appends: verdict + one-line reason. Nothing above this line is edited.>
verdict: questionable — accounting reproduces exactly: size-scan confirms invoke-static-checks.ts at 1963 LOC/justify with all 26 declarations partitioning into the claimed 7 rows (per-row LOC sums 82/74/36/35/267/509/272 = 1275/1963 verified against the scanner, all seven boundary excerpts and every cited importer count matching verbatim), no module-scope mutable state beyond the one frozen SCHEMA_REFINEMENT_KEYS Set, no generated-code marker, no quality/exemptions.json entry, and no reverted-split commit in git history; prior-finding check holds — PTQ-0321 (open) is host-keyed to #checkInvokeStaticResolution alone (row 6 only) and PTQ-0319 (D8) addresses redundant walks, neither claims file-level placement — but D9 breakdown accounting caps at questionable, never confirmed; target shape is a human ruling (triage: claude-opus-5)
