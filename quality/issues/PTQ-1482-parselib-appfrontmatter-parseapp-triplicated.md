---
id: PTQ-1482
title: parseLib / APP_FRONTMATTER / parseApp are redeclared near-identically in all three import bug-witness files
lens: D7
status: open
verdict: confirmed
locations:
  - tests/import-specifier-separator-production-required.test.ts:216-229
  - tests/import-specifier-list-production-required.test.ts:230-243
  - tests/import-export-from-clause-required.test.ts:169-179
sites: 3
fix_scope: cross-module
wave: qw20260923145222
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-23
---

# parseLib / APP_FRONTMATTER / parseApp are redeclared near-identically in all three import bug-witness files

## Observation
`tests/import-specifier-separator-production-required.test.ts` (bug 0211), `tests/import-specifier-list-production-required.test.ts` (bug 0100), and `tests/import-export-from-clause-required.test.ts` (bug 0058) each independently declare a local `function parseLib(body: string): ThetaDocument`, a local `const APP_FRONTMATTER = [...].join("\n")` string, and a local `function parseApp(body: string): ThetaDocument` that concatenates `APP_FRONTMATTER` with the caller's body. Two of the three files (0211, 0100) also each independently declare the identical `const APP_FIRST_BODY_LINE = 5;`. The `APP_FRONTMATTER` literal and the `parseApp` body are byte-for-byte identical across all three files; `parseLib`'s body differs only in which imported parse function (`parse` vs `parseDoc`, both aliases of `parseDoc` from `./helpers/e2e-s1`) it calls.

## Evidence
`tests/import-specifier-separator-production-required.test.ts:216-229`:
```ts
function parseLib(body: string): ThetaDocument {
  return parse(`${body}\n`, "/proj/lib.thetalib");
}

/** The importing `.theta` frontmatter every `.theta` fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** The line the first body statement occupies under `APP_FRONTMATTER`. */
const APP_FIRST_BODY_LINE = 5;

/** Parse a `.theta` body under the shared frontmatter. */
function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}
```

`tests/import-specifier-list-production-required.test.ts:230-243` (identical `APP_FRONTMATTER` literal, identical `APP_FIRST_BODY_LINE`, identical `parseApp` body):
```ts
function parseLib(body: string): ThetaDocument {
  return parseDoc(`${body}\n`, "/proj/lib.thetalib");
}

/** The importing `.theta` frontmatter every `.theta` fixture shares. */
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

/** The line the first body statement occupies under `APP_FRONTMATTER`. */
const APP_FIRST_BODY_LINE = 5;

/** Parse a `.theta` body under the shared frontmatter. */
function parseApp(body: string): ThetaDocument {
  return parseDoc(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}
```

`tests/import-export-from-clause-required.test.ts:169-179` (same `parseLib`/`parseApp` shape, same `APP_FRONTMATTER` literal with single-quote spelling):
```ts
function parseLib(body: string): ThetaDocument {
  return parseDoc(`${body}\n`, "/proj/lib.thetalib");
}

/** The importing `.theta` frontmatter every `.theta` fixture shares. */
const APP_FRONTMATTER = ['---', 'model: "sonnet"', "mode: prompt", '---'].join("\n");

/** Parse a `.theta` body under the shared frontmatter. */
function parseApp(body: string): ThetaDocument {
  return parseDoc(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}
```

Search run: `grep -n "function parseLib\|APP_FRONTMATTER =\|function parseApp" tests/import-specifier-separator-production-required.test.ts tests/import-specifier-list-production-required.test.ts tests/import-export-from-clause-required.test.ts` — exactly 3 hits per pattern, one per file, confirming all three files carry all three declarations with no shared import between them.

## Why this is a problem
All three files are the same matched bug-witness trio (0058/0100/0211) already known to share `expectStatementRefusal`, `REGISTRY`, and `normativeMessage` (`quality/issues/PTQ-1395`). `parseLib`, `APP_FRONTMATTER`, and `parseApp` are a fourth piece of that same shared harness — "parse a `.thetalib` body" and "parse a `.theta` body under the one shared frontmatter" — retyped a third time rather than imported once, with `APP_FIRST_BODY_LINE` already drifting to being present in two of the three files and absent from the third.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts` already supplies the underlying `parseDoc` these three wrappers all call; a shared `parseLib`/`APP_FRONTMATTER`/`parseApp` fixture trio under `tests/helpers/` would be the natural home for a fourth sibling file to import instead of retyping.

## False-positive check
- Gate-pin check: none of the three files match `*gate*.test.ts`; the census/pin carve-out does not apply.
- Recording-double check: `parseLib`/`parseApp` are parse-driver wrappers over a string body, not call-recording MUST-NOT-witness doubles; the negative-witness carve-out does not apply.
- docs/bugs/ signature search: grepped the three referenced bug docs (0058, 0100, 0211) for "parseLib" / "APP_FRONTMATTER" / "parseApp" — no reference; not a documented correct-reason divergence.
- coverage-matrix/bug-doc citation search: grepped `docs/reference/coverage-matrix.md` for the three file names — no hits, so no citation pins this internal helper choice; this filing does not propose merging, renaming, or deleting any test.
- Confirmed via direct read of all three files that `APP_FRONTMATTER`'s array literal and `parseApp`'s body are byte-identical (modulo quote style) across all three, and that `parseLib` differs only in which import alias it calls through to the same underlying `parseDoc`.
- Checked `quality/issues/PTQ-1395` (already filed, same trio, different root cause — `normativeMessage`): its Observation names `parseLib`, `parseApp`, and `APP_FRONTMATTER` in passing as also-shared context but does not file them as their own root cause, and no other `quality/issues/` entry's Locations cite `parseLib`/`APP_FRONTMATTER`/`parseApp` by name — this is a distinct, previously unfiled duplication.

## Triage
<!-- triage appends its note here -->
verdict: confirmed — reproduces at HEAD: `parseLib`/`APP_FRONTMATTER`/`parseApp` declared at tests/import-specifier-separator-production-required.test.ts:216-229, tests/import-specifier-list-production-required.test.ts:230-243 and tests/import-export-from-clause-required.test.ts:169-179; mktemp sed-extract + diff shows copies 1≡2 byte-identical once the `parse`→`parseDoc` import alias is normalised, copy 3 differs only by quote style and the absent `APP_FIRST_BODY_LINE` (grep: 3/7/0 hits — the drift claim holds); all three copies live (parseLib 8/10/6, parseApp 5/10/4 references); none imports a shared home even though tests/helpers/thetalib-load-harness.ts:206 already exports `parseImportingApp(body, sourcePath = "/proj/app.theta")` with the same frontmatter-prepend shape (only the model literal differs, `"sonnet"` vs `"anthropic/claude-sonnet-5"`), so the fold is a mechanical export + import swap; not a *gate* file, stateless parse wrappers (no recording double), docs/bugs/0058|0100|0211 grep → 0, coverage-matrix → 0, no it()/describe() change proposed; not a duplicate — resolved PTQ-0914 folded only the underlying local `parse()` into `parseDoc` in two of these files (leaving `parseLib`/`parseApp` as its callers), resolved PTQ-0239 covers the b0303–b0306 family, open PTQ-1395 (`normativeMessage`) and PTQ-1387 (`loadImports`) name these wrappers only as shared context, and same-wave d7-01-parse-src-path-wrapper targets six disjoint files — D7 boilerplate-duplication class (triage: claude-fable-5-1)
