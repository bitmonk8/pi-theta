---
id: PTQ-0836
title: Four session-control-*.test.ts files reimplement tests/helpers/e2e-s1.ts's exported parseDoc/parseTheta/codesOf instead of importing them
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/session-control-parse.test.ts:43-51
  - tests/session-control-dispatch.test.ts:62-73
  - tests/session-control-static-checks.test.ts:194-197
  - tests/session-control-callable-set.test.ts:533-536
  - tests/helpers/e2e-s1.ts:46-70
sites: 4                     # count of occurrences cited in Evidence
fix_scope: cross-module       # localized | module | cross-module - mechanical size proxy, NOT a priority
wave: qw20260918050411
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# Four session-control-*.test.ts files reimplement tests/helpers/e2e-s1.ts's exported parseDoc/parseTheta/codesOf instead of importing them

## Observation
`tests/helpers/e2e-s1.ts` exports `parseDoc(src, path = "test.theta")` (build
a `ThetaSource` from a UTF-8-encoded string and call `parseThetaDocument`
with `parseDeps()`), `parseTheta(path, src)` (the same, but throwing loudly
if any error-severity diagnostic is present), and `codesOf(src, path)` (the
same, mapped to `.diagnostics.map(d => d.code)`). All four
`session-control-*.test.ts` files in this review's scope already import
`parseDeps` from this same module (each under a local alias —
`makeDeps`/`parseDeps`/`makeParseDeps`/`v6ParseDeps`), yet each also declares
its own local wrapper reproducing exactly one of `parseDoc`/`parseTheta`/
`codesOf`'s bodies instead of importing the exported function.

## Evidence

`tests/helpers/e2e-s1.ts:46-70` (the three canonical exports):
```ts
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
...
export function parseTheta(path: string, src: string): ThetaDocument {
  const doc = parseDoc(src, path);
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture ${path} failed to parse: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}
...
export function codesOf(src: string, path = "test.theta"): string[] {
  return parseDoc(src, path).diagnostics.map((d: Diagnostic) => d.code);
}
```

`tests/session-control-parse.test.ts:43-51` (imports `parseDeps as makeDeps`
from the same module at line 30, then reimplements `parseDoc`+`codesOf`):
```ts
function parse(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeDeps());
}

/** The set of diagnostic codes the production parse aggregated for `src`. */
function codesOf(src: string): string[] {
  return parse(src).diagnostics.map((d: Diagnostic) => d.code);
}
```

`tests/session-control-dispatch.test.ts:62-73` (imports `parseDeps` from the
same module at line 34, then reimplements `parseTheta`):
```ts
function parseTheta(src: string): ThetaDocument {
  const source: ThetaSource = { path: "session-control-dispatch.theta", bytes: new TextEncoder().encode(src) };
  const doc = parseThetaDocument(source, parseDeps());
  const errors = doc.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(
      `fixture failed to parse clean: ${errors.map((d) => `${d.code}: ${d.message}`).join("; ")}`,
    );
  }
  return doc;
}
```

`tests/session-control-static-checks.test.ts:194-197` (imports `parseDeps as
makeParseDeps` at line 25, then reimplements `parseDoc`):
```ts
function parseSrc(src: string): ThetaDocument {
  const source: ThetaSource = { path: "test.theta", bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, makeParseDeps());
}
```

`tests/session-control-callable-set.test.ts:533-536` (imports `parseDeps as
v6ParseDeps` at line 20, then reimplements `parseDoc`):
```ts
function v6Parse(src: string): ThetaDocument {
  const source: ThetaSource = { path: "/thetadir/caller.theta", bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, v6ParseDeps());
}
```

For contrast, the sibling in-scope file `tests/schema-field-name-case.test.ts`
imports `parseDoc` directly (`import { parseDoc } from "./helpers/e2e-s1";`,
line 6) and calls it (`return parseDoc(FM + body);`, line 194) rather than
rebuilding it, showing the exported form already serves this exact call
shape.

Exact search: `grep -n "^function parse(src\|^function parseTheta(src\|^function parseSrc(src\|^function v6Parse(src" tests/session-control-*.test.ts` returns exactly the four declarations cited above, one per file.

## Why this is a problem
Each of the four files already imports `parseDeps` from
`tests/helpers/e2e-s1.ts` for the sole purpose of building the same
`ThetaSource` + `parseThetaDocument` call that module's own `parseDoc` (and,
for two of the four, `parseTheta`'s error-filter-and-throw wrapper) already
performs and exports. A change to the `ThetaSource` shape, the default path,
or the error-collection wording in `parseTheta` needs to be hand-applied at
up to four additional call sites that could instead have called the shared
export.

