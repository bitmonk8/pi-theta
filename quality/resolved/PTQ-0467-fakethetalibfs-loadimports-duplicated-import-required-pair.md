---
id: PTQ-0467
title: fakeThetaLibFs and loadImports are byte-identical redeclarations in both import-*-required test files, bypassing the canonical tests/helpers/thetalib-load-harness.ts
lens: D7
status: fixed
verdict: confirmed
locations:
  - tests/import-export-from-clause-required.test.ts:247-280
  - tests/import-export-from-clause-required.test.ts:285-306
  - tests/import-specifier-list-production-required.test.ts:333-366
  - tests/import-specifier-list-production-required.test.ts:371-392
  - tests/helpers/thetalib-load-harness.ts:85-113
sites: 4
fix_scope: module
wave: qw20260917154546
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-17
fix_skips: 0
---

# fakeThetaLibFs and loadImports are byte-identical redeclarations in both import-*-required test files, bypassing the canonical tests/helpers/thetalib-load-harness.ts

## Observation
`tests/import-export-from-clause-required.test.ts` and
`tests/import-specifier-list-production-required.test.ts` each locally declare
a `fakeThetaLibFs(files: Record<string, string>): FileSystem` in-memory
filesystem double and a `loadImports(appBody, libs)` driver that parses an
importing `.theta`, asserts its frontmatter parsed, and calls
`checkThetaImports` over the double. The two declarations are byte-identical
across both files. `tests/helpers/thetalib-load-harness.ts` already exports a
`fakeThetaLibFs` with the same map-derived-directory-listing shape and an
equivalent driver (`loadThetaLibDiags`) built for exactly this purpose, and its
own header documents four prior instances of this same double being
independently redeclared before being centralised there (PTQ-0232, PTQ-0315,
PTQ-0347, PTQ-0393). Neither file in this pair imports the helper module.

## Evidence

`tests/import-export-from-clause-required.test.ts:247-280` (fakeThetaLibFs):
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const name = path.slice(slash + 1);
    const entries = dirs.get(parent) ?? [];
    entries.push(name);
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
    exists: reject,
