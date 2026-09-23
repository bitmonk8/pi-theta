---
id: PTQ-1485
title: The readAt/fragmentOf/defOf/refNameOf/paramsDocumentOf four-position lowering-read harness is duplicated verbatim across four test files, one of them in scope
lens: D7
status: open
verdict: confirmed
locations:
  - tests/generic-argument-literal-lowering.test.ts:186-311
  - tests/union-arm-literal-const-lowering.test.ts:273-398
  - tests/union-generic-arm-lowering.test.ts:230-322
  - tests/params-literal-sublanguage-lowering.test.ts:298-405
sites: 4
fix_scope: cross-module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# The readAt/fragmentOf/defOf/refNameOf/paramsDocumentOf four-position lowering-read harness is duplicated verbatim across four test files, one of them in scope

## Observation
`tests/generic-argument-literal-lowering.test.ts` declares a five-function
module-scope harness — `readAt(position, typeSource)`, `fragmentOf(label,
position, typeSource)`, `defOf(label, position, typeSource, name)`,
`refNameOf(label, position, typeSource)` and `paramsDocumentOf(label,
fields)` — that reads a type source at one of the `params` / `field` /
`alias` / `annotation` positions and asserts a clean load before returning
the lowered fragment or throwing. The same five functions, same bodies (only
the fixture path string `"bug0236.theta"`/`"bug0184.theta"`/etc and the cited
grammar-anchor line numbers in the error-message text differ), recur in three
sibling files. No `tests/helpers/` module exports this harness; each file
declares it as private module-scope functions.

## Evidence
`tests/generic-argument-literal-lowering.test.ts:186-204` (the `readAt`
annotation branch, re-read immediately before filing):
```ts
function readAt(position: Position, typeSource: string): PositionRead {
  if (position === "annotation") {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0164.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
    if (lowered === undefined) {
      return { diags: diagLines(doc), defs: {} };
    }
    const { $defs, ...root } = lowered as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      fragment: root,
      document: lowered,
      defs: ($defs ?? {}) as Record<string, unknown>,
    };
  }
```

`tests/union-arm-literal-const-lowering.test.ts:273-286` — identical logic,
only the fixture path string differs (`"bug0184.theta"`):
```ts
function readAt(position: Position, typeSource: string): PositionRead {
  if (position === "annotation") {
    const doc = parseDoc(`---\nmode: prompt\n---\n${DECLS}let inert = 1\ninert\n`, "bug0184.theta");
    const schemas = doc.body.statements.filter((s): s is SchemaDecl => s.kind === "schema");
    const enums = doc.body.statements.filter((s): s is EnumDecl => s.kind === "enum");
    const lowered = lowerQueryResponseSchema(typeSource, schemas, enums);
    if (lowered === undefined) {
      return { diags: diagLines(doc), defs: {} };
    }
    const { $defs, ...root } = lowered as Record<string, unknown>;
    return {
      diags: diagLines(doc),
      fragment: root,
      document: lowered,
      defs: ($defs ?? {}) as Record<string, unknown>,
    };
  }
```

`tests/generic-argument-literal-lowering.test.ts:242-259` — `fragmentOf`:
```ts
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  expect(
    read.diags,
    `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
      `position (grammar.md:99/:102/:105/:107, type-system.md:9/:15), so this fixture must load ` +
      `with NO diagnostics or the lowering under assertion never runs; observed ` +
      `${JSON.stringify(read.diags)}`,
  ).toEqual([]);
  if (read.document === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
        `nothing for AJV to enforce at that position; diagnostics ${JSON.stringify(read.diags)}`,
    );
  }
  return read.fragment;
}
```

`tests/union-arm-literal-const-lowering.test.ts:329-343` — the same function,
only the cited grammar-anchor numbers in the message text differ
(`grammar.md:94/:102/:105, type-system.md:8/:15`):
```ts
function fragmentOf(label: string, position: Position, typeSource: string): unknown {
  const read = readAt(position, typeSource);
  expect(
    read.diags,
    `${label} [${position}]: \`${typeSource}\` is grammar-admitted at every type-annotation ` +
      `position (grammar.md:94/:102/:105, type-system.md:8/:15), so this fixture must load with ` +
      `NO diagnostics or the lowering under assertion never runs; observed ` +
      `${JSON.stringify(read.diags)}`,
  ).toEqual([]);
  if (read.document === undefined) {
    throw new Error(
      `${label} [${position}]: \`${typeSource}\` produced NO lowered document, so there is ` +
        `nothing for AJV to enforce at that position; diagnostics ${JSON.stringify(read.diags)}`,
    );
  }
  return read.fragment;
}
```

`defOf` and `refNameOf` reproduce with the identical pattern at
`tests/generic-argument-literal-lowering.test.ts:261-296`,
`tests/union-arm-literal-const-lowering.test.ts:348-383`, and
`tests/params-literal-sublanguage-lowering.test.ts:373-404` (grep-verified:
`grep -n "^function readAt\|^function fragmentOf\|^function defOf\|^function
refNameOf\|^function paramsDocumentOf"` against each file returns the same
five signatures in three of the four files;
`tests/union-generic-arm-lowering.test.ts` carries `readAt`/`fragmentOf`
only, at lines 230 and 309).