## Suggested direction (non-binding, optional)
`tests/helpers/e2e-s1.ts`'s exported `parseDoc`/`parseTheta`/`codesOf`
already cover the shape all four local wrappers reproduce; the sibling file
`schema-field-name-case.test.ts` already imports `parseDoc` directly rather
than rebuilding it, naming where the other four could point instead.

## False-positive check
- Gate-pin check: none of the four files match `*gate*.test.ts` or the named gate kin; no pinned count or inventory is touched.
- Recording-double check: none of `parse`/`parseTheta`/`parseSrc`/`v6Parse`/`codesOf` is a recording double or backs a "never called" witness; each is a plain wrapper over a real parse. Not applicable.
- docs/bugs/ signature search: `grep -rln "parseDoc\|parseTheta(" docs/bugs/*.md` returns hits only on unrelated production-symbol names (`ParsedFrontmatter`, etc.) via substring match on `parseTheta`-adjacent identifiers; none names any of the four local wrappers or states a rationale for re-deriving them instead of importing the shared export.
- coverage-matrix/bug-doc citation search: `grep -n "session-control-parse\.test\|session-control-dispatch\.test\|session-control-static-checks\.test\|session-control-callable-set\.test" docs/reference/coverage-matrix.md` returns no hits. This finding proposes no merge, rename, or deletion of any file, `it()`, or `describe()` — only that the duplicated wrapper functions could be imported.
- Coverage check: this finding is about a repeated helper-function DEFINITION that exists in all four files today; every call site of the local wrapper is already exercised by that file's own tests.
- Prior-filing overlap check: `quality/resolved/PTQ-0694-01-session-control-parsedeps-quadruplicated.md` (status: fixed) covers the SAME four files' independent redeclaration of `parseDeps()` itself under four different local names — already fixed, confirmed by each file's current import of `parseDeps` (aliased) from `tests/helpers/e2e-s1.ts`. That finding's evidence block cites only the `ParseThetaDocumentDeps`-builder bodies (`v6ParseDeps`/`parseDeps`/`makeDeps`/`makeParseDeps`), never the `parse`/`parseTheta`/`parseSrc`/`v6Parse`/`codesOf` wrapper functions cited here, which sit immediately below each of those (now-fixed) declarations and were left unaddressed by that fix. `grep -rl "function parse(src\|function parseTheta(src\|function parseSrc(src\|function v6Parse(src" quality/intake quality/issues quality/resolved` finds no other filing.

## Triage
<!-- appended by triage; do not edit above this line -->
verdict: confirmed — independently re-verified: all five excerpts match at the cited lines (parse:43-51, dispatch:62-73, static-checks:194-197, callable-set:533-536, e2e-s1.ts:46-70; the cited import lines drifted +5 to :25/:30 for callable-set/static-checks — immaterial), the four-file decl grep returns exactly one hit per file, all four already import `parseDeps` (aliased) from ./helpers/e2e-s1, a normalised scratch diff of dispatch's `parseTheta` against e2e-s1's `parseDoc`+`parseTheta` shows the same ThetaSource-build → parseThetaDocument → error-filter → throw logic differing only in path literal and message prefix (wording asserted nowhere: grep 'failed to parse' → only the throw itself), the three `parseDoc`-shaped wrappers are byte-identical bar name/path, every local is live (parse 4 / codesOf 10 / parseTheta 2 / parseSrc 7 / v6Parse 2 call sites), exported `parseDoc`/`codesOf` take a path parameter so every local path literal is covered, `parseTheta` export (118fa3e7 2026-09-17) post-dates the tests (6b219884 2026-09-16) explaining the omission; all locations under tests/, D7 boilerplate-duplication class, no carve-out (no *gate* file, plain wrappers not recording doubles, coverage-matrix and docs/bugs → 0 hits for the four filenames, no merge/rename/delete proposed); not a duplicate — resolved PTQ-0694 fixed only the `parseDeps()` builders in these files and its evidence never names these wrappers, PTQ-0731/0737/0405/0239 and same-wave d7-01-inbound-boundary are the same class at other files (per-file instances ruled distinct), and no open issue names the four session-control files for this shape (triage: claude-fable-5-1)
