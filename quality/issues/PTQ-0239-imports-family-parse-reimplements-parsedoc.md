---
id: PTQ-0239
title: b0303, b0304, b0305 and b0306 each redefine a local parse() reimplementing tests/helpers/e2e-s1.ts's parseDoc, despite already importing parseDeps from the same module
lens: D7                     # D2 | D7 — the lens that filed this
status: open
verdict: confirmed
locations:                   # every cited site, repo-relative path:line-range
  - tests/b0303-imported-fn-body-declaring-scope.test.ts:25,81-89
  - tests/b0304-transitive-lib-diagnostics.test.ts:12,132-140
  - tests/b0305-enum-alias-identity.test.ts:25,60-68
  - tests/b0306-imported-enum-wire-values.test.ts:25,59-65
  - tests/helpers/e2e-s1.ts:36-44
sites: 5
fix_scope: cross-module      # localized | module | cross-module — mechanical size proxy, NOT a priority
wave: qw20260912091742
reported_by: lens-d7-testquality (anthropic/claude-sonnet-5)
date: 2026-09-12
---

# b0303, b0304, b0305 and b0306 each redefine a local parse() reimplementing tests/helpers/e2e-s1.ts's parseDoc

## Observation
tests/b0303-imported-fn-body-declaring-scope.test.ts,
tests/b0304-transitive-lib-diagnostics.test.ts,
tests/b0305-enum-alias-identity.test.ts and
tests/b0306-imported-enum-wire-values.test.ts each import `parseDeps` from
`./helpers/e2e-s1` and then define their own module-scope `parse(source,
path)` function whose body — build a `ThetaSource`-shaped object from
UTF-8-encoded bytes and hand it to `parseThetaDocument` with `parseDeps()` —
is byte-for-byte identical across all four files. `tests/helpers/e2e-s1.ts`
already exports `parseDoc(src, path = "test.theta")`, performing the exact
same two operations in the exact same order over the exact same inputs, from
the very module each of the four files already imports `parseDeps` from.
None of the four imports `parseDoc` alongside `parseDeps`; each instead
layers its own identically-shaped `parseApp(body)` wrapper on top of its local
`parse`.

## Evidence
tests/b0303-imported-fn-body-declaring-scope.test.ts:25 (the import already in
place) and :81-89 (the reimplementation):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}
```

tests/b0304-transitive-lib-diagnostics.test.ts:12 and :132-140 — the identical
pair (confirmed via `diff` against the excerpt above: zero output):
```ts
import { parseDeps } from "./helpers/e2e-s1";
```
```ts
const APP_FRONTMATTER = ["---", 'model: "sonnet"', "mode: prompt", "---"].join("\n");

function parse(source: string, path: string): ThetaDocument {
  return parseThetaDocument({ path, bytes: new TextEncoder().encode(source) }, parseDeps());
}

