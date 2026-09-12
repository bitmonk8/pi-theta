---
id: PTQ-0232
title: b0333, b0334 and b0335 each redefine an identical fakeThetaLibFs/LoadResult/load-driver bundle for driving checkThetaImports
lens: D7                     # D2 | D7 — the lens that filed this
status: fixed
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0333-transitive-lib-reexport-edge.test.ts:152-229
  - tests/b0334-reexport-multisource-collision.test.ts:148-225
  - tests/b0335-own-import-shadows-own-declaration.test.ts:148-222
sites: 3
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0333, b0334 and b0335 each redefine an identical fakeThetaLibFs/LoadResult/load-driver bundle for driving checkThetaImports

## Observation
tests/b0333-transitive-lib-reexport-edge.test.ts, tests/b0334-reexport-multisource-collision.test.ts and tests/b0335-own-import-shadows-own-declaration.test.ts each declare, module-scope, an identical three-piece harness for driving the real `checkThetaImports` over a set of in-memory `.thetalib` sources: a `fakeThetaLibFs(files)` function that derives a directory listing from a flat path→content map and serves only `readdir`/`readBytes` (every other `FileSystem` member rejects with a fixed message), a three-field `LoadResult` interface (`appParseCodes`, `diagnostics`, `diagLines`), and an `async` driver function (`b0333LoadDiags` / `b0334LoadDiags` / `loadDiags`) that parses the importing theta, asserts its frontmatter parsed, calls `checkThetaImports` with the fake filesystem, and reshapes the result. `fakeThetaLibFs` and `LoadResult` are byte-for-byte identical across all three files; the driver functions are identical apart from their own name and one file's (b0335's) more compact signature/variable layout. No `tests/helpers/` module exports any of these three pieces.

## Evidence

tests/b0333-transitive-lib-reexport-edge.test.ts:152-163 — `fakeThetaLibFs`'s opening (the directory-listing derived from the flat file map):
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
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
```

tests/b0334-reexport-multisource-collision.test.ts:148-159 — confirmed byte-identical via `diff`:
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
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
```

tests/b0335-own-import-shadows-own-declaration.test.ts:148-159 — confirmed byte-identical via `diff`; the full function bodies (through the closing brace at each file's line 186/182/182 respectively, including the `readdir`/`readBytes` implementations) were compared directly and differ nowhere except this cited opening's surrounding line numbers:
```ts
function fakeThetaLibFs(files: Record<string, string>): FileSystem {
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
```

tests/b0333-transitive-lib-reexport-edge.test.ts:188-192 — the `LoadResult` interface:
```ts
interface LoadResult {
  readonly appParseCodes: string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly diagLines: string[];
}
```

tests/b0334-reexport-multisource-collision.test.ts:184-188 and tests/b0335-own-import-shadows-own-declaration.test.ts:184-188 — both byte-identical to the excerpt above (verified directly; identical field names, order and types in all three files).

tests/b0333-transitive-lib-reexport-edge.test.ts:202-216 — the driver's opening (parse, then assert the precondition that the importing theta's own frontmatter parsed):
```ts
async function b0333LoadDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseApp(appBody);
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
```

tests/b0334-reexport-multisource-collision.test.ts:198-212 — confirmed byte-identical via `diff` apart from the function's own name:
```ts
async function b0334LoadDiags(
  appBody: string,
  libs: Record<string, string>,
): Promise<LoadResult> {
  const app = parseApp(appBody);
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
```

tests/b0335-own-import-shadows-own-declaration.test.ts:199-213 — the same body (one-line signature, and `app.frontmatter as ParsedFrontmatter` inlined into the input literal instead of a separate `const frontmatter` binding, but the same parse call, the same precondition `expect`, and the same input shape):
```ts
async function loadDiags(appBody: string, libs: Record<string, string>): Promise<LoadResult> {
  const app = parseApp(appBody);
  expect(
    app.frontmatter,
    `the importing theta's frontmatter must parse or the load pass reads nothing; diagnostics: ${JSON.stringify(
      app.diagnostics.map((d) => `${d.severity} ${d.code}: ${d.message}`),
    )}`,
  ).not.toBeNull();
  const input: ThetaCompositionInput = {
    slashName: "app",
    sourcePath: "/proj/app.theta",
    frontmatter: app.frontmatter as ParsedFrontmatter,
    body: app.body,
  };
  const check = await checkThetaImports(input, {
```

Each driver's remaining tail (the `checkThetaImports` call and the `LoadResult` reshape) was compared directly across all three files and is also byte-identical apart from the same cosmetic differences noted above.

Pattern-wide search: `grep -rl "interface LoadResult {" tests --include="*.test.ts"` → exactly these 3 files, no others. A wider search, `grep -rl "function fakeThetaLibFs" tests --include="*.test.ts" | wc -l` → 27 files reuse the same double under the same name (a broader family this finding does not claim to own), but `grep -rln "appParseCodes" tests --include="*.test.ts"` narrows to 12 files, and of those, only the 3 cited here share the identical 3-field `LoadResult` interface and driver shape — the other 9 wrap the field into a differently-named or differently-shaped row type. tests/helpers/fake-file-system.ts's `FakeFileSystem` is the nearest existing double, but its constructor requires an explicit, separately-supplied `dirs` map rather than deriving one from a flat file map the way all three copies of `fakeThetaLibFs` do, so it is not a drop-in replacement without also writing the derivation these three files already hand-roll identically.

