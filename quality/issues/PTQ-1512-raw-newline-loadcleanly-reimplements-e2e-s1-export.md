---
id: PTQ-1512
title: params-default-string-literal-raw-newline.test.ts redeclares loadCleanly's null-checking throw chain instead of importing the exported tests/helpers/e2e-s1.ts helper
lens: D7
status: open
verdict: confirmed
locations:
  - tests/params-default-string-literal-raw-newline.test.ts:319-360
  - tests/helpers/e2e-s1.ts:697-721
sites: 1
fix_scope: localized
wave: qw20260923203928
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# params-default-string-literal-raw-newline.test.ts redeclares loadCleanly's null-checking throw chain instead of importing the exported tests/helpers/e2e-s1.ts helper

## Observation
`tests/params-default-string-literal-raw-newline.test.ts` declares a
module-private `interface LoadedParams` and `function loadCleanly(label,
paramsBlock): LoadedParams` that parses a fixture through `parseDoc`, asserts
a clean diagnostic list, and throws a labelled error at each of several
possible absent intermediates (`doc.frontmatter === null`, `params ===
undefined`, `lowered === undefined`) before returning the loaded fields.
`tests/helpers/e2e-s1.ts` already exports its own `interface LoadedParams`
and `function loadCleanly(label, source, path = "test.theta")` whose first
two throw messages (the `frontmatter === null` and `params === undefined`
guards) are byte-identical to the in-scope file's. The in-scope file's own
import line (`import { parseDoc, fieldOf, diagLines, diagCodes } from
"./helpers/e2e-s1";`) omits `loadCleanly`.

## Evidence
tests/params-default-string-literal-raw-newline.test.ts:319-360 (re-read before filing):
```ts
interface LoadedParams {
  readonly properties: Record<string, unknown>;
  readonly fields: readonly BypassParamsField[];
  readonly loweredSchema: Record<string, unknown>;
}

function loadCleanly(label: string, paramsBlock: string): LoadedParams {
  const doc = parseDoc(src(paramsBlock), "bug0102.theta");
  expect(
    diagLines(doc),
    `${label}: this fixture's pinned disposition is a clean load — any diagnostic is drift`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent). Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
```

tests/helpers/e2e-s1.ts:697-721 (the canonical, already-exported equivalent):
```ts
export function loadCleanly(label: string, source: string | ThetaDocument, path = "test.theta"): LoadedParams {
  const doc = typeof source === "string" ? parseDoc(source, path) : source;
  expect(
    diagLines(doc),
    `${label}: this fixture must load with NO diagnostics; observed ${JSON.stringify(diagLines(doc))}`,
  ).toEqual([]);
  if (doc.frontmatter === null) {
    throw new Error(
      `${label}: the theta was REFUSED — frontmatter is null. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const params = doc.frontmatter.params;
  if (params === undefined) {
    throw new Error(
      `${label}: the frontmatter carries no parsed params block. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  const lowered = params.loweredSchema;
  if (lowered === undefined) {
    throw new Error(
      `${label}: the params block lowered to NOTHING (loweredSchema absent), so there is no AJV-validatable document for the argument boundary. Diagnostics: ${JSON.stringify(diagLines(doc))}`,
    );
  }
  return { defs: (lowered["$defs"] ?? {}) as Record<string, unknown>, loweredSchema: lowered };
}
```

Both functions share the same name, the same `parseDoc`-then-`diagLines`
empty-list assertion, and the same first two throw messages verbatim
(`frontmatter === null` and `params === undefined`); the in-scope file's
third throw and its extra `properties` presence check are additions the
canonical version does not carry, and the in-scope file's return shape adds
`fields`/`properties` fields the canonical `LoadedParams` does not have.

## Why this is a problem
`tests/helpers/e2e-s1.ts` already exports `loadCleanly` under this exact
name and signature shape, and its first two throw messages are what the
in-scope file's own copy repeats character-for-character. The in-scope file
is not calling that export; it is carrying its own parallel copy of the same
control flow, which is the pattern this repository has already resolved once
under the identical helper name for a sibling file (`PTQ-1082`,
`tests/params-block-mapping-rhs-refusal.test.ts`, and `PTQ-1403` for a third
file), each citing the same `tests/helpers/e2e-s1.ts:445-475`-era export as
the un-imported canonical helper.

## Suggested direction (non-binding, optional)
The additional `properties`/`fields` reads this file needs beyond the
canonical `loadCleanly`'s `defs`/`loweredSchema` return could be layered on
top of a call to the exported helper rather than duplicating its first three
guard clauses; that is an observation about where the shared guard logic
already lives, not a design.

## False-positive check
- Gate-pin check: the file is not a `*gate*.test.ts` file and `loadCleanly`
  is not a pinned-count/inventory assertion, so the census/pin carve-out does
  not apply.
- Recording-double check: `loadCleanly` is a parse-and-guard helper, not a
  recording double, and witnesses no "never called" assertion.
- docs/bugs/ signature search: `grep -ril "loadCleanly" docs/bugs` returned
  no hits, so no documented correct-reason red cites this function by name.
- coverage-matrix/bug-doc citation search: `grep -rl
  "params-default-string-literal-raw-newline" docs/reference/coverage-matrix.md
  docs/bugs` returned no hits naming this test file; no merge, rename or
  deletion of a cited test is proposed here.
- Coverage drift check: this finding claims no untested path; it is scoped
  to the duplicated guard-chain code quoted above.
- Already-filed check: `grep -ril "raw-newline" quality/resolved
  quality/intake` found `PTQ-0658` (registry-oracle reimplementation, fixed —
  already resolved and reflected in the current REGISTRY import) but no
  finding about this file's `loadCleanly`; the closest precedents (`PTQ-0212`,
  `PTQ-1082`, `PTQ-1403`) are filed against the canonical helper's creation
  and against two different sibling files respectively, so this is a
  distinct, not-yet-filed occurrence for this file.

## Triage
verdict: confirmed — independently re-verified: the private `LoadedParams`/`loadCleanly` reproduces at tests/params-default-string-literal-raw-newline.test.ts:312-360 (decl :326, small drift from the cited 319) and the canonical export at tests/helpers/e2e-s1.ts:697-721; the frontmatter-null and params-undefined throws are byte-identical, the loweredSchema-absent throw differs only by the canonical's longer tail, and the rest of the delta is the `expect` wording, the `bug0102.theta` path, and the local `properties` guard plus `properties`/`fields` return, all of which the direction accounts for; the copy is live (call sites :609, :690, :709; suite 48/48 green) and the e2e-s1 import at :8 names `parseDoc, fieldOf, diagLines, diagCodes` but not `loadCleanly`; not a gate/kin file, and no recording-double or red-test carve-out applies; this is the same per-file PTQ-0212 residual already confirmed for other files (PTQ-0879/1082/1402/1403, all resolved), no open or intake row names this file's `loadCleanly`, and same-wave d7-01 covers wrappers that already compose over the shared helper in two other files; D7 boilerplate duplication, and the mechanical fix is an import plus a thin wrapper; note that the filing's FP check is inaccurate — `grep -ril loadCleanly docs/bugs` hits 0045 and 0102 (0102:1114 cites this helper's lines as `:334–369`), and 20 bug docs name the file — but because no test is merged, renamed or deleted, this does not refute the finding and only means the 0102 line citation will drift (triage: claude-opus-5-5)
