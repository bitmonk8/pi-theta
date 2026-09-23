---
id: PTQ-1387
title: import-specifier-separator test reimplements loadThetaLibDiags as a local loadImports despite importing fakeThetaLibFs from the same helper module
lens: D7
status: open
verdict: confirmed
locations:
  - tests/import-specifier-separator-production-required.test.ts:1
  - tests/import-specifier-separator-production-required.test.ts:279-300
  - tests/import-export-from-clause-required.test.ts:12-14
  - tests/helpers/thetalib-load-harness.ts:196-224
sites: 1
fix_scope: localized
wave: qw20260922211400
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-22
---

# import-specifier-separator test reimplements loadThetaLibDiags as a local loadImports despite importing fakeThetaLibFs from the same helper module

## Observation
`tests/import-specifier-separator-production-required.test.ts` imports
`fakeThetaLibFs` from `tests/helpers/thetalib-load-harness.ts` (line 1) but
does not import that same module's `loadThetaLibDiags` export. Instead it
declares its own local `async function loadImports(appBody, libs)` that
parses the importing theta, asserts the frontmatter parsed, builds a
`ThetaCompositionInput`, calls `checkThetaImports({ fs: fakeThetaLibFs(libs),
parseDeps: parseDeps() })`, and reshapes the result into `{ diagnostics,
materialised }`. The two sibling files in the same bug family
(`import-export-from-clause-required.test.ts`,
`import-specifier-list-production-required.test.ts`) import
`loadThetaLibDiags` from the same helper module (aliased `as loadImports`)
and use it directly.

## Evidence
`tests/import-specifier-separator-production-required.test.ts:1`:
```ts
import { fakeThetaLibFs } from "./helpers/thetalib-load-harness";
```

`tests/import-specifier-separator-production-required.test.ts:286-300`:
```ts
/** The load-pass result for one importing `.theta` body over one lib set. */
async function loadImports(
  appBody: string,
  libs: Record<string, string>,
): Promise<{ readonly diagnostics: readonly Diagnostic[]; readonly materialised: string[] }> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse, or the load pass reads nothing. Diagnostics: ${JSON.stringify(diagLines(app.diagnostics))}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
```

`tests/import-export-from-clause-required.test.ts:14` (contrast — the sibling
file in the same bug family imports the canonical driver instead of
reimplementing it):
```ts
import { loadThetaLibDiags as loadImports } from "./helpers/thetalib-load-harness";
```

`tests/helpers/thetalib-load-harness.ts:196-224` (the canonical driver this
file re-derives instead of importing):
```ts
export async function loadThetaLibDiags(
  appBody: string | ThetaDocument,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = typeof appBody === "string" ? parseImportingApp(appBody) : appBody;
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const frontmatter = app.frontmatter as ParsedFrontmatter;
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
```

## Why this is a problem
`tests/helpers/thetalib-load-harness.ts`'s own header states its reason for
existing: three-plus files independently redeclared this exact "parse the
importing theta, assert frontmatter, build `ThetaCompositionInput`, drive
`checkThetaImports` over `fakeThetaLibFs`" sequence, so the module centralises
it as `loadThetaLibDiags`. This file's local `loadImports` is the same
sequence over the same two calls (`parseApp`/frontmatter-assert,
`checkThetaImports` with `fs: fakeThetaLibFs(libs), parseDeps: parseDeps()`),
differing only in returning a two-field `{diagnostics, materialised}` object
instead of the five-field `LoadResult`. It imports `fakeThetaLibFs` from the
very module whose exported `loadThetaLibDiags` wraps that same double, but
does not import the wrapper — the file within this review's own three-file
scope where two of three siblings already use it directly.

## Suggested direction (non-binding, optional)
The natural home for this driver is `loadThetaLibDiags`
(`tests/helpers/thetalib-load-harness.ts`), already imported by this file's own
sibling under the same alias (`loadThetaLibDiags as loadImports`).

## False-positive check
- Gate-pin check: not a `*gate*.test.ts` file; the census/pin carve-out does
  not apply.
- Recording-double check: `fakeThetaLibFs` is a state double (a flat
  path→content map), not a call-recording double asserting a MUST-NOT witness;
  the negative-witness carve-out does not apply.
- docs/bugs/ signature search: grepped for "loadImports" and "loadThetaLibDiags"
  in `docs/bugs/0211*` — no reference either way; this is not a documented
  correct-reason divergence.
- coverage-matrix/bug-doc citation search: grepped
  `docs/reference/coverage-matrix.md` for the three file names — no hits, so no
  citation pins this internal helper choice.
- Confirmed via direct read that the local `loadImports` reshapes the same
  `checkThetaImports` call the canonical `loadThetaLibDiags` makes, using the
  same `fs: fakeThetaLibFs(libs), parseDeps: parseDeps()` argument shape.

## Triage
verdict: confirmed — reproduces at HEAD: tests/import-specifier-separator-production-required.test.ts:1 imports only `fakeThetaLibFs` from ./helpers/thetalib-load-harness and :286-306 declares a local `loadImports` that is the same parse-app / frontmatter-assert / `ThetaCompositionInput` / `checkThetaImports({ fs: fakeThetaLibFs(libs), parseDeps: parseDeps() })` sequence as `loadThetaLibDiags` at tests/helpers/thetalib-load-harness.ts:196-224, differing only in returning a 2-field subset of the harness's 5-field `LoadResult` (which since PTQ-0467's fix already carries `materialised` and `diagnostics`, the only two fields the three (e) cells at :866-935 read); both bug-family siblings import `loadThetaLibDiags as loadImports` (from-clause :14, specifier-list :14, 9 call sites) because PTQ-0467 (fixed) migrated exactly those two files and PTQ-0713 (fixed) migrated only this file's `fakeThetaLibFs` double (:313-347 then), leaving the driver behind — so no open or resolved row tracks this residual; not a *gate* file, `fakeThetaLibFs` is a state double not a recording double, 0 hits for the three file names in docs/reference/coverage-matrix.md and 0 hits for loadImports/loadThetaLibDiags in docs/bugs/0211*, git status clean; same-wave siblings d7-01 (REGISTRY read) and d7-03 (normativeMessage) target disjoint helpers — D7 boilerplate-duplication class, fix is a mechanical import swap (harness APP_FRONTMATTER is also 4 lines, so `APP_FIRST_BODY_LINE = 5` still holds) (triage: claude-fable-5-1)