## Why this is a problem
A three-piece harness — a hand-rolled in-memory `.thetalib` filesystem double, a fixed result-shape interface, and an `async` function that parses, asserts a precondition, drives the real `checkThetaImports`, and reshapes its output — is retyped whole into three sibling bug-report test files rather than shared. `fakeThetaLibFs` and `LoadResult` are confirmed byte-for-byte identical across all three; the driver differs only by its own name and one file's harmless signature-formatting choice. All three files are sequential, closely-related bug numbers (333-335) in the same import/re-export family, and each cites the previous one's harness as its own source ("the tests/reexport-chain-resolution.test.ts harness shape", "the b0333 / reexport-chain-resolution harness shape", "the b0302 / b0334 harness shape, reused verbatim") — showing the three-times repetition here is a direct, traceable lineage rather than three independent authors converging by coincidence. No `tests/helpers/` module hosts any of the three pieces, unlike the adjacent registry-read half of these same files (`RegistryRow`/`REGISTRY`), which does have a canonical home the reviewed files bypass under a separate finding.

## Suggested direction (non-binding, optional)
A `tests/helpers/`-hosted module exporting this exact three-piece bundle — parameterised by nothing these three files do not already share — is the natural next home the files' own "harness shape, reused verbatim" comments already point toward, alongside the project's existing `tests/helpers/fake-file-system.ts` for the general-purpose double and `tests/helpers/e2e-s1.ts` for the parse plumbing this bundle sits next to.

## False-positive check
- Gate-pin: none of the three files matches `*gate*.test.ts` or the named kin; the cited functions and interface are harness plumbing, not a pinned count or inventory assertion.
- Recording-double: `fakeThetaLibFs` is a stateless read-only double (it answers `readdir`/`readBytes` from a fixed map); it records no calls and backs no "never called" witness, so the negative-witness carve-out does not apply.
- docs/bugs/ signature search: docs/bugs/0333-transitive-lib-reexport-edge-fault-silent.md Status "fixed (0.302.0)"; docs/bugs/0334-reexport-closure-multi-source-name-collision-silent.md Status "fixed (0.303.0)"; docs/bugs/0335-thetalib-own-import-shadows-own-declaration-undiagnosed.md Status "fixed (0.304.0)". `npx vitest run tests/b0333-transitive-lib-reexport-edge.test.ts tests/b0334-reexport-multisource-collision.test.ts tests/b0335-own-import-shadows-own-declaration.test.ts` → 20 passed (20) at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n "b0333-transitive-lib-reexport-edge\|b0334-reexport-multisource-collision\|b0335-own-import-shadows-own-declaration" docs/reference/coverage-matrix.md` → 0 hits. `grep -rl` for the same three filenames across `docs/bugs/*.md`, excluding each file's own bug document → 0 hits. This finding proposes no merge, rename or deletion of any file or `it()`/`describe()` — only that the three internal harness pieces could be imported rather than redeclared — so no citation is affected.
- Established-convention check: the wider 27-file `fakeThetaLibFs` family is a broader, pre-existing convention this finding does not dispute or claim to own; this finding's claim is narrower and confirmed exact — the specific `LoadResult`/driver bundle built on top of that double is confined to exactly these 3 files (pattern search above), not spread across dozens of independently-converged sites the way the previously-reviewed `rootDouble()` pattern was.
- Overlap check against this wave's sibling candidate: `qw20260912091742-d7-01-b0333-b0335-registry-oracle-duplicated.md` covers the same three files' `RegistryRow`/`REGISTRY` declarations (lines 78-100/81-103/80-102) under a separate root cause (an existing canonical helper, `tests/helpers/registry-oracle.ts`, already covers that piece). This finding's cited ranges start after that block and cover a different piece (the filesystem double, result shape, and driver) for which no canonical helper currently exists; the two findings cite disjoint line ranges in each file.
- Coverage check: the claim is about a repeated harness DEFINITION, not a missing test path; every piece cited is exercised by the tests in its own file (20/20 passing, confirmed above).

## Triage
verdict: confirmed — fakeThetaLibFs and LoadResult are byte-for-byte identical across all three files (diff empty) and the driver differs only by name/formatting (verified directly); `interface LoadResult {` narrows to exactly these 3 files and `appParseCodes` narrows to exactly the 12 files claimed; no tests/helpers/ module covers this bundle (fake-file-system.ts requires an explicit dirs map, not derived from a flat file map); the sibling registry-oracle finding cites disjoint line ranges in the same files; docs/bugs/0333-0335 are fixed and the cited suite reproduces 20/20 green (triage: claude-opus-5)