function parseApp(body: string): ThetaDocument {
  return parse(`${APP_FRONTMATTER}\n${body}`, "/proj/app.theta");
}
```

tests/b0305-enum-alias-identity.test.ts:25 and :60-68, and
tests/b0306-imported-enum-wire-values.test.ts:25 and :59-65 — the same pair
again, also confirmed byte-identical via `diff` (the `parse`/`parseApp`
bodies; `APP_FRONTMATTER`'s literal string is identical in all four files).

tests/helpers/e2e-s1.ts:36-44 — the canonical helper already covering this
exact operation, from the exact module all four files already import
`parseDeps` from:
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

Exact searches run during this review: `grep -rl "^function parse(source:
string, path: string): ThetaDocument {" tests --include="*.test.ts"` → 13
files (the four above plus b0302, b0354, b0361, b0388, b0428,
import-export-from-clause-required, import-specifier-list-production-required,
import-specifier-separator-production-required,
reexport-chain-resolution.test.ts). Piping that same file list through `grep
-l 'from "./helpers/e2e-s1"'` returns the identical 13 files, i.e. every file
that redefines this `parse` wrapper already imports something else from the
module that exports its drop-in replacement.

## Why this is a problem
This is the "Copy-paste fixtures/doubles" class: each of the four reviewed
files already opens `tests/helpers/e2e-s1.ts` (for `parseDeps`) and, a few
lines later, re-derives that same module's adjacent `parseDoc` export under a
new local name and a required (rather than defaulted) second parameter — with
no behavioural difference at any of this file's own call sites, since every
call already supplies an explicit path. `tests/helpers/e2e-s1.ts`'s header
states it exists so "a test can assert on the returned diagnostics / tokens
without a model or session" via these exact wrapped entry points; `parseDoc`
is not a hypothetical extraction target but a live export already in scope
(via the `parseDeps` import) in each of the four files reviewed here.

## Suggested direction (non-binding, optional)
Importing `parseDoc` from `tests/helpers/e2e-s1.ts` alongside the `parseDeps`
import already present in each of the four files is the path 18 other test
files in the suite already take for the identical helper.

## False-positive check
- Gate-pin check: none of the four reviewed files, nor
  tests/helpers/e2e-s1.ts, matches `*gate*.test.ts` or the named kin; this
  finding does not touch a pinned count or inventory in any of them.
- Recording-double check: `parse`/`parseDoc` are parse-time wrappers, not
  recording doubles backing a "never called" witness; not applicable.
- docs/bugs/ signature search: docs/bugs/0303-imported-fn-body-resolves-in-caller-scope.md
  Status "fixed (0.291.0)"; docs/bugs/0304-transitive-lib-diagnostics-discarded.md
  Status "fixed (0.288.0)"; docs/bugs/0305-enum-identity-minted-from-alias.md
  Status "fixed (0.290.0)"; docs/bugs/0306-imported-enum-drops-explicit-wire-values.md
  Status "fixed (0.289.0)". `npx vitest run
  tests/b0303-imported-fn-body-declaring-scope.test.ts
  tests/b0304-transitive-lib-diagnostics.test.ts
  tests/b0305-enum-alias-identity.test.ts
  tests/b0306-imported-enum-wire-values.test.ts` → all green, 29/29 tests
  passing at HEAD, so none is a documented correct-reason red.
- coverage-matrix/bug-doc citation search: `grep -n
  "b0303-imported-fn-body-declaring-scope\|b0304-transitive-lib-diagnostics\|b0305-enum-alias-identity\|b0306-imported-enum-wire-values"
  docs/reference/coverage-matrix.md` → 0 hits. `grep -rl` for the same four
  filenames across docs/bugs/*.md (excluding each file's own bug doc) finds
  three other bug docs (0335, 0354, 0361) that mention one or more of these
  filenames as related/sibling context, not as a pinned witness list entry;
  this finding proposes no change to any `it()`/`describe()` name, count, or
  assertion in any of the four files, only to where the `parse` helper
  function is defined, so no citation is affected either way.
- Established-convention check: none of the four files' own comments frame
  `parse`/`parseApp` specifically as a deliberate divergence from `parseDoc`
  (the "mirrors `tests/reexport-chain-resolution.test.ts`" attributions in
  b0303/b0304 name other pieces — `measure()`, the `RuntimeOutcome` shape, the
  `fakeThetaLibFs` double — never the `parse` wrapper itself), so this is not
  a case of a self-documented, rationale-bearing project convention being
  proposed for reversal.
- Coverage check: the claim is about a repeated wrapper-function DEFINITION,
  not a missing test path; every copy is exercised by the tests in its own
  file.

## Triage
verdict: confirmed — every location, excerpt, and byte-identity claim reproduced independently (diff-equivalent `parse`/`parseApp`/`APP_FRONTMATTER` across all four files, all 29 tests green, docs/bugs statuses and coverage-matrix zero-hit both verified); the four files already import `parseDeps` from the exact module exporting the drop-in `parseDoc`, no comment anywhere frames the `parse` wrapper itself as a deliberate mirror (unlike the rejected d7-01/d7-03 precedents, where an explicit widely-cited convention or a false "no module exists" claim was present), and PTQ-0214 shows this exact class is a confirmed, fixable D7 copy-paste-double defect for a different file, so this is a new, non-duplicate instance (triage: claude-opus-5)
