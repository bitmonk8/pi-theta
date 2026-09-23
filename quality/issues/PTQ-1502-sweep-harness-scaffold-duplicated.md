---
id: PTQ-1502
title: The whole 32-spelling sweep harness (column constants, source builders, sweep/expectedSweep) is restated verbatim between the two in-scope files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/reserved-keyword-misfire-faces.test.ts:220-226
  - tests/reserved-keyword-misfire-faces.test.ts:231-248
  - tests/reserved-keyword-misfire-faces.test.ts:250-270
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:285-296
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:302-308
  - tests/reserved-keyword-remaining-identifier-positions.test.ts:259-279
sites: 2
fix_scope: localized
wave: qw20260923185337
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# The whole 32-spelling sweep harness (column constants, source builders, sweep/expectedSweep) is restated verbatim between the two in-scope files

## Observation
Both in-scope files declare the identical seven 1-indexed column constants
(`FOR_COL`, `PAR_FOR_COL`, `SCHEMA_FIELD_COL`, `PARAMS_KEY_COL`,
`ENUM_VARIANT_COL`, `IMPORT_BARE_COL`, `IMPORT_ALIAS_COL`), the identical set
of per-shape source-string builders they share
(`forSource`, `parForSource`, `schemaFieldSource`, `enumVariantSource`,
`importBareLine`, `importBareSource`, `importAliasSource`, `paramsSource`),
and the identical `sweep(source, path)` / `expectedSweep(rule)` pair that
drives a 32-spelling record over any of those builders. Every value and every
executable line is byte-identical between the two files; neither file imports
the other's declaration, and no `tests/helpers/` module exports any of them.

