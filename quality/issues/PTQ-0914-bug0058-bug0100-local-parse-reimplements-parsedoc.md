---
id: PTQ-0914
title: import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redefine a local parse() reimplementing tests/helpers/e2e-s1.ts's exported parseDoc
lens: D7                     # D2 | D4 | D7 | D8 | D9 - the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/import-export-from-clause-required.test.ts:9,187-189
  - tests/import-specifier-list-production-required.test.ts:8,247-249
  - tests/helpers/e2e-s1.ts:37-45
sites: 2
fix_scope: localized          # localized | module | cross-module - mechanical size proxy, NOT a priority
d4_class: clone
wave: qw20260918075903
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-18
---

# import-export-from-clause-required.test.ts and import-specifier-list-production-required.test.ts each redefine a local parse() reimplementing tests/helpers/e2e-s1.ts's exported parseDoc

## Observation
Both `tests/import-export-from-clause-required.test.ts` and
`tests/import-specifier-list-production-required.test.ts` import `parseDeps`
from `./helpers/e2e-s1` and then each declare their own module-scope
`parse(source, path)` function whose body — build a `ThetaSource`-shaped
object from UTF-8-encoded bytes and hand it to `parseThetaDocument` with
`parseDeps()` — is the same two-operation sequence, in the same order, over
the same two parameters, that `tests/helpers/e2e-s1.ts` already exports as
`parseDoc(src, path = "test.theta")` from the very module both files already
open for `parseDeps`. Neither file imports `parseDoc` alongside `parseDeps`,
and every call site in both files (`parseLib`, `parseApp`) already supplies
an explicit `path` argument, so `parseDoc`'s defaulted second parameter is
not a behavioural obstacle to using it.

## Evidence
`tests/import-export-from-clause-required.test.ts:9` (the import already in
place) and `:187-189` (the reimplementation):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}
```

`tests/import-specifier-list-production-required.test.ts:8` and `:247-249`
(byte-identical repeat):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}
```

The canonical, already-exported helper, `tests/helpers/e2e-s1.ts:37-45`:
```ts
/** Parse-theta-document deps whose seams are inert offline no-ops. */
export function parseDeps(): ParseThetaDocumentDeps {
  return { systemNote: inertSystemNote(), modelMatcher: resolvingMatcher };
}

/** Parse a UTF-8 `.theta` source string through the whole-document pipeline. */
export function parseDoc(src: string, path = "test.theta"): ThetaDocument {
  const source: ThetaSource = { path, bytes: new TextEncoder().encode(src) };
  return parseThetaDocument(source, parseDeps());
}
```

Exact search run: `grep -n "^function parse(source: string, path: string): ThetaDocument {" tests/import-export-from-clause-required.test.ts tests/import-specifier-list-production-required.test.ts` → one hit in each file (line 187 and line 247 respectively). `grep -n "parseDoc" tests/import-export-from-clause-required.test.ts tests/import-specifier-list-production-required.test.ts` → 0 hits in either (neither imports the canonical wrapper).

## Why this is a problem
`tests/helpers/e2e-s1.ts`'s exported `parseDoc` performs the identical
byte-encode-and-parse sequence both files' local `parse` functions retype,
from a module both files already open for `parseDeps` on the same import
line. The two local copies are themselves byte-identical to each other, so
the duplication exists both against the canonical helper and between the two
in-scope files.

## Suggested direction (non-binding, optional)
Importing `parseDoc` from `tests/helpers/e2e-s1.ts` alongside the
`parseDeps` import already present in both files is the path a large number
of other files already take for the identical helper.

## False-positive check
- Gate-pin check: neither file matches `*gate*.test.ts` or a listed gate
  kin; not a pinned-count/inventory gate.
- Recording-double check: `parse`/`parseDoc` are stateless parse-time
  wrappers, not recording doubles backing a "never called" witness; not
  applicable.
- docs/bugs/ signature search: `grep -n "parseDoc" docs/bugs/0058-fromless-export-form-parses-without-spec-production.md docs/bugs/0100-production-excluded-import-export-spellings-parse-clean.md` → 0 hits in either; neither bug document cites this local `parse` wrapper or attributes a deliberate reason for a copy diverging from the shared helper.
- coverage-matrix/bug-doc citation search: `grep -n "import-export-from-clause-required\|import-specifier-list-production-required" docs/reference/coverage-matrix.md` → 0 hits. Both files are cited by name inside their own bug documents' witness/tier sections (each names itself and its sibling as the "helper set" origin), but this finding proposes no rename, merge, or deletion of any `it()`/`describe()` — only relocating each file's local `parse` wrapper to the already-exported `parseDoc` — so those citations are unaffected.
- Duplicate-topic check: `grep -rl "local parse.*reimplements\|reimplements-parsedoc" quality/issues quality/resolved` shows PTQ-0239 (fixed, scoped to four b03xx files) and PTQ-0731 (open, scoped to `tests/import-specifier-separator-production-required.test.ts` only — a different file, the bug-0211 witness, not either file in this scope); neither filing's `locations` field names `import-export-from-clause-required.test.ts` or `import-specifier-list-production-required.test.ts`, so this is a distinct, unfiled instance of the same class at two different files.

## Triage
<!-- appended by triage -->
verdict: confirmed — independently re-verified: both local `parse()` excerpts reproduce verbatim at tests/import-export-from-clause-required.test.ts:187-189 and tests/import-specifier-list-production-required.test.ts:247-249 and `diff` of the two blocks is empty; canonical `parseDoc` is exported at tests/helpers/e2e-s1.ts:69-72 (filing's :37-45 is stale drift, content matches) from the module both files already open for `parseDeps` (:9 / :8); each copy is live with exactly two callers (`parseLib`/`parseApp` at :197/:205 and :258/:269) all passing an explicit path so `parseDoc` is a drop-in; `grep parseDoc` in both files → 0, exact `^function parse(source: string, path: string)` search → 1 hit each, `parseDoc` in docs/bugs/0058 and 0100 → 0, coverage-matrix → 0, neither file is a *gate* kin or recording double and no it()/describe() change is proposed; both locations under tests/, D7 boilerplate/copy-paste class; not a duplicate — resolved PTQ-0239's locations cover only b0303-b0306 and open PTQ-0731 covers only the separator file (naming the 0100 file solely as the comment's "helper set" origin), per the store's per-file convention this is a distinct unfiled instance; sibling intake d7-08 is the unrelated registry-oracle clone in the same files (triage: claude-fable-5-1)