## Why this is a problem
Four files independently declare the same private five-function harness for
reading a lowered type fragment at the four `Type` positions
(`params`/`field`/`alias`/`annotation`), with the same loud-on-missing-
prerequisite behaviour and near-identical wording, rather than the harness
having one home under `tests/helpers/`. No `tests/helpers/` module currently
exports `readAt`/`fragmentOf`/`defOf`/`refNameOf`/`paramsDocumentOf` for this
four-position read.

## Suggested direction (non-binding, optional)
A shared `tests/helpers/` module parameterised by the fixture path string and
the position-specific `DECLS` source would give this four-position read one
body instead of four; observed as a natural home, not designed here.

## False-positive check
- Gate-pin carve-out: none of the four files match `*gate*.test.ts` or the
  named census/pin families; N/A.
- Recording-double carve-out: `readAt` et al. read production lowering
  output, they do not record calls to prove a MUST-NOT; N/A.
- docs/bugs/ signature search: `grep -rn "readAt\b" docs/bugs/` returns no
  hits — this is not a documented correct-reason red, it is live production
  code paths exercised in all four files.
- coverage-matrix/bug-doc citation search: `grep -rn
  "generic-argument-literal-lowering\|union-arm-literal-const-lowering\|
  union-generic-arm-lowering\|params-literal-sublanguage-lowering"
  docs/reference/coverage-matrix.md` found no per-function citation; this
  finding proposes no merge/rename/delete of a coverage-matrix-cited test,
  only a naming of the repeated harness's natural helper home.
- Checked prior filings: `grep -rl "readAt" quality/issues quality/resolved`
  returned no matches — this exact harness duplication (by function name) has
  not previously been filed under any wave.
- Confirmed this is duplication, not coverage: the claim is about the
  IDENTICAL harness code existing four times, not about any behaviour being
  untested.

## Triage
verdict: confirmed — diff-verified: the `readAt`/`fragmentOf`/`defOf`/`refNameOf` bodies at generic-argument-literal-lowering.test.ts:186-296, union-arm-literal-const-lowering.test.ts:273-383 and params-literal-sublanguage-lowering.test.ts:298-404 are byte-identical apart from the fixture path string (`bug0164`/`bug0184`/`bug0056`) and the grammar-anchor numbers inside one assertion message (`paramsDocumentOf` exists only in the first two, not the claimed three — d has four functions); union-generic-arm-lowering.test.ts:230-322 is a diverged sibling of the same read (`defNames` instead of `defs`, per-position early returns, `fragmentOf` without the diag expect) so "verbatim across four" overstates that copy but the a/b/d triple alone is D7 boilerplate duplication; `tests/helpers/` has no home for it — `makeTypePositionReader`/`loweredF` (load-row-harness.ts:546-617) return diagnostics/`doc`/the params `f` property only, never the fragment-at-position or `$defs`, so the fix is a new or extended helper, not a bypassed import; carve-outs re-run (not gate files, not recording doubles, 0 `readAt` hits in docs/bugs/, no it()/describe() merge or rename proposed); no PTQ row tracks these functions — the nearest (PTQ-0574 `schemaDeclsOf`, PTQ-0691 `loweredAnnotation`, PTQ-0984 `loweredParams`, PTQ-0843 `atEveryPosition`) cover different helpers; a fifth differently-shaped `readAt` at params-scalar-nontype-text-refusal.test.ts:561 (returns `diagCodes`/`lowered`, throws on absent annotation) is a diverged cousin the fixer may consider but is not one of the counted clones (triage: claude-fable-5-1)