## Evidence
Column constants — `tests/reserved-keyword-misfire-faces.test.ts:220-226`:
```ts
const FOR_COL = 5; // `for `
const PAR_FOR_COL = 9; // `par for `
const SCHEMA_FIELD_COL = 12; // `schema S { `
const PARAMS_KEY_COL = 3; // the two-space YAML indent
const ENUM_VARIANT_COL = 10; // `enum E { `
const IMPORT_BARE_COL = 10; // `import { `
const IMPORT_ALIAS_COL = 15; // `import { a as `
```
`tests/reserved-keyword-remaining-identifier-positions.test.ts:302-308` — the
same seven values in the same order (only the trailing comments are dropped):
```ts
const FOR_COL = 5;
const PAR_FOR_COL = 9;
const SCHEMA_FIELD_COL = 12;
const PARAMS_KEY_COL = 3;
const ENUM_VARIANT_COL = 10;
const IMPORT_BARE_COL = 10;
const IMPORT_ALIAS_COL = 15;
```

Source builders (the six both files share) —
`tests/reserved-keyword-misfire-faces.test.ts:231-238`:
```ts
const forSource = (kw: string): string =>
  `${FM}let xs = [1]\nfor ${kw} in xs { 1 }\n1\n`;
const parForSource = (kw: string): string =>
  `${FM}let xs = [1]\npar for ${kw} in xs { 1 }\n1\n`;
const schemaFieldSource = (kw: string): string => `${FM}schema S { ${kw}: string }\n1\n`;
const enumVariantSource = (kw: string): string => `${FM}enum E { ${kw} }\n1\n`;
const importBareLine = (kw: string): string => `import { ${kw} } from "./lib.thetalib"`;
const importBareSource = (kw: string): string => `${FM}${importBareLine(kw)}\n1\n`;
```
`tests/reserved-keyword-remaining-identifier-positions.test.ts:285-294` — the
same six declarations, byte-identical bodies, only reordered around the
file's own `paramsSource`:
```ts
const forSource = (kw: string): string =>
  `${FM}let xs = [1]\nfor ${kw} in xs { 1 }\n1\n`;
const parForSource = (kw: string): string =>
  `${FM}let xs = [1]\npar for ${kw} in xs { 1 }\n1\n`;
const schemaFieldSource = (kw: string): string => `${FM}schema S { ${kw}: string }\n1\n`;
const paramsSource = (kw: string): string =>
  `---\nmode: prompt\nparams:\n  ${kw}: string\n---\n1\n`;
const enumVariantSource = (kw: string): string => `${FM}enum E { ${kw} }\n1\n`;
const importBareLine = (kw: string): string => `import { ${kw} } from "./lib.thetalib"`;
const importBareSource = (kw: string): string => `${FM}${importBareLine(kw)}\n1\n`;
```

The sweep runners — `tests/reserved-keyword-misfire-faces.test.ts:251-270`:
```ts
function sweep(
  source: (keyword: string) => string,
  path?: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    const text = source(keyword);
    out[keyword] = lines(path === undefined ? parseDoc(text) : parseDoc(text, path));
  }
  return out;
}

function expectedSweep(rule: (keyword: string) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    out[keyword] = rule(keyword);
  }
  return out;
}
```
`tests/reserved-keyword-remaining-identifier-positions.test.ts:260-279` — the
same two functions, byte-identical executable bodies (only the leading doc
comment reads "one position's" instead of "one shape's"):
```ts
function sweep(
  source: (keyword: string) => string,
  path?: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    const text = source(keyword);
    out[keyword] = lines(path === undefined ? parseDoc(text) : parseDoc(text, path));
  }
  return out;
}

function expectedSweep(rule: (keyword: string) => string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const keyword of SPELLINGS) {
    out[keyword] = rule(keyword);
  }
  return out;
}
```

Exact search: `grep -rln "^function sweep(" tests/*.test.ts` → 2 hits, exactly
the two in-scope files. A line-for-line `diff` of the extracted `sweep`
bodies and of the extracted `expectedSweep` bodies (both isolated with `awk
'/^function NAME\(/,/^}/'`) is empty for both pairs. `grep -n "^const
FOR_COL\|^const PAR_FOR_COL\|^const SCHEMA_FIELD_COL\|^const
PARAMS_KEY_COL\|^const ENUM_VARIANT_COL\|^const IMPORT_BARE_COL\|^const
IMPORT_ALIAS_COL" tests/reserved-keyword-misfire-faces.test.ts
tests/reserved-keyword-remaining-identifier-positions.test.ts` → 7 hits in
each file, identical values in identical order. `grep -rl "forSource\b"
tests/*.test.ts` → 2 hits, the same two files.

## Why this is a problem
Both files independently build the same per-spelling test-input factory over
the same six or seven `.theta` shapes at the same fixed columns, and the same
two generic 32-key-record runners over `SPELLINGS`, with no shared
declaration and no `tests/helpers/` export backing any of it. A change to
any one shape's fixed prefix (and therefore its column), or to the sweep's
own iteration or record-building logic, has to be reproduced correctly at
both declaration sites rather than fixed once.

## Suggested direction (non-binding, optional)
Both files already import `SPELLINGS` from the shipped `reservedKeywords()`
and the shared `lines`/`parseDoc` primitives from `tests/helpers/e2e-s1`; the
column constants, the six shared source builders, and the `sweep`/
`expectedSweep` runner pair are the kind of reserved-keyword-family fixture
`tests/helpers/load-row-harness.ts` already hosts other exports for (the
`RESERVED`-family range builders it exports today).

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or the named gate
  kin (the one `*gate*` file in this family,
  `b0281-applied-reserved-generic-head-gate-at-nine-positions.test.ts`, is a
  distinct file outside this review's scope); not a census/pin gate.
- Recording-double check: `sweep`/`expectedSweep`/the source builders are
  pure string builders and record constructors, not fakes, doubles, or
  MUST-NOT witnesses.
- docs/bugs/ signature search: `grep -rl "function sweep(\|expectedSweep\|forSource"
  docs/bugs/*.md` → 0 hits; no documented correct-reason red names any of
  these declarations.
- coverage-matrix/bug-doc citation search: `grep -n
  "reserved-keyword-misfire-faces\|reserved-keyword-remaining-identifier-positions"
  docs/reference/coverage-matrix.md` → 0 hits; no merge, rename, or deletion
  of either file, `describe`, or `it()` is proposed — only that the shared
  scaffold could converge on one export.
- Prior-filing search: `grep -rl "forSource\|schemaFieldSource\|expectedSweep"
  quality/issues quality/resolved quality/intake` (before this filing) →
  0 hits, so this scaffold-wide duplication is distinct from the
  already-resolved PTQ-0616 (registry-message reader), PTQ-0817/PTQ-0858/
  PTQ-1351/PTQ-1383 (registry read, range renderer, `FM`/`msg`/
  `singleLineIfAt`, and the `reservedAt`/`reservedTok` range template),
  none of which name `sweep`, `expectedSweep`, the column constants, or the
  per-shape source builders.

## Triage
verdict: confirmed — reproduced at the cited lines: the seven *_COL constants (misfire-faces:220-226 / remaining-identifier-positions:302-308, same values and order), the source builders (misfire-faces:231-248 / remaining:285-296; eight are byte-identical, since importAliasSource and paramsSource match too, not just the six excerpted), and sweep/expectedSweep (misfire-faces:251-270 / remaining:260-279, identical bodies) are declared locally in both files; `grep -rln "^function sweep(\|forSource\b" tests/` finds only these two files, and no helper exports them; D7 boilerplate duplication, no gate/double/bug-doc carve-out applies; not a duplicate, because resolved PTQ-1351/1383/0858/0817/0526 and every other quality/ file never mention sweep, expectedSweep, forSource or the column constants (triage: claude-opus-5-5)