```

`tests/import-specifier-list-production-required.test.ts:333-366` — the same
function, same lines, character-for-character (re-read immediately before
filing and diffed against the block above via a scratch-file `diff`: zero
differences).

`tests/import-export-from-clause-required.test.ts:285-306` (loadImports):
```ts
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
  const result = await checkThetaImports(input, {
    fs: fakeThetaLibFs(libs),
    parseDeps: parseDeps(),
  });
  return {
    diagnostics: result.diagnostics,
    materialised: result.imports.map((m) => `${m.kind} ${m.name}`),
  };
}
```

`tests/import-specifier-list-production-required.test.ts:371-392` — the same
22-line function, character-for-character (re-read immediately before filing:
identical).

`tests/helpers/thetalib-load-harness.ts:85-113` — the pre-existing canonical
export, same map-derived-directory-listing shape, same `readdir`/`readBytes`
serving pair, same "every other member rejects loudly" comment intent:
```ts
export function fakeThetaLibFs(files: Record<string, string>): FileSystem {
  const dirs = new Map<string, string[]>();
  for (const path of Object.keys(files)) {
    const slash = path.lastIndexOf("/");
    const parent = path.slice(0, slash);
    const entries = dirs.get(parent) ?? [];
    entries.push(path.slice(slash + 1));
    dirs.set(parent, entries);
  }
  const reject = (): Promise<never> =>
    Promise.reject(new Error("filesystem member not exercised by this test"));
  return {
    readText: reject,
    writeText: reject,
```

`tests/import-specifier-list-production-required.test.ts:238-239` — the second
file's own header text names the first file as reusing the same block, showing
both authors were aware of the sibling but neither pointed either declaration
at the helpers module:
```ts
// the load pass reads (the shape tests/subagent-fn.test.ts:1581–1614 uses, and
// tests/import-export-from-clause-required.test.ts reuses for 0058). One live cell
```

Search: `grep -rln "function fakeThetaLibFs" tests/*.test.ts` returns 18 files
declaring the function locally, including these two; `grep -rln
"fakeThetaLibFs} from \"./helpers/thetalib-load-harness\"" tests/*.test.ts`
returns 4 files that import the canonical export instead
(b0304-transitive-lib-diagnostics.test.ts,
b0448-imported-non-object-ctor.test.ts,
b0450-imported-enum-system-param.test.ts, b0476-panic-site-and-frames.test.ts).
Neither file in this pair appears in that importer list.

## Why this is a problem
Both facts are identical instances of the same fixture-plus-driver bundle,
declared twice inside this pair of files and a third functionally-equivalent
time in `tests/helpers/thetalib-load-harness.ts`. The harness module's own
header states its reason for existing: to stop exactly this "redeclared the
same three-piece bundle" pattern from recurring across files that drive
`checkThetaImports` over an in-memory `.thetalib` tree — the same operation
both files in this pair perform. The two files in scope duplicate the fixture
and driver between themselves and independently of the module built to hold
them.

## Suggested direction (non-binding, optional)
`tests/helpers/thetalib-load-harness.ts`'s exported `fakeThetaLibFs` and
`loadThetaLibDiags` already cover this shape; the natural home for both local
declarations is that existing module, as observation rather than design. This
finding does not propose merging, renaming, or deleting either test file —
only relocating the two duplicated helper declarations.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a kin pattern; not
  applicable.
- Recording-double check: `fakeThetaLibFs` is a stub double (canned
  readdir/readBytes answers), not a recording double asserting a
  never-called invariant; the carve-out does not apply.
- docs/bugs/ signature search: both files are RED-at-HEAD regression suites
  for bugs 0058 and 0100 respectively, but the redness they document concerns
  the parser's diagnostic emission, not this harness duplication; no bug doc
  claims the duplicated fixture itself as a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -rn
  "import-export-from-clause-required\|import-specifier-list-production-required"
  docs/bugs/*.md` returns dozens of hits — both files are named as witnesses in
  docs/bugs/0058, 0095, 0100, 0101, 0138, 0211, 0304, 0431 and 0456. Both files
  ARE pinned by citation. Per the carve-out, a finding that proposes to merge,
  rename, or delete a cited test must say so explicitly; this finding proposes
  none of those — it identifies duplicated helper functions inside the files,
  leaving both files, their names, and their test bodies untouched, so the
  citation pin does not block filing.
- Coverage drift check: this finding does not claim a missing test or an
  untested path; both files' actual assertions are out of scope for this
  finding.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: `sed`-extracted lines 247-306 of import-export-from-clause-required and 333-392 of import-specifier-list-production-required diff IDENTICAL (fakeThetaLibFs + loadImports both byte-for-byte), and the local fakeThetaLibFs differs from the harness export at tests/helpers/thetalib-load-harness.ts:85-113 only by the `export` keyword, an inlined `name` temp and the trailing `as FileSystem` cast; `function fakeThetaLibFs` greps to 18 tests/*.test.ts including both files, neither imports ./helpers/thetalib-load-harness (only ./helpers/e2e-s1), and the harness header itself names PTQ-0232/0315/0347/0393 as the same double centralised there; D7 copy-paste-fixture/double class, all locations under tests/, no carve-out applies (not a gate file, stateless stub not a recording double, coverage-matrix cites 0, bug-doc witness pins untouched since no merge/rename/delete is proposed); dedupe clean — PTQ-0239 is a disjoint `parse()` helper in disjoint files, resolved PTQ-0232/0310/0393 and the same-wave siblings (d7-15 separator+args, d7-02 live trios, reexport-chain, b0388/b0422/b0429/b0445/b0465) all cite disjoint file sets. Two non-blocking inaccuracies for the record: the `:238-239` header-comment citation actually sits at line 144, and the FP-check's "RED-at-HEAD" claim is wrong — docs/bugs/0058 and 0100 both read fixed (0.60.0/0.134.0) and both suites pass 56/56 at HEAD, which if anything simplifies the dedupe; fixer note: `loadThetaLibDiags` does not return `materialised`, and the harness APP_FRONTMATTER pins a different model string, so the driver relocation needs a small harness extension rather than a drop-in swap (triage: claude-fable-5-1)

## Fix attempts
- (wave unknown): skipped — (no fixer notes recorded)
